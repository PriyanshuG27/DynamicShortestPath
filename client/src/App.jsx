import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import GraphCanvas from "./GraphCanvas";
import Controls from "./Controls";
import SidePanel from "./SidePanel";

const API_BASE = "";
const SOCKET_BASE =
  typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:5000";

const INITIAL_NODES = [
  { id: 0, label: "A", dist: 0 },
  { id: 1, label: "B", dist: Infinity },
  { id: 2, label: "C", dist: Infinity },
  { id: 3, label: "D", dist: Infinity },
  { id: 4, label: "E", dist: Infinity },
  { id: 5, label: "F", dist: Infinity },
  { id: 6, label: "G", dist: Infinity },
  { id: 7, label: "H", dist: Infinity },
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

const INITIAL_STATS = {
  nodes: INITIAL_NODES.length,
  edges: INITIAL_EDGES.length,
  updates: 0,
  reEvaluated: 0,
};

const INITIAL_RESULTS = {
  dijkstraResult: null,
  standardResult: null,
  bellmanResult: null,
};

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildPath(prev, source, target) {
  if (!Array.isArray(prev) || source == null || target == null) {
    return [];
  }

  const path = [];
  const seen = new Set();
  let current = target;

  while (Number.isInteger(current) && current >= 0 && !seen.has(current)) {
    path.push(current);
    if (current === source) {
      return path.reverse();
    }
    seen.add(current);
    current = prev[current];
  }

  return [];
}

function edgeMatches(edge, u, v) {
  return (edge.a === u && edge.b === v) || (edge.a === v && edge.b === u);
}

function deriveSptEdgesFromPrev(prev, edges) {
  if (!Array.isArray(prev) || !Array.isArray(edges)) {
    return [];
  }

  const chosen = [];
  const seen = new Set();

  for (let node = 0; node < prev.length; node += 1) {
    const parent = prev[node];
    if (!Number.isInteger(parent) || parent < 0) {
      continue;
    }

    for (let idx = 0; idx < edges.length; idx += 1) {
      if (seen.has(idx)) {
        continue;
      }
      if (edgeMatches(edges[idx], node, parent)) {
        chosen.push(idx);
        seen.add(idx);
        break;
      }
    }
  }

  return chosen;
}

function makeLogEntry(event) {
  const type = String(event?.type || "event");
  const details = { ...event };
  delete details.type;
  delete details.dist;
  delete details.prev;

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    message: JSON.stringify(details),
  };
}

function cloneInitialNodes() {
  return INITIAL_NODES.map((node) => ({ ...node }));
}

function cloneInitialEdges() {
  return INITIAL_EDGES.map((edge) => ({ ...edge, inSPT: false }));
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
    throw new Error(data?.message || `request failed (${response.status})`);
  }

  return data;
}

