import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force";

const COLOR = {
  edgeDefault: "#9ca3af",
  edgeSpt: "#7c6ef7",
  edgeOptimal: "#2dd4bf",
  edgeFlash: "#ef4444",
  nodeDark: "#111827",
  nodeBorder: "#374151",
  source: "#7c6ef7",
  target: "#2dd4bf",
  visiting: "#f59e0b",
  text: "#e5e7eb",
  labelSub: "#9ca3af",
};

const NODE_RADIUS = 18;
const HOVER_RADIUS = 22;
const RIPPLE_MS = 400;

function edgeEndpoints(edge) {
  const a = typeof edge.a === "number" ? edge.a : edge.source?.id ?? edge.source;
  const b = typeof edge.b === "number" ? edge.b : edge.target?.id ?? edge.target;
  return [a, b];
}

function edgeKey(a, b) {
  if (typeof a !== "number" || typeof b !== "number") {
    return "";
  }
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function nodeLabel(node) {
  if (typeof node.label === "string" && node.label.length > 0) {
    return node.label;
  }
  const id = Number(node.id);
  if (Number.isFinite(id) && id >= 0 && id < 26) {
    return String.fromCharCode(65 + id);
  }
  return String(node.id ?? "?");
}

function nodeDistanceLabel(node) {
  const value =
    typeof node.dist === "number"
      ? node.dist
      : typeof node.distance === "number"
        ? node.distance
        : null;

  if (value == null || !Number.isFinite(value)) {
    return "inf";
  }
  return value.toFixed(1);
}

function weightOf(edge) {
  return typeof edge.weight === "number" ? edge.weight : 1;
}

function sigmaOf(edge) {
  return typeof edge.sigma === "number" ? edge.sigma : 0;
}

function resolveSourceNode(nodes, links) {
  const explicit = nodes.find((n) => n.isSource || n.source || n.role === "source");
  if (explicit) {
    return explicit.id;
  }

  const incoming = new Set();
  links.forEach((e) => {
    const [, b] = edgeEndpoints(e);
    if (typeof b === "number") {
      incoming.add(b);
    }
  });

  const rootCandidate = nodes.find((n) => !incoming.has(n.id));
  return rootCandidate ? rootCandidate.id : null;
}

function resolveTargetNode(nodes) {
  const explicit = nodes.find((n) => n.isTarget || n.target || n.role === "target");
  if (explicit) {
    return explicit.id;
  }
  return null;
}

const GraphCanvas = forwardRef(function GraphCanvas(
  {
    nodes = [],
    edges = [],
    sptEdges = [],
    visitingNodes = [],
    optimalPath = [],
    flashingEdges = [],
    showUncertainty = false,
    onNodeClick,
  },
  ref
) {
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const graphRef = useRef({ nodes: [], links: [] });
  const animationRef = useRef(null);
  const ripplesRef = useRef([]);
  const visitingPrevRef = useRef(new Set());
  const hoverNodeIdRef = useRef(null);

  const visitingSet = useMemo(() => new Set(visitingNodes), [visitingNodes]);

  const sptByIndex = useMemo(() => new Set(sptEdges), [sptEdges]);

  const optimalNodeSet = useMemo(() => new Set(optimalPath), [optimalPath]);

  const flashingEdgeSet = useMemo(() => new Set(flashingEdges), [flashingEdges]);

  const optimalEdgeKeys = useMemo(() => {
    const keys = new Set();
    for (let i = 0; i < optimalPath.length - 1; i += 1) {
      keys.add(edgeKey(optimalPath[i], optimalPath[i + 1]));
    }
    return keys;
  }, [optimalPath]);

  const triggerRipple = useCallback((nodeId) => {
    ripplesRef.current.push({
      nodeId,
      startedAt: performance.now(),
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      triggerRipple,
    }),
    [triggerRipple]
  );

  const setupCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }

    const parent = canvas.parentElement;
    const width = Math.max(320, parent?.clientWidth || 900);
    const height = Math.max(260, parent?.clientHeight || 560);
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height, ctx };
  }, []);

  useEffect(() => {
    const canvasSetup = setupCanvasSize();
    if (!canvasSetup) {
      return undefined;
    }

    const { width, height } = canvasSetup;

    const simNodes = nodes.map((n) => ({ ...n }));
    const simLinks = edges.map((e, index) => {
      const [a, b] = edgeEndpoints(e);
      return {
        ...e,
        _index: index,
        source: a,
        target: b,
      };
    });

    graphRef.current = { nodes: simNodes, links: simLinks };

    if (simRef.current) {
      simRef.current.stop();
    }

    const simulation = forceSimulation(simNodes)
      .force(
        "link",
        forceLink(simLinks)
          .id((d) => d.id)
          .distance((l) => {
            const w = weightOf(l);
            return Math.max(30, Math.min(240, 30 + w * 18));
          })
          .strength(0.4)
      )
      .force("charge", forceManyBody().strength(-200))
      .force("center", forceCenter(width / 2, height / 2))
      .alpha(1)
      .alphaDecay(0.06)
      .velocityDecay(0.4);

    simRef.current = simulation;

    simulation.on("tick", () => {
      // draw loop is RAF-driven; ticks only update node positions.
    });

    simulation.alpha(1).restart();

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, setupCanvasSize]);

  useEffect(() => {
    const prev = visitingPrevRef.current;
    const current = new Set(visitingNodes);
    current.forEach((nodeId) => {
      if (!prev.has(nodeId)) {
        triggerRipple(nodeId);
      }
    });
    visitingPrevRef.current = current;
  }, [visitingNodes, triggerRipple]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const handleMouseMove = (ev) => {
      if (typeof onNodeClick !== "function") {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;

      let closest = null;
      let bestDistSq = HOVER_RADIUS * HOVER_RADIUS;

      for (const n of graphRef.current.nodes) {
        if (typeof n.x !== "number" || typeof n.y !== "number") {
          continue;
        }

        const dx = x - n.x;
        const dy = y - n.y;
        const d2 = dx * dx + dy * dy;

        if (d2 <= bestDistSq) {
          bestDistSq = d2;
          closest = n;
        }
      }

      const nextId = closest ? closest.id : null;
      if (hoverNodeIdRef.current !== nextId) {
        hoverNodeIdRef.current = nextId;
        if (closest) {
          onNodeClick(closest);
        }
      }
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
    };
  }, [onNodeClick]);

  useEffect(() => {
    const handleResize = () => {
      const info = setupCanvasSize();
      if (!info) {
        return;
      }

      if (simRef.current) {
        simRef.current.force("center", forceCenter(info.width / 2, info.height / 2));
        simRef.current.alpha(0.5).restart();
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [setupCanvasSize]);

  useEffect(() => {
    const drawFrame = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animationRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        animationRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      const width = parseFloat(canvas.style.width) || 0;
      const height = parseFloat(canvas.style.height) || 0;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#09090b";
      ctx.fillRect(0, 0, width, height);

      const graph = graphRef.current;
      const sourceId = resolveSourceNode(graph.nodes, graph.links);
      const targetId = resolveTargetNode(graph.nodes);

      const nodeById = new Map();
      graph.nodes.forEach((n) => nodeById.set(n.id, n));

      // Edges
      for (const edge of graph.links) {
        const sx = edge.source?.x;
        const sy = edge.source?.y;
        const tx = edge.target?.x;
        const ty = edge.target?.y;

        if (![sx, sy, tx, ty].every(Number.isFinite)) {
          continue;
        }

        const [a, b] = edgeEndpoints(edge);
        const k = edgeKey(a, b);

        const isOptimal = optimalEdgeKeys.has(k);
        const isFlashing = flashingEdgeSet.has(edge._index) || flashingEdgeSet.has(k);
        const isSpt =
          sptByIndex.has(edge._index) ||
          sptByIndex.has(k) ||
          edge.inSPT === true;

        let stroke = COLOR.edgeDefault;
        if (isSpt) {
          stroke = COLOR.edgeSpt;
        }
        if (isOptimal) {
          stroke = COLOR.edgeOptimal;
        }
        if (isFlashing) {
          stroke = COLOR.edgeFlash;
        }

        const sigma = sigmaOf(edge);
        const thickness = showUncertainty ? 1 + sigma : 1.4;

        ctx.save();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = thickness;

        if (showUncertainty && sigma > 0.8) {
          ctx.setLineDash([6, 6]);
        } else {
          ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        // Edge weight label offset perpendicular to edge.
        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2;
        const dx = tx - sx;
        const dy = ty - sy;
        const len = Math.hypot(dx, dy) || 1;
        const ox = (-dy / len) * 10;
        const oy = (dx / len) * 10;

        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#d1d5db";

        const wText = Number.isFinite(weightOf(edge)) ? weightOf(edge).toFixed(1) : "?";
        ctx.fillText(wText, mx + ox, my + oy);

        ctx.restore();
      }

      // Nodes
      for (const n of graph.nodes) {
        const x = n.x;
        const y = n.y;
        if (![x, y].every(Number.isFinite)) {
          continue;
        }

        const isSource = n.id === sourceId;
        const isTarget = n.id === targetId;
        const isVisiting = visitingSet.has(n.id);
        const isOptimal = optimalNodeSet.has(n.id);

        let fill = COLOR.nodeDark;
        if (isSource) {
          fill = COLOR.source;
        }
        if (isTarget) {
          fill = COLOR.target;
        }
        if (isOptimal && !isSource && !isTarget) {
          fill = "#134e4a";
        }

        ctx.beginPath();
        ctx.arc(x, y, NODE_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = COLOR.nodeBorder;
        ctx.stroke();

        // Visiting pulse ring.
        if (isVisiting) {
          const t = performance.now() / 450;
          const r = NODE_RADIUS + 3 + ((Math.sin(t * Math.PI * 2) + 1) * 0.5) * 6;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(245, 158, 11, 0.8)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Label inside node.
        ctx.fillStyle = COLOR.text;
        ctx.font = "600 12px system-ui, -apple-system, Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(nodeLabel(n), x, y);

        // Distance below node.
        ctx.fillStyle = COLOR.labelSub;
        ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        ctx.textBaseline = "top";
        ctx.fillText(nodeDistanceLabel(n), x, y + NODE_RADIUS + 4);
      }

      // Re-evaluation ripples.
      const now = performance.now();
      ripplesRef.current = ripplesRef.current.filter((ripple) => {
        const elapsed = now - ripple.startedAt;
        if (elapsed >= RIPPLE_MS) {
          return false;
        }

        const node = nodeById.get(ripple.nodeId);
        if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) {
          return true;
        }

        const t = elapsed / RIPPLE_MS;
        const radius = NODE_RADIUS + 4 + t * 30;
        const alpha = 1 - t;

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(124, 110, 247, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        return true;
      });

      // Optimal path polyline on top.
      if (optimalPath.length > 1) {
        ctx.save();
        ctx.strokeStyle = COLOR.edgeOptimal;
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);

        let started = false;
        ctx.beginPath();
        for (const nodeId of optimalPath) {
          const node = nodeById.get(nodeId);
          if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) {
            continue;
          }
          if (!started) {
            ctx.moveTo(node.x, node.y);
            started = true;
          } else {
            ctx.lineTo(node.x, node.y);
          }
        }
        if (started) {
          ctx.stroke();
        }
        ctx.restore();
      }

      animationRef.current = requestAnimationFrame(drawFrame);
    };

    animationRef.current = requestAnimationFrame(drawFrame);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [
    optimalPath,
    optimalNodeSet,
    optimalEdgeKeys,
    sptByIndex,
    flashingEdgeSet,
    showUncertainty,
    visitingSet,
  ]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        cursor: "crosshair",
        background: "#09090b",
      }}
    />
  );
});

export default GraphCanvas;
