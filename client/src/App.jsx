import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import GraphCanvas from "./GraphCanvas";
import Controls from "./Controls";
import SidePanel from "./SidePanel";

const API_BASE = "http://127.0.0.1:5000";

const INITIAL_NODES = [
  { id: 0, label: "A", isSource: true, dist: 0 },
  { id: 1, label: "B", dist: Infinity },
  { id: 2, label: "C", dist: Infinity },
  { id: 3, label: "D", dist: Infinity },
  { id: 4, label: "E", dist: Infinity },
  { id: 5, label: "F", dist: Infinity },
  { id: 6, label: "G", dist: Infinity },
  { id: 7, label: "H", isTarget: true, dist: Infinity },
];

const INITIAL_EDGES = [
  { a: 0, b: 1, weight: 4.0, sigma: 0.8, inSPT: false },
  { a: 0, b: 2, weight: 3.0, sigma: 0.5, inSPT: false },
  { a: 1, b: 3, weight: 2.0, sigma: 0.4, inSPT: false },
  { a: 2, b: 3, weight: 1.2, sigma: 0.9, inSPT: false },
  { a: 2, b: 4, weight: 2.7, sigma: 1.1, inSPT: false },
  { a: 3, b: 5, weight: 2.3, sigma: 0.6, inSPT: false },
  { a: 4, b: 6, weight: 1.8, sigma: 0.7, inSPT: false },
  { a: 5, b: 7, weight: 2.2, sigma: 0.6, inSPT: false },
  { a: 6, b: 7, weight: 1.1, sigma: 0.5, inSPT: false },
  { a: 1, b: 4, weight: 3.4, sigma: 0.9, inSPT: false },
  { a: 0, b: 5, weight: 6.2, sigma: 1.3, inSPT: false },
];

function useSocket(onEvent) {
  useEffect(() => {
    const socket = io(API_BASE, {
      transports: ["websocket", "polling"],
    });

    socket.on("cpp_event", onEvent);

    return () => {
      socket.off("cpp_event", onEvent);
      socket.disconnect();
    };
  }, [onEvent]);
}

function safeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

function buildPath(prev, source, target) {
  if (!Array.isArray(prev) || source == null || target == null) {
    return [];
  }

  const path = [];
  const seen = new Set();
  let cur = target;

  while (typeof cur === "number" && cur >= 0 && !seen.has(cur)) {
    path.push(cur);
    if (cur === source) {
      return path.reverse();
    }
    seen.add(cur);
    cur = prev[cur];
  }

  return [];
}

function chooseTarget(dist, source) {
  let best = null;
  let bestValue = -Infinity;
  dist.forEach((value, idx) => {
    if (idx === source || !Number.isFinite(value)) {
      return;
    }
    if (value > bestValue) {
      bestValue = value;
      best = idx;
    }
  });
  return best;
}

function makeLogEntry(event) {
  const type = event?.type || "event";
  const compact = { ...event };
  delete compact.type;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    message: JSON.stringify(compact),
  };
}

async function postJson(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const msg = data?.message || `request failed (${response.status})`;
    throw new Error(msg);
  }
  return data;
}