export default function App() {
  const [nodes, setNodes] = useState(cloneInitialNodes);
  const [edges, setEdges] = useState(cloneInitialEdges);
  const [sptEdges, setSptEdges] = useState([]);
  const [visitingNodes, setVisitingNodes] = useState([]);
  const [optimalPath, setOptimalPath] = useState([]);
  const [flashingEdges, setFlashingEdges] = useState([]);
  const [log, setLog] = useState([]);
  const [stats, setStats] = useState(INITIAL_STATS);
  const [algoResults, setAlgoResults] = useState(INITIAL_RESULTS);
  const [source, setSource] = useState(0);
  const [mode, setMode] = useState("selective");
  const [showUncertainty, setShowUncertainty] = useState(true);
  const [risk, setRisk] = useState(1);
  const [speed, setSpeed] = useState(3);
  const [mapMode, setMapMode] = useState(false);
  const [nodeCoords, setNodeCoords] = useState({});
  const [edgeTypes, setEdgeTypes] = useState([]);
  const [baseEdges, setBaseEdges] = useState([]);
  const [edgeModal, setEdgeModal] = useState(null); // { edgeIdx, edgeA, edgeB, currentWeight }

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const speedRef = useRef(speed);
  const dijkstraQueueRef = useRef([]);
  const clearVisitTimerRef = useRef(null);
  const clearFlashTimerRef = useRef(null);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(
    () => () => {
      if (clearVisitTimerRef.current) {
        window.clearTimeout(clearVisitTimerRef.current);
      }
      if (clearFlashTimerRef.current) {
        window.clearTimeout(clearFlashTimerRef.current);
      }
    },
    []
  );

  const setEdgesWithRef = useCallback((nextEdges) => {
    edgesRef.current = nextEdges;
    setEdges(nextEdges);
  }, []);

  const applySpt = useCallback(
    (indices) => {
      const cleanIndices = safeArray(indices).map((x) => Number(x)).filter((x) => Number.isInteger(x));
      const indexSet = new Set(cleanIndices);
      const nextEdges = edgesRef.current.map((edge, idx) => ({
        ...edge,
        inSPT: indexSet.has(idx),
      }));

      setSptEdges(cleanIndices);
      setEdgesWithRef(nextEdges);
    },
    [setEdgesWithRef]
  );

  const applyDistances = useCallback((dist) => {
    const distArray = safeArray(dist);
    setNodes((prevNodes) =>
      prevNodes.map((node) => {
        const value = Number(distArray[node.id]);
        return {
          ...node,
          dist: Number.isFinite(value) ? value : Infinity,
        };
      })
    );
  }, []);

  const showVisiting = useCallback((nodeIds) => {
    const clean = safeArray(nodeIds).map((x) => Number(x)).filter((x) => Number.isInteger(x));
    if (clean.length === 0) {
      return;
    }

    setVisitingNodes(clean);
    if (clearVisitTimerRef.current) {
      window.clearTimeout(clearVisitTimerRef.current);
    }

    const ttl = Math.max(220, 900 - speedRef.current * 120);
    clearVisitTimerRef.current = window.setTimeout(() => {
      setVisitingNodes([]);
    }, ttl);
  }, []);

  const pushLog = useCallback((event) => {
    setLog((prev) => [makeLogEntry(event), ...prev].slice(0, 140));
  }, []);

  const resetLocalGraph = useCallback(() => {
    const baseNodes = cloneInitialNodes();
    const baseEdges = cloneInitialEdges();

    nodesRef.current = baseNodes;
    edgesRef.current = baseEdges;

    setNodes(baseNodes);
    setEdges(baseEdges);
    setSptEdges([]);
    setVisitingNodes([]);
    setOptimalPath([]);
    setFlashingEdges([]);
    setStats(INITIAL_STATS);
    setAlgoResults(INITIAL_RESULTS);
    setSource(0);
    dijkstraQueueRef.current = [];
  }, []);

  const handleCppEvent = useCallback(
    (event) => {
      if (!event || typeof event !== "object") {
        return;
      }

      const eventType = event.type;
      pushLog(event);

      if (eventType === "dijkstra_done") {
        const tag = dijkstraQueueRef.current.length > 0 ? dijkstraQueueRef.current.shift() : "dijkstra";
        const sourceId = Number.isInteger(event.source) ? event.source : source;

        if (tag === "dijkstra") {
          applyDistances(event.dist);
          applySpt(event.sptEdges);
          setSource(sourceId);

          const prev = safeArray(event.prev);
          const target = nodesRef.current.length - 1;
          setOptimalPath(buildPath(prev, sourceId, target));
        }

        setAlgoResults((prev) => {
          if (tag === "standard") {
            return { ...prev, standardResult: event };
          }
          return { ...prev, dijkstraResult: event };
        });
        return;
      }

      if (eventType === "bellman_done") {
        setAlgoResults((prev) => ({ ...prev, bellmanResult: event }));
        return;
      }

      if (eventType === "edge_update") {
        const edgeIdx = Number(event.edgeIdx);
        if (Number.isInteger(edgeIdx) && edgeIdx >= 0 && edgeIdx < edgesRef.current.length) {
          const nextEdges = edgesRef.current.map((edge, idx) =>
            idx === edgeIdx
              ? {
                  ...edge,
                  weight: toNumberOr(event.newWeight, edge.weight),
                  sigma: toNumberOr(event.newSigma, edge.sigma),
                }
              : edge
          );
          setEdgesWithRef(nextEdges);

          const prev = safeArray(event.prev);
          if (prev.length > 0) {
            applySpt(deriveSptEdgesFromPrev(prev, nextEdges));
            const sourceId = Number.isInteger(source) ? source : 0;
            const target = nodesRef.current.length - 1;
            setOptimalPath(buildPath(prev, sourceId, target));
          }
        }

        if (safeArray(event.dist).length > 0) {
          applyDistances(event.dist);
        }

        showVisiting(event.affectedNodes);
        setStats((prev) => ({
          ...prev,
          updates: prev.updates + 1,
          reEvaluated: prev.reEvaluated + toNumberOr(event.nodesRecomputed, 0),
        }));
        return;
      }

      if (eventType === "adversarial_update") {
        const edgeIdx = Number(event.edgeIdx);

        if (Number.isInteger(edgeIdx) && edgeIdx >= 0 && edgeIdx < edgesRef.current.length) {
          const touchedEdge = edgesRef.current[edgeIdx];
          const nextEdges = edgesRef.current.map((edge, idx) =>
            idx === edgeIdx ? { ...edge, weight: toNumberOr(event.newWeight, edge.weight) } : edge
          );
          setEdgesWithRef(nextEdges);

          setFlashingEdges([edgeIdx]);
          showVisiting([touchedEdge.a, touchedEdge.b]);

          if (clearFlashTimerRef.current) {
            window.clearTimeout(clearFlashTimerRef.current);
          }
          clearFlashTimerRef.current = window.setTimeout(() => {
            setFlashingEdges([]);
          }, Math.max(260, 860 - speedRef.current * 120));
        }

        setStats((prev) => ({ ...prev, updates: prev.updates + 1 }));
        return;
      }

      if (eventType === "random_update") {
        const edgeIdx = Number(event.edgeIdx);
        if (Number.isInteger(edgeIdx) && edgeIdx >= 0 && edgeIdx < edgesRef.current.length) {
          const touchedEdge = edgesRef.current[edgeIdx];
          const nextEdges = edgesRef.current.map((edge, idx) =>
            idx === edgeIdx
              ? {
                  ...edge,
                  weight: toNumberOr(event.newWeight, edge.weight),
                  sigma: toNumberOr(event.newSigma, edge.sigma),
                }
              : edge
          );
          setEdgesWithRef(nextEdges);
          showVisiting([touchedEdge.a, touchedEdge.b]);
        }

        setStats((prev) => ({ ...prev, updates: prev.updates + 1 }));
        return;
      }

      if (eventType === "batch_done") {
        setStats((prev) => ({
          ...prev,
          updates: prev.updates + toNumberOr(event.totalUpdates, 0),
          reEvaluated: prev.reEvaluated + toNumberOr(event.nodesRecomputed, 0),
        }));
        return;
      }

      if (eventType === "graph_meta") {
        const coords = {};
        safeArray(event.nodeCoords).forEach(([id, lat, lng]) => {
          coords[id] = { lat, lng };
        });
        setNodeCoords(coords);
        setMapMode(true);

        // Store node labels from landmark data
        const labels = event.nodeLabels || {};
        setNodes((prev) =>
          prev.map((n) => ({
            ...n,
            label: labels[n.id] || n.label,
          }))
        );

        // Store edge road types for traffic scenarios
        if (Array.isArray(event.edgeTypes)) {
          setEdgeTypes(event.edgeTypes);
        }
      }
    },
    [applyDistances, applySpt, pushLog, setEdgesWithRef, showVisiting, source]
  );

  useEffect(() => {
    const socket = io(SOCKET_BASE, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });

    socket.on("cpp_event", handleCppEvent);

    return () => {
      socket.off("cpp_event", handleCppEvent);
      socket.disconnect();
    };
  }, [handleCppEvent]);

  const queueDijkstraRun = useCallback(async (tag, payload) => {
    dijkstraQueueRef.current.push(tag);
    try {
      await postJson("/api/run", payload);
    } catch (error) {
      const idx = dijkstraQueueRef.current.lastIndexOf(tag);
      if (idx >= 0) {
        dijkstraQueueRef.current.splice(idx, 1);
      }
      throw error;
    }
  }, []);

  const initGraph = useCallback(async () => {
    const edgeTuples = INITIAL_EDGES.map((edge) => [edge.a, edge.b, edge.weight, edge.sigma]);
    await postJson("/api/run", {
      cmd: "init",
      nodes: INITIAL_NODES.length,
      edges: edgeTuples,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        await initGraph();
        if (!cancelled) {
          resetLocalGraph();
          pushLog({ type: "init", message: "demo graph loaded" });
        }
      } catch (error) {
        if (!cancelled) {
          pushLog({ type: "err", message: error.message });
        }
      }
    };

    boot();

    return () => {
      cancelled = true;
    };
  }, [initGraph, pushLog, resetLocalGraph]);

  const onLoadOsm = useCallback(async () => {
    try {
      const data = await postJson("/api/load_osm", { max_nodes: 50, rebuild: false });

      const graphData = data?.graph;
      if (graphData) {
        const n = graphData.nodes || 0;
        const newNodes = [];
        for (let i = 0; i < n; i++) {
          newNodes.push({ id: i, label: `N${i}`, dist: Infinity });
        }
        if (newNodes.length > 0) {
          newNodes[0].dist = 0;
        }

        const newEdges = safeArray(graphData.edges).map(([a, b, weight, sigma]) => ({
          a, b, weight, sigma, inSPT: false,
        }));

        nodesRef.current = newNodes;
        edgesRef.current = newEdges;
        setNodes(newNodes);
        setEdges(newEdges);
        setBaseEdges(newEdges.map((e) => ({ ...e })));
        setSptEdges([]);
        setVisitingNodes([]);
        setOptimalPath([]);
        setFlashingEdges([]);
        setStats({ nodes: n, edges: newEdges.length, updates: 0, reEvaluated: 0 });
        setAlgoResults(INITIAL_RESULTS);
        setSource(0);
        dijkstraQueueRef.current = [];
      }
    } catch (err) {
      pushLog({ type: "err", message: err.message });
    }
  }, [pushLog]);

  // ── Traffic scenario presets ────────────────────────────────────
  const onTrafficScenario = useCallback(
    async (scenario) => {
      try {
        const base = baseEdges.length > 0 ? baseEdges : edgesRef.current;
        const updates = [];

        base.forEach((edge, idx) => {
          const roadType = edgeTypes[idx] || "secondary";
          let wMul = 1;
          let sMul = 1;

          if (scenario === "rush_hour") {
            if (roadType === "motorway" || roadType === "primary") {
              wMul = 2.5;
              sMul = 1.5;
            } else {
              wMul = 1.8;
              sMul = 1.2;
            }
          } else if (scenario === "rain") {
            if (roadType === "residential" || roadType === "secondary") {
              wMul = 2.0;
              sMul = 2.0;
            } else {
              wMul = 1.3;
              sMul = 1.5;
            }
          } else if (scenario === "roadwork") {
            // Block 3 random edges
            if (idx % 5 === 0) {
              wMul = 10;
              sMul = 3;
            }
          }
          // scenario === 'clear' → wMul=1, sMul=1 (reset)

          const newW = Number((edge.weight * wMul).toFixed(2));
          const newS = Number(Math.min(2.0, edge.sigma * sMul).toFixed(2));
          updates.push([idx, newW, newS]);
        });

        await postJson("/api/batch", { updates, k: risk });

        // Update local state
        const nextEdges = edgesRef.current.map((edge, idx) => {
          const [, newW, newS] = updates[idx];
          return { ...edge, weight: newW, sigma: newS, inSPT: false };
        });
        setEdgesWithRef(nextEdges);
        setSptEdges([]);
        setStats((prev) => ({ ...prev, updates: prev.updates + updates.length }));

        pushLog({
          type: "traffic",
          message: `Applied ${scenario} scenario to ${updates.length} edges`,
        });

        // Re-run Dijkstra
        await queueDijkstraRun("dijkstra", { cmd: "run_dijkstra", source, k: risk });
        await queueDijkstraRun("standard", { cmd: "run_standard", source });
        await postJson("/api/run", { cmd: "run_bellman", source });
      } catch (error) {
        pushLog({ type: "err", message: error.message });
      }
    },
    [baseEdges, edgeTypes, pushLog, queueDijkstraRun, risk, setEdgesWithRef, source]
  );

  // ── Edge click handler — opens in-page modal ──────────────────
  const onEdgeClick = useCallback(
    (edgeIdx) => {
      if (edgeIdx < 0 || edgeIdx >= edgesRef.current.length) return;
      const current = edgesRef.current[edgeIdx];
      setEdgeModal({
        edgeIdx,
        edgeA: current.a,
        edgeB: current.b,
        currentWeight: current.weight,
      });
    },
    []
  );

  const onEdgeModalSubmit = useCallback(
    async (newWeight) => {
      if (!edgeModal) return;
      setEdgeModal(null);
      const { edgeIdx } = edgeModal;
      if (!Number.isFinite(newWeight) || newWeight <= 0) return;
      const current = edgesRef.current[edgeIdx];
      if (!current) return;
      try {
        await postJson("/api/update", {
          edgeIdx,
          weight: newWeight,
          sigma: current.sigma,
          mode: "selective",
          k: risk,
        });
        pushLog({ type: "edge_edit", message: `Edge ${current.a}↔${current.b}: ${current.weight} → ${newWeight}` });
      } catch (error) {
        pushLog({ type: "err", message: error.message });
      }
    },
    [edgeModal, pushLog, risk]
  );

  const onRun = useCallback(async () => {
    try {
      await queueDijkstraRun("dijkstra", { cmd: "run_dijkstra", source, k: risk });
      await queueDijkstraRun("standard", { cmd: "run_standard", source });
      await postJson("/api/run", { cmd: "run_bellman", source });
    } catch (error) {
      pushLog({ type: "err", message: error.message });
    }
  }, [queueDijkstraRun, pushLog, risk, source]);

  // ── Feature: Live k-slider auto-rerun ──────────────────────────
  const hasRunOnceRef = useRef(false);
  useEffect(() => {
    // Don't auto-run on mount or if graph isn't initialized
    if (!hasRunOnceRef.current || edgesRef.current.length === 0) {
      return;
    }
    const timer = setTimeout(() => {
      queueDijkstraRun("dijkstra", { cmd: "run_dijkstra", source, k: risk }).catch(() => {});
      queueDijkstraRun("standard", { cmd: "run_standard", source }).catch(() => {});
      postJson("/api/run", { cmd: "run_bellman", source }).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [risk]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark that user has run at least once
  const originalOnRun = onRun;
  const onRunTracked = useCallback(async () => {
    hasRunOnceRef.current = true;
    await originalOnRun();
  }, [originalOnRun]);

  const onReset = useCallback(async () => {
    try {
      if (mapMode && edgesRef.current.length > 10) {
        // In map mode: re-init C++ with the landmark graph, don't fall back to demo
        await onLoadOsm();
        pushLog({ type: "reset", message: "Map graph reloaded" });
      } else {
        await postJson("/api/reset", {});
        resetLocalGraph();
        pushLog({ type: "reset", message: "Demo graph reset" });
      }
    } catch (error) {
      pushLog({ type: "err", message: error.message });
    }
  }, [mapMode, onLoadOsm, pushLog, resetLocalGraph]);

  const onEdgeUpdate = useCallback(async () => {
    try {
      if (edgesRef.current.length === 0) {
        return;
      }

      const edgeIdx = Math.floor(Math.random() * edgesRef.current.length);
      const current = edgesRef.current[edgeIdx];

      const newWeight = Number((current.weight * (0.7 + Math.random() * 0.8)).toFixed(2));
      const newSigma = Number(
        Math.max(0.1, Math.min(1.8, current.sigma + (Math.random() - 0.5) * 0.4)).toFixed(2)
      );

      await postJson("/api/update", {
        edgeIdx,
        weight: newWeight,
        sigma: newSigma,
        mode: "selective",
        k: risk,
      });

      if (mode === "full") {
        await queueDijkstraRun("dijkstra", { cmd: "run_dijkstra", source, k: risk });
      }
    } catch (error) {
      pushLog({ type: "err", message: error.message });
    }
  }, [mode, pushLog, queueDijkstraRun, risk, source]);

  const onAdversarial = useCallback(async () => {
    try {
      await postJson("/api/adversarial", { k: risk });

      if (mode === "full") {
        await queueDijkstraRun("dijkstra", { cmd: "run_dijkstra", source, k: risk });
      }
    } catch (error) {
      pushLog({ type: "err", message: error.message });
    }
  }, [mode, pushLog, queueDijkstraRun, risk, source]);

  const onBatch = useCallback(async () => {
    try {
      const count = Math.min(3, edgesRef.current.length);
      const updates = [];

      for (let i = 0; i < count; i += 1) {
        const edge = edgesRef.current[i];
        updates.push([
          i,
          Number((edge.weight * (1.1 + i * 0.15)).toFixed(2)),
          Number(Math.max(0.1, edge.sigma + 0.2).toFixed(2)),
        ]);
      }

      await postJson("/api/batch", { updates, k: risk });

      if (mode === "full") {
        await queueDijkstraRun("dijkstra", { cmd: "run_dijkstra", source, k: risk });
      }
    } catch (error) {
      pushLog({ type: "err", message: error.message });
    }
  }, [mode, pushLog, queueDijkstraRun, risk, source]);

  const controlsNodes = useMemo(() => nodes, [nodes]);

  // ── Feature: Path reliability score ────────────────────────────
  const reliability = useMemo(() => {
    if (optimalPath.length < 2) return null;
    let sigmaSum = 0;
    for (let i = 0; i < optimalPath.length - 1; i++) {
      const a = optimalPath[i];
      const b = optimalPath[i + 1];
      const edge = edges.find(
        (e) => (e.a === a && e.b === b) || (e.a === b && e.b === a)
      );
      if (edge) sigmaSum += edge.sigma;
    }
    return Math.round((1 / (1 + sigmaSum)) * 100);
  }, [optimalPath, edges]);

  // ── Feature: Efficiency percentage ─────────────────────────────
  // totalPossible = updates × nodes (what full recompute would touch)
  // totalActual = reEvaluated (what selective actually touched)
  const efficiency = useMemo(() => {
    if (stats.updates <= 0 || stats.nodes <= 0) return null;
    const totalPossible = stats.updates * stats.nodes;
    const totalActual = stats.reEvaluated;
    const pct = Math.round(((totalPossible - totalActual) / totalPossible) * 100);
    return Math.max(0, Math.min(100, pct));
  }, [stats.updates, stats.nodes, stats.reEvaluated]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>Dynamic Shortest Path on Probabilistic Graphs</h1>
      </header>

      <main className="main-grid">
        <section className="canvas-panel">
          <GraphCanvas
            nodes={nodes}
            edges={edges}
            sptEdges={sptEdges}
            visitingNodes={visitingNodes}
            optimalPath={optimalPath}
            flashingEdges={flashingEdges}
            showUncertainty={showUncertainty}
            mapMode={mapMode}
            nodeCoords={nodeCoords}
            onEdgeClick={onEdgeClick}
          />
        </section>

        <SidePanel
          algoResults={algoResults}
          stats={stats}
          log={log}
          reliability={reliability}
          efficiency={efficiency}
        />
      </main>

      <Controls
        onRun={onRunTracked}
        onReset={onReset}
        onEdgeUpdate={onEdgeUpdate}
        onAdversarial={onAdversarial}
        onBatch={onBatch}
        onToggleUncertainty={() => setShowUncertainty((value) => !value)}
        onSourceChange={setSource}
        onModeChange={setMode}
        onRiskChange={setRisk}
        onSpeedChange={setSpeed}
        nodes={controlsNodes}
        source={source}
        mode={mode}
        risk={risk}
        speed={speed}
        onLoadMap={onLoadOsm}
        mapMode={mapMode}
        onMapModeChange={setMapMode}
        onTrafficScenario={onTrafficScenario}
      />

      {/* ── Edge Weight Modal ── */}
      {edgeModal && (
        <EdgeWeightModal
          edgeA={edgeModal.edgeA}
          edgeB={edgeModal.edgeB}
          currentWeight={edgeModal.currentWeight}
          onSubmit={onEdgeModalSubmit}
          onCancel={() => setEdgeModal(null)}
        />
      )}
    </div>
  );
}

function EdgeWeightModal({ edgeA, edgeB, currentWeight, onSubmit, onCancel }) {
  const [value, setValue] = useState(String(currentWeight));
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = () => {
    const n = parseFloat(value);
    if (Number.isFinite(n) && n > 0) onSubmit(n);
    else onCancel();
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Edit Edge Weight</div>
        <div className="modal-subtitle">
          Node {edgeA} ↔ Node {edgeB}
        </div>
        <div className="modal-current">Current: {currentWeight}</div>
        <input
          ref={inputRef}
          className="modal-input"
          type="number"
          step="0.1"
          min="0.1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") onCancel();
          }}
        />
        <div className="modal-actions">
          <button className="modal-btn modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="modal-btn modal-apply" onClick={handleSubmit}>Apply</button>
        </div>
      </div>
    </div>
  );
}