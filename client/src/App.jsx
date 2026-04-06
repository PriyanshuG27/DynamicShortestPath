import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import GraphCanvas from "./GraphCanvas";
import Controls from "./Controls";
import SidePanel from "./SidePanel";
import MapOnboarding from "./MapOnboarding";
import MapEditor from "./MapEditor";

const API_BASE = "";
const SOCKET_BASE = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:5000";
const PANEL_STATE_KEY = "dsp_panel_state_v1";
const MAP_ONBOARDING_KEY = "dsp_map_intro_seen_v1";
const EDGE_DELTA_TTL_MS = 8000;
const DEFAULT_TRAFFIC_INTERVAL_MS = 2500;

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

function makeNodeLabel(id) {
  if (id >= 0 && id < 26) {
    return String.fromCharCode(65 + id);
  }
  return `N${id}`;
}

function normalizeEdgeTuple(tuple) {
  if (!Array.isArray(tuple)) {
    return [0, 0, 1, 0.1];
  }

  const a = Number(tuple[0]);
  const b = Number(tuple[1]);
  const weight = Number(tuple[2]);
  const sigma = Number(tuple[3]);

  return [
    Number.isFinite(a) ? a : 0,
    Number.isFinite(b) ? b : 0,
    Number.isFinite(weight) ? weight : 1,
    Number.isFinite(sigma) ? sigma : 0.1,
  ];
}

function buildNodesFromCount(nodeCount, sourceId = 0) {
  const count = Math.max(1, Math.floor(Number(nodeCount) || 1));
  return Array.from({ length: count }, (_, id) => ({
    id,
    label: makeNodeLabel(id),
    isSource: id === sourceId,
    isTarget: id === count - 1,
    dist: id === sourceId ? 0 : Infinity,
  }));
}

function buildEdgesFromTuples(edgeTuples) {
  if (!Array.isArray(edgeTuples)) {
    return [];
  }

  return edgeTuples.map((tuple) => {
    const [a, b, weight, sigma] = normalizeEdgeTuple(tuple);
    return {
      a,
      b,
      weight,
      sigma,
      inSPT: false,
    };
  });
}