export default function App() {
  const [nodes, setNodes] = useState(INITIAL_NODES);
  const [edges, setEdges] = useState(INITIAL_EDGES);
  const [sptEdges, setSptEdges] = useState([]);
  const [visitingNodes, setVisitingNodes] = useState([]);
  const [optimalPath, setOptimalPath] = useState([]);
  const [flashingEdges, setFlashingEdges] = useState([]);
  const [log, setLog] = useState([]);
  const [stats, setStats] = useState({
    nodes: INITIAL_NODES.length,
    edges: INITIAL_EDGES.length,
    updates: 0,
    reEvaluated: 0,
  });
  const [algoResults, setAlgoResults] = useState({
    dijkstraResult: null,
    standardResult: null,
    bellmanResult: null,
  });

  const [source, setSource] = useState(0);
  const [mode, setMode] = useState("selective");
  const [showUncertainty, setShowUncertainty] = useState(true);
  const [risk, setRisk] = useState(1.0);
  const [speed, setSpeed] = useState(3);

  const canvasRef = useRef(null);
  const speedRef = useRef(speed);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const applyDistances = useCallback((dist) => {
    setNodes((prevNodes) =>
      prevNodes.map((n) => ({
        ...n,
        dist: typeof dist[n.id] === "number" ? dist[n.id] : Infinity,
      }))
    );
  }, []);

  const updateEdgeValues = useCallback((edgeIdx, newWeight, newSigma) => {
    setEdges((prevEdges) =>
      prevEdges.map((e, idx) =>
        idx === edgeIdx
          ? {
              ...e,
              weight: typeof newWeight === "number" ? newWeight : e.weight,
              sigma: typeof newSigma === "number" ? newSigma : e.sigma,
            }
          : e
      )
    );
  }, []);

  const pushLog = useCallback((event) => {
    setLog((prev) => [makeLogEntry(event), ...prev].slice(0, 120));
  }, []);

  const handleSocketEvent = useCallback(
    (event) => {
      if (!event || typeof event !== "object") {
        return;
      }

      const eventType = event.type;
      pushLog(event);

      if (
        eventType === "dijkstra_done" ||
        eventType === "standard_done" ||
        eventType === "bellman_done"
      ) {
        const dist = safeArray(event.dist);
        const prev = safeArray(event.prev);
        const sourceId = typeof event.source === "number" ? event.source : source;

        applyDistances(dist);
        setSource(sourceId);

        const target = chooseTarget(dist, sourceId);
        setOptimalPath(buildPath(prev, sourceId, target));

        const nextSpt = safeArray(event.sptEdges).map((x) => Number(x));
        if (eventType !== "bellman_done") {
          setSptEdges(nextSpt.filter((x) => Number.isFinite(x)));
          setEdges((prevEdges) =>
            prevEdges.map((edge, idx) => ({ ...edge, inSPT: nextSpt.includes(idx) }))
          );
        }

        setAlgoResults((prevResults) => {
          if (eventType === "dijkstra_done") {
            if (Math.abs(risk) > 1e-9) {
              return { ...prevResults, dijkstraResult: event };
            }
            return { ...prevResults, standardResult: event };
          }
          if (eventType === "standard_done") {
            return { ...prevResults, standardResult: event };
          }
          return { ...prevResults, bellmanResult: event };
        });
      }

      if (eventType === "edge_update") {
        const edgeIdx = Number(event.edgeIdx);
        if (Number.isFinite(edgeIdx)) {
          updateEdgeValues(edgeIdx, event.newWeight, event.newSigma);
        }

        const affected = safeArray(event.affectedNodes).map((x) => Number(x));
        const validAffected = affected.filter((x) => Number.isFinite(x));

        if (validAffected.length > 0) {
          setVisitingNodes(validAffected);
          validAffected.forEach((id) => {
            if (canvasRef.current?.triggerRipple) {
              canvasRef.current.triggerRipple(id);
            }
          });

          const ttl = Math.max(220, 900 - speedRef.current * 120);
          window.setTimeout(() => setVisitingNodes([]), ttl);
        }

        setStats((s) => ({
          ...s,
          updates: s.updates + 1,
          reEvaluated: s.reEvaluated + (Number(event.nodesRecomputed) || 0),
        }));
      }

      if (eventType === "adversarial" || eventType === "adversarial_update") {
        const edgeIdx = Number(event.edgeIdx);
        if (Number.isFinite(edgeIdx)) {
          setFlashingEdges([edgeIdx]);
          window.setTimeout(() => {
            updateEdgeValues(edgeIdx, event.newWeight, null);
            setFlashingEdges([]);
          }, 260);
        }
        setStats((s) => ({ ...s, updates: s.updates + 1 }));
      }

      if (eventType === "random_update") {
        const edgeIdx = Number(event.edgeIdx);
        if (Number.isFinite(edgeIdx)) {
          updateEdgeValues(edgeIdx, event.newWeight, event.newSigma);
        }
        setStats((s) => ({ ...s, updates: s.updates + 1 }));
      }

      if (eventType === "batch_done") {
        setStats((s) => ({
          ...s,
          updates: s.updates + (Number(event.totalUpdates) || 0),
          reEvaluated: s.reEvaluated + (Number(event.nodesRecomputed) || 0),
        }));
      }
    },
    [applyDistances, pushLog, risk, source, updateEdgeValues]
  );

  useSocket(handleSocketEvent);

  const runInit = useCallback(async () => {
    const edgeTuples = INITIAL_EDGES.map((e) => [e.a, e.b, e.weight, e.sigma]);
    await postJson("/api/run", {
      cmd: "init",
      nodes: INITIAL_NODES.length,
      edges: edgeTuples,
    });
  }, []);

  useEffect(() => {
    runInit().catch((err) => pushLog({ type: "err", message: err.message }));
  }, [runInit, pushLog]);

  const onRun = useCallback(async () => {
    try {
      if (mode === "full") {
        await postJson("/api/run", { cmd: "run_bellman", source });
      } else if (Math.abs(risk) <= 1e-9) {
        await postJson("/api/run", { cmd: "run_standard", source });
      } else {
        await postJson("/api/run", { cmd: "run_dijkstra", source, k: risk });
      }
    } catch (err) {
      pushLog({ type: "err", message: err.message });
    }
  }, [mode, source, risk, pushLog]);

  const onReset = useCallback(async () => {
    try {
      await postJson("/api/reset", {});
      setNodes(INITIAL_NODES);
      setEdges(INITIAL_EDGES);
      setSptEdges([]);
      setOptimalPath([]);
      setVisitingNodes([]);
      setFlashingEdges([]);
      setStats({
        nodes: INITIAL_NODES.length,
        edges: INITIAL_EDGES.length,
        updates: 0,
        reEvaluated: 0,
      });
      setAlgoResults({ dijkstraResult: null, standardResult: null, bellmanResult: null });
    } catch (err) {
      pushLog({ type: "err", message: err.message });
    }
  }, [pushLog]);

  const onAdversarial = useCallback(async () => {
    try {
      await postJson("/api/adversarial", { k: risk });
    } catch (err) {
      pushLog({ type: "err", message: err.message });
    }
  }, [risk, pushLog]);

  const onRandom = useCallback(async () => {
    try {
      await postJson("/api/random", {});
    } catch (err) {
      pushLog({ type: "err", message: err.message });
    }
  }, [pushLog]);

  const onBatch = useCallback(async () => {
    try {
      const randomUpdates = edges.slice(0, 3).map((e, idx) => [
        idx,
        Number((e.weight * (1.05 + idx * 0.17)).toFixed(1)),
        Number((Math.max(0.1, e.sigma + 0.2)).toFixed(1)),
      ]);
      await postJson("/api/batch", { updates: randomUpdates, k: risk });
    } catch (err) {
      pushLog({ type: "err", message: err.message });
    }
  }, [edges, risk, pushLog]);

  const toggleUncertainty = useCallback(() => {
    setShowUncertainty((v) => !v);
  }, []);

  const modeValue = useMemo(() => mode, [mode]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>Dynamic Shortest Path Analysis</h1>
        <div className="meta">Probabilistic graph updates with adversarial controls</div>
      </header>

      <main className="main-grid">
        <section className="canvas-panel">
          <GraphCanvas
            ref={canvasRef}
            nodes={nodes}
            edges={edges}
            sptEdges={sptEdges}
            visitingNodes={visitingNodes}
            optimalPath={optimalPath}
            flashingEdges={flashingEdges}
            showUncertainty={showUncertainty}
            onNodeClick={(node) =>
              pushLog({
                type: "hover",
                nodeId: node.id,
                label: node.label,
              })
            }
          />
        </section>

        <SidePanel
          dijkstraResult={algoResults.dijkstraResult}
          standardResult={algoResults.standardResult}
          bellmanResult={algoResults.bellmanResult}
          stats={stats}
          log={log}
        />
      </main>

      <Controls
        onRun={onRun}
        onReset={onReset}
        onAdversarial={onAdversarial}
        onRandom={onRandom}
        onBatch={onBatch}
        onToggleUncertainty={toggleUncertainty}
        onModeChange={setMode}
        onSourceChange={setSource}
        onRiskChange={setRisk}
        onSpeedChange={setSpeed}
        nodes={nodes}
        source={source}
        mode={modeValue}
        showUncertainty={showUncertainty}
      />
    </div>
  );
}