function useSocket(onEvent) {
  useEffect(() => {
    const socket = io(SOCKET_BASE, {
      path: "/socket.io",
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

function readPanelState() {
  if (typeof window === "undefined") {
    return {
      showLeftPanel: true,
      showRightPanel: true,
      showBottomPanel: true,
    };
  }

  try {
    const raw = window.sessionStorage.getItem(PANEL_STATE_KEY);
    if (!raw) {
      return {
        showLeftPanel: true,
        showRightPanel: true,
        showBottomPanel: true,
      };
    }

    const parsed = JSON.parse(raw);
    return {
      showLeftPanel: parsed?.showLeftPanel !== false,
      showRightPanel: parsed?.showRightPanel !== false,
      showBottomPanel: parsed?.showBottomPanel !== false,
    };
  } catch {
    return {
      showLeftPanel: true,
      showRightPanel: true,
      showBottomPanel: true,
    };
  }
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
  const [baseGraphSpec, setBaseGraphSpec] = useState(() => ({
    nodes: INITIAL_NODES.length,
    edges: INITIAL_EDGES.map((e) => [e.a, e.b, e.weight, e.sigma]),
  }));

  const [source, setSource] = useState(0);
  const [mode, setMode] = useState("selective");
  const [showUncertainty, setShowUncertainty] = useState(true);
  const [risk, setRisk] = useState(1.0);
  const [speed, setSpeed] = useState(3);
  const [showLeftPanel, setShowLeftPanel] = useState(() => readPanelState().showLeftPanel);
  const [showRightPanel, setShowRightPanel] = useState(() => readPanelState().showRightPanel);
  const [showBottomPanel, setShowBottomPanel] = useState(() => readPanelState().showBottomPanel);
  const [trafficMode, setTrafficMode] = useState(false);
  const [trafficIntervalMs, setTrafficIntervalMs] = useState(DEFAULT_TRAFFIC_INTERVAL_MS);
  const [trafficCycles, setTrafficCycles] = useState(0);
  const [trafficSptChanges, setTrafficSptChanges] = useState(0);
  const [mapMaxNodes, setMapMaxNodes] = useState(50);
  const [mapRebuild, setMapRebuild] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [showMapOnboarding, setShowMapOnboarding] = useState(false);
  const [showMapEditor, setShowMapEditor] = useState(false);
  const [edgeDeltas, setEdgeDeltas] = useState({});
  const [pulsingEdges, setPulsingEdges] = useState([]);

  const canvasRef = useRef(null);
  const speedRef = useRef(speed);
  const riskRef = useRef(risk);
  const edgesRef = useRef(edges);
  const optimalPathKeyRef = useRef("");
  const edgeDeltaTimersRef = useRef({});
  const pulseTimerRef = useRef(null);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    riskRef.current = risk;
  }, [risk]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.sessionStorage.setItem(
      PANEL_STATE_KEY,
      JSON.stringify({
        showLeftPanel,
        showRightPanel,
        showBottomPanel,
      })
    );
  }, [showBottomPanel, showLeftPanel, showRightPanel]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const seen = window.localStorage.getItem(MAP_ONBOARDING_KEY);
    if (!seen) {
      setShowMapOnboarding(true);
    }
  }, []);

  useEffect(
    () => () => {
      Object.values(edgeDeltaTimersRef.current).forEach((timer) => {
        window.clearTimeout(timer);
      });
      if (pulseTimerRef.current) {
        window.clearTimeout(pulseTimerRef.current);
      }
    },
    []
  );

  const applyDistances = useCallback((dist) => {
    setNodes((prevNodes) =>
      prevNodes.map((n) => ({
        ...n,
        dist: typeof dist[n.id] === "number" ? dist[n.id] : Infinity,
      }))
    );
  }, []);

  const updateEdgeValues = useCallback((edgeIdx, newWeight, newSigma, reason = "update") => {
    const prevEdge = edgesRef.current?.[edgeIdx];
    const oldWeight = typeof prevEdge?.weight === "number" ? prevEdge.weight : null;
    const resolvedWeight =
      typeof newWeight === "number" ? newWeight : typeof oldWeight === "number" ? oldWeight : null;

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

    if (
      Number.isFinite(oldWeight) &&
      Number.isFinite(resolvedWeight) &&
      Math.abs(resolvedWeight - oldWeight) > 1e-9
    ) {
      const pct =
        Math.abs(oldWeight) > 1e-9 ? ((resolvedWeight - oldWeight) / Math.abs(oldWeight)) * 100 : null;

      setEdgeDeltas((prev) => ({
        ...prev,
        [edgeIdx]: {
          from: oldWeight,
          to: resolvedWeight,
          pct,
          reason,
          changedAt: Date.now(),
        },
      }));

      const previousTimer = edgeDeltaTimersRef.current[edgeIdx];
      if (previousTimer) {
        window.clearTimeout(previousTimer);
      }

      edgeDeltaTimersRef.current[edgeIdx] = window.setTimeout(() => {
        setEdgeDeltas((prev) => {
          if (!(edgeIdx in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[edgeIdx];
          return next;
        });
        delete edgeDeltaTimersRef.current[edgeIdx];
      }, EDGE_DELTA_TTL_MS);
    }
  }, []);

  const pulseEdge = useCallback((edgeIdx, ttl = 360) => {
    if (!Number.isFinite(edgeIdx)) {
      return;
    }
    setPulsingEdges([edgeIdx]);
    if (pulseTimerRef.current) {
      window.clearTimeout(pulseTimerRef.current);
    }
    pulseTimerRef.current = window.setTimeout(() => {
      setPulsingEdges([]);
    }, ttl);
  }, []);

  const pushLog = useCallback((event) => {
    setLog((prev) => [makeLogEntry(event), ...prev].slice(0, 120));
  }, []);

  const applyGraphState = useCallback((nodeCount, edgeTuples, options = {}) => {
    const normalizedTuples = Array.isArray(edgeTuples)
      ? edgeTuples.map((tuple) => normalizeEdgeTuple(tuple))
      : [];

    const nextNodes = buildNodesFromCount(nodeCount, 0);
    const nextEdges = buildEdgesFromTuples(normalizedTuples);

    setSource(0);
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSptEdges([]);
    setOptimalPath([]);
    optimalPathKeyRef.current = "";
    setVisitingNodes([]);
    setFlashingEdges([]);
    setPulsingEdges([]);
    setEdgeDeltas({});
    setTrafficCycles(0);
    setTrafficSptChanges(0);
    setStats({
      nodes: nextNodes.length,
      edges: nextEdges.length,
      updates: 0,
      reEvaluated: 0,
    });
    setAlgoResults({ dijkstraResult: null, standardResult: null, bellmanResult: null });

    if (options.setAsBase === true) {
      setBaseGraphSpec({
        nodes: nextNodes.length,
        edges: normalizedTuples,
      });
    }
    edgesRef.current = nextEdges;
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
        const nextPath = buildPath(prev, sourceId, target);
        setOptimalPath(nextPath);

        const nextPathKey = nextPath.join(">");
        if (trafficMode && optimalPathKeyRef.current && nextPathKey !== optimalPathKeyRef.current) {
          setTrafficSptChanges((count) => count + 1);
        }
        optimalPathKeyRef.current = nextPathKey;

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
          updateEdgeValues(edgeIdx, event.newWeight, event.newSigma, "edge_update");
          pulseEdge(edgeIdx);
        }

        const updatedDist = safeArray(event.dist);
        const updatedPrev = safeArray(event.prev);
        const sourceId = typeof event.source === "number" ? event.source : source;

        if (updatedDist.length > 0) {
          applyDistances(updatedDist);
          const target = chooseTarget(updatedDist, sourceId);
          const nextPath = buildPath(updatedPrev, sourceId, target);
          setOptimalPath(nextPath);

          const nextPathKey = nextPath.join(">");
          if (trafficMode && optimalPathKeyRef.current && nextPathKey !== optimalPathKeyRef.current) {
            setTrafficSptChanges((count) => count + 1);
          }
          optimalPathKeyRef.current = nextPathKey;
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

      if (eventType === "adversarial_update") {
        const edgeIdx = Number(event.edgeIdx);
        if (Number.isFinite(edgeIdx)) {
          setFlashingEdges([edgeIdx]);
          pulseEdge(edgeIdx, 460);
          window.setTimeout(() => {
            updateEdgeValues(edgeIdx, event.newWeight, null, "adversarial_update");
            setFlashingEdges([]);
          }, 260);
        }
        setStats((s) => ({ ...s, updates: s.updates + 1 }));
      }

      if (eventType === "random_update") {
        const edgeIdx = Number(event.edgeIdx);
        if (Number.isFinite(edgeIdx)) {
          updateEdgeValues(edgeIdx, event.newWeight, event.newSigma, "random_update");
          pulseEdge(edgeIdx);
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
    [
      applyDistances,
      pulseEdge,
      pushLog,
      risk,
      source,
      trafficMode,
      updateEdgeValues,
    ]
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
      applyGraphState(baseGraphSpec.nodes, baseGraphSpec.edges);
    } catch (err) {
      pushLog({ type: "err", message: err.message });
    }
  }, [applyGraphState, baseGraphSpec, pushLog]);

  const sendAdversarial = useCallback(
    async (riskValue, origin = "manual") => {
      try {
        await postJson("/api/adversarial", { k: riskValue });
        if (origin === "traffic") {
          setTrafficCycles((count) => count + 1);
        }
      } catch (err) {
        pushLog({ type: "err", message: err.message });
      }
    },
    [pushLog]
  );

  const onAdversarial = useCallback(async () => {
    try {
      await sendAdversarial(risk, "manual");
    } catch (err) {
      pushLog({ type: "err", message: err.message });
    }
  }, [risk, pushLog, sendAdversarial]);

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

  const onRunProbabilistic = useCallback(async () => {
    try {
      await postJson("/api/run", { cmd: "run_dijkstra", source, k: risk });
    } catch (err) {
      pushLog({ type: "err", message: err.message });
    }
  }, [pushLog, risk, source]);

  const onRunStandard = useCallback(async () => {
    try {
      await postJson("/api/run", { cmd: "run_standard", source });
    } catch (err) {
      pushLog({ type: "err", message: err.message });
    }
  }, [pushLog, source]);

  const onRunBellman = useCallback(async () => {
    try {
      await postJson("/api/run", { cmd: "run_bellman", source });
    } catch (err) {
      pushLog({ type: "err", message: err.message });
    }
  }, [pushLog, source]);

  const onCustomInit = useCallback(
    async ({ nodes: nodeCount, edges: edgeTuples }) => {
      try {
        await postJson("/api/run", {
          cmd: "init",
          nodes: nodeCount,
          edges: edgeTuples,
        });
        applyGraphState(nodeCount, edgeTuples, { setAsBase: true });
        pushLog({
          type: "ui",
          message: `custom_init nodes=${nodeCount} edges=${Array.isArray(edgeTuples) ? edgeTuples.length : 0}`,
        });
      } catch (err) {
        pushLog({ type: "err", message: err.message });
      }
    },
    [applyGraphState, pushLog]
  );

  const onManualUpdate = useCallback(
    async ({ edgeIdx, weight, sigma }) => {
      try {
        await postJson("/api/update", {
          edgeIdx,
          weight,
          sigma,
          mode: "selective",
          k: risk,
        });
      } catch (err) {
        pushLog({ type: "err", message: err.message });
      }
    },
    [pushLog, risk]
  );

  const onManualBatch = useCallback(
    async ({ updates }) => {
      try {
        await postJson("/api/batch", { updates, k: risk });
      } catch (err) {
        pushLog({ type: "err", message: err.message });
      }
    },
    [pushLog, risk]
  );

  const onLoadOsm = useCallback(
    async ({ maxNodes, rebuild }) => {
      try {
        setMapLoading(true);
        const data = await postJson("/api/load_osm", {
          max_nodes: maxNodes,
          rebuild,
        });

        const graph = data?.graph;
        if (
          graph &&
          Number.isFinite(Number(graph.nodes)) &&
          Array.isArray(graph.edges)
        ) {
          applyGraphState(Number(graph.nodes), graph.edges, { setAsBase: true });
          pushLog({
            type: "ui",
            message: `osm_graph_loaded nodes=${graph.nodes} edges=${graph.edges.length}`,
          });
        }
      } catch (err) {
        pushLog({ type: "err", message: err.message });
      } finally {
        setMapLoading(false);
      }
    },
    [applyGraphState, pushLog]
  );

  const onUseDemoGraph = useCallback(async () => {
    try {
      const edgeTuples = INITIAL_EDGES.map((e) => [e.a, e.b, e.weight, e.sigma]);
      await postJson("/api/run", {
        cmd: "init",
        nodes: INITIAL_NODES.length,
        edges: edgeTuples,
      });
      applyGraphState(INITIAL_NODES.length, edgeTuples, { setAsBase: true });
      pushLog({ type: "ui", message: "demo_graph_loaded" });
    } catch (err) {
      pushLog({ type: "err", message: err.message });
    }
  }, [applyGraphState, pushLog]);

  const onApplyMapEditor = useCallback(
    async ({ nodes: nodeCount, edges: edgeTuples, persist }) => {
      try {
        if (persist) {
          await postJson("/api/save_graph", {
            nodes: nodeCount,
            edges: edgeTuples,
          });
        }

        await postJson("/api/run", {
          cmd: "init",
          nodes: nodeCount,
          edges: edgeTuples,
        });

        applyGraphState(nodeCount, edgeTuples, { setAsBase: true });
        setShowMapEditor(false);
        pushLog({
          type: "ui",
          message: `map_editor_applied nodes=${nodeCount} edges=${edgeTuples.length}${persist ? " saved" : ""}`,
        });
      } catch (err) {
        pushLog({ type: "err", message: err.message });
      }
    },
    [applyGraphState, pushLog]
  );

  const markOnboardingSeen = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MAP_ONBOARDING_KEY, "1");
    }
  }, []);

  const onOnboardingLoadMap = useCallback(async () => {
    markOnboardingSeen();
    setShowMapOnboarding(false);
    await onLoadOsm({ maxNodes: mapMaxNodes, rebuild: true });
  }, [mapMaxNodes, markOnboardingSeen, onLoadOsm]);

  const onOnboardingSkip = useCallback(() => {
    markOnboardingSeen();
    setShowMapOnboarding(false);
  }, [markOnboardingSeen]);

  useEffect(() => {
    if (!trafficMode) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      const nextRisk = Math.min(3, Number((riskRef.current + 0.05).toFixed(2)));
      setRisk(nextRisk);
      riskRef.current = nextRisk;
      sendAdversarial(nextRisk, "traffic");
    }, Math.max(1200, Number(trafficIntervalMs) || DEFAULT_TRAFFIC_INTERVAL_MS));

    return () => {
      window.clearInterval(timer);
    };
  }, [sendAdversarial, trafficIntervalMs, trafficMode]);

  const onNotice = useCallback(
    (type, message) => {
      pushLog({ type: type || "ui", message });
    },
    [pushLog]
  );

  const toggleUncertainty = useCallback(() => {
    setShowUncertainty((v) => !v);
  }, []);

  const avgEdgeWeight = useMemo(() => {
    if (!Array.isArray(edges) || edges.length === 0) {
      return 0;
    }
    const total = edges.reduce((sum, edge) => sum + (Number(edge.weight) || 0), 0);
    return total / edges.length;
  }, [edges]);

  const trafficLevel = useMemo(() => {
    if (avgEdgeWeight < 2.5) {
      return "low";
    }
    if (avgEdgeWeight < 4.5) {
      return "medium";
    }
    return "high";
  }, [avgEdgeWeight]);

  const modeValue = useMemo(() => mode, [mode]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-row">
          <div>
            <h1>Dynamic Shortest Path Analysis</h1>
            <div className="meta">Probabilistic graph updates with adversarial controls</div>
          </div>

          <div className="panel-toggles">
            <label className="top-toggle">
              <input
                type="checkbox"
                checked={showLeftPanel}
                onChange={(event) => setShowLeftPanel(event.target.checked)}
              />
              Left panel
            </label>
            <label className="top-toggle">
              <input
                type="checkbox"
                checked={showRightPanel}
                onChange={(event) => setShowRightPanel(event.target.checked)}
              />
              Right panel
            </label>
            <label className="top-toggle">
              <input
                type="checkbox"
                checked={showBottomPanel}
                onChange={(event) => setShowBottomPanel(event.target.checked)}
              />
              Bottom controls
            </label>
          </div>
        </div>
      </header>

      <main
        className="main-grid"
        style={{
          "--left-panel-width": showLeftPanel ? "280px" : "0px",
          "--right-panel-width": showRightPanel ? "380px" : "0px",
        }}
      >
        {showLeftPanel ? (
          <aside className="left-panel">
            <div className="panel-section">
              <h3>Graph Source</h3>
              <div className="left-control-group">
                <label htmlFor="left-map-max" className="left-control-label">
                  Max Nodes
                </label>
                <input
                  id="left-map-max"
                  type="range"
                  min="10"
                  max="200"
                  step="5"
                  value={mapMaxNodes}
                  onChange={(event) => setMapMaxNodes(Number(event.target.value))}
                />
                <div className="left-control-value">{mapMaxNodes}</div>
              </div>

              <label className="lab-check left-check">
                <input
                  type="checkbox"
                  checked={mapRebuild}
                  onChange={(event) => setMapRebuild(event.target.checked)}
                />
                Rebuild map cache
              </label>

              <div className="left-button-row">
                <button className="ctl-btn" disabled={mapLoading} onClick={() => onLoadOsm({ maxNodes: mapMaxNodes, rebuild: mapRebuild })}>
                  {mapLoading ? "Loading map..." : "Load from map"}
                </button>
                <button className="ctl-btn" onClick={onUseDemoGraph}>
                  Use demo graph
                </button>
                <button className="ctl-btn" onClick={() => setShowMapEditor(true)}>
                  Open map editor
                </button>
              </div>
            </div>

            <div className="panel-section">
              <h3>Traffic Simulation</h3>
              <div className="left-kv">Mode: {trafficMode ? "active" : "paused"}</div>
              <div className="left-kv">Cycles: {trafficCycles}</div>
              <div className="left-kv">SPT changes: {trafficSptChanges}</div>
            </div>
          </aside>
        ) : null}

        <section className="canvas-panel">
          <GraphCanvas
            ref={canvasRef}
            nodes={nodes}
            edges={edges}
            sptEdges={sptEdges}
            visitingNodes={visitingNodes}
            optimalPath={optimalPath}
            flashingEdges={flashingEdges}
            pulsingEdges={pulsingEdges}
            showUncertainty={showUncertainty}
            edgeDeltas={edgeDeltas}
            onNodeClick={(node) =>
              pushLog({
                type: "hover",
                nodeId: node.id,
                label: node.label,
              })
            }
          />
        </section>

        {showRightPanel ? (
          <SidePanel
            dijkstraResult={algoResults.dijkstraResult}
            standardResult={algoResults.standardResult}
            bellmanResult={algoResults.bellmanResult}
            stats={stats}
            log={log}
            traffic={{
              enabled: trafficMode,
              level: trafficLevel,
              avgEdgeWeight,
              cycles: trafficCycles,
              sptChanges: trafficSptChanges,
              activeDeltas: Object.keys(edgeDeltas).length,
            }}
          />
        ) : null}
      </main>

      {showBottomPanel ? (
        <Controls
          onRun={onRun}
          onRunProbabilistic={onRunProbabilistic}
          onRunStandard={onRunStandard}
          onRunBellman={onRunBellman}
          onReset={onReset}
          onAdversarial={onAdversarial}
          onRandom={onRandom}
          onBatch={onBatch}
          onCustomInit={onCustomInit}
          onManualUpdate={onManualUpdate}
          onManualBatch={onManualBatch}
          onLoadOsm={onLoadOsm}
          onNotice={onNotice}
          onToggleUncertainty={toggleUncertainty}
          onModeChange={setMode}
          onSourceChange={setSource}
          onRiskChange={setRisk}
          onSpeedChange={setSpeed}
          onTrafficModeChange={setTrafficMode}
          onTrafficIntervalChange={setTrafficIntervalMs}
          nodes={nodes}
          edges={edges}
          source={source}
          mode={modeValue}
          risk={risk}
          speed={speed}
          trafficMode={trafficMode}
          trafficIntervalMs={trafficIntervalMs}
          showUncertainty={showUncertainty}
        />
      ) : null}

      <MapOnboarding
        open={showMapOnboarding}
        maxNodes={mapMaxNodes}
        onMaxNodesChange={setMapMaxNodes}
        onLoadMap={onOnboardingLoadMap}
        onSkip={onOnboardingSkip}
        onOpenEditor={() => {
          markOnboardingSeen();
          setShowMapOnboarding(false);
          setShowMapEditor(true);
        }}
      />

      <MapEditor
        open={showMapEditor}
        onClose={() => setShowMapEditor(false)}
        onApply={onApplyMapEditor}
      />
    </div>
  );
}
