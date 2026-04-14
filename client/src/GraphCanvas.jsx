import { useCallback, useEffect, useMemo, useRef } from "react";
import { forceCenter, forceLink, forceManyBody, forceSimulation } from "d3-force";
import * as L from "leaflet";

const COLOR = {
  edgeDefault: "#737b87",
  edgeSpt: "#7c6ef7",
  edgePath: "#2dd4bf",
  edgeFlash: "#ef4444",
  nodeFill: "#111418",
  nodeBorder: "#2a3444",
  text: "#e5e7eb",
  subText: "#9ca3af",
};

const NODE_RADIUS = 16;
const NODE_RADIUS_MAP = 9;
const RIPPLE_MS = 520;

function edgeKey(a, b) {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    return "";
  }
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function nodeLabel(node) {
  if (typeof node.label === "string" && node.label.length > 0) {
    // For short labels (e.g. "A", "N0"), show as-is; for long labels, show node ID
    if (node.label.length <= 4) {
      return node.label;
    }
    // Show short abbreviation inside circle
    return String(node.id);
  }

  const id = Number(node.id);
  if (Number.isInteger(id) && id >= 0 && id < 26) {
    return String.fromCharCode(65 + id);
  }
  return String(node.id ?? "?");
}

function fullNodeLabel(node) {
  if (typeof node.label === "string" && node.label.length > 4) {
    // Truncate to first 2 words for readability
    const words = node.label.split(/\s+/);
    return words.length > 2 ? words.slice(0, 2).join(" ") : node.label;
  }
  return null; // No extra label needed
}

function distanceLabel(node) {
  const value = Number(node.dist);
  if (!Number.isFinite(value)) {
    return "inf";
  }
  return value.toFixed(1);
}

function edgeWeight(edge) {
  return Number.isFinite(Number(edge.weight)) ? Number(edge.weight) : 1;
}

function edgeSigma(edge) {
  return Number.isFinite(Number(edge.sigma)) ? Number(edge.sigma) : 0;
}

function setupCanvas(canvas) {
  const parent = canvas.parentElement;
  const width = Math.max(320, parent?.clientWidth || 900);
  const height = Math.max(280, parent?.clientHeight || 560);
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
}

export default function GraphCanvas({
  nodes = [],
  edges = [],
  sptEdges = [],
  visitingNodes = [],
  optimalPath = [],
  flashingEdges = [],
  showUncertainty = false,
  mapMode = false,
  nodeCoords = {},
  onEdgeClick,
}) {
  const canvasRef = useRef(null);
  const simulationRef = useRef(null);
  const graphRef = useRef({ nodes: [], links: [] });
  const frameRef = useRef(null);
  const rippleRef = useRef([]);
  const previousVisitingRef = useRef(new Set());
  const leafletMapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const nodeCoordsRef = useRef(nodeCoords);
  nodeCoordsRef.current = nodeCoords;

  const sptSet = useMemo(() => new Set(sptEdges), [sptEdges]);
  const flashSet = useMemo(() => new Set(flashingEdges), [flashingEdges]);
  const visitingSet = useMemo(() => new Set(visitingNodes), [visitingNodes]);

  const optimalEdgeSet = useMemo(() => {
    const set = new Set();
    for (let i = 0; i < optimalPath.length - 1; i += 1) {
      set.add(edgeKey(optimalPath[i], optimalPath[i + 1]));
    }
    return set;
  }, [optimalPath]);

  // ── Leaflet map lifecycle ──────────────────────────────────────────
  useEffect(() => {
    if (!mapMode) {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
      return undefined;
    }

    const el = mapContainerRef.current;
    if (!el) return undefined;

    // Build bounds from actual node coordinates
    const coordEntries = Object.values(nodeCoords);
    let center = [28.5355, 77.3910]; // Noida default
    let bounds = null;

    if (coordEntries.length > 0) {
      const lats = coordEntries.map((c) => c.lat);
      const lngs = coordEntries.map((c) => c.lng);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      center = [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
      bounds = [[minLat, minLng], [maxLat, maxLng]];
    }

    const map = L.map(el, {
      center,
      zoom: 12,
      zoomControl: true,
    });

    if (bounds) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
      opacity: 0.95,
    }).addTo(map);

    leafletMapRef.current = map;

    // Canvas redraws are handled in the animation loop — just invalidate on move/zoom
    const onMapChange = () => {
      /* draw loop will pick up new positions automatically */
    };
    map.on("move", onMapChange);
    map.on("zoom", onMapChange);

    return () => {
      map.off("move", onMapChange);
      map.off("zoom", onMapChange);
      map.remove();
      leafletMapRef.current = null;
    };
  }, [mapMode, nodeCoords]);

  // ── D3 force simulation (demo mode only) ──────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const setup = setupCanvas(canvas);
    if (!setup) {
      return undefined;
    }

    const localNodes = nodes.map((node) => ({ ...node }));
    const localLinks = edges.map((edge, index) => ({
      ...edge,
      _index: index,
      source: edge.a,
      target: edge.b,
    }));
    graphRef.current = { nodes: localNodes, links: localLinks };

    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    if (!mapMode) {
      const simulation = forceSimulation(localNodes)
        .force(
          "link",
          forceLink(localLinks)
            .id((d) => d.id)
            .distance((link) => Math.max(50, Math.min(200, 60 + edgeWeight(link) * 16)))
            .strength(0.4)
        )
        .force("charge", forceManyBody().strength(-230))
        .force("center", forceCenter(setup.width / 2, setup.height / 2))
        .alpha(1)
        .alphaDecay(0.06)
        .velocityDecay(0.38);

      simulationRef.current = simulation;
      simulation.alpha(1).restart();

      const onResize = () => {
        const nextSetup = setupCanvas(canvas);
        if (!nextSetup || !simulationRef.current) {
          return;
        }

        simulationRef.current.force("center", forceCenter(nextSetup.width / 2, nextSetup.height / 2));
        simulationRef.current.alpha(0.5).restart();
      };

      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
        simulation.stop();
      };
    }

    // Map mode — no force simulation
    if (simulationRef.current) {
      simulationRef.current.stop();
      simulationRef.current = null;
    }

    const onResize = () => {
      setupCanvas(canvas);
      if (leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [edges, nodes, mapMode]);

  // ── Ripple tracking ────────────────────────────────────────────────
  useEffect(() => {
    const previous = previousVisitingRef.current;
    const next = new Set(visitingNodes);

    next.forEach((nodeId) => {
      if (!previous.has(nodeId)) {
        rippleRef.current.push({
          nodeId,
          startedAt: performance.now(),
        });
      }
    });

    previousVisitingRef.current = next;
  }, [visitingNodes]);

  // ── Draw loop ──────────────────────────────────────────────────────
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        frameRef.current = requestAnimationFrame(draw);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        frameRef.current = requestAnimationFrame(draw);
        return;
      }

      // Re-setup canvas size every frame (handles resize)
      const cw = parseFloat(canvas.style.width) || 0;
      const ch = parseFloat(canvas.style.height) || 0;

      ctx.clearRect(0, 0, cw, ch);

      if (!mapMode) {
        ctx.fillStyle = "#0a0c0f";
        ctx.fillRect(0, 0, cw, ch);
      }

      const graph = graphRef.current;
      const nodeById = new Map();
      graph.nodes.forEach((node) => {
        nodeById.set(node.id, node);
      });

      // ── Position helper ──────────────────────────────────────────
      const getPos = (nodeId) => {
        if (mapMode && leafletMapRef.current && nodeCoords[nodeId]) {
          const { lat, lng } = nodeCoords[nodeId];
          const point = leafletMapRef.current.latLngToContainerPoint(L.latLng(lat, lng));
          return { x: point.x, y: point.y };
        }
        const node = nodeById.get(nodeId);
        return node ? { x: node.x, y: node.y } : null;
      };

      // Compute max weight for color scaling
      const maxWeight = graph.links.reduce(
        (m, e) => Math.max(m, edgeWeight(e)),
        1
      );

      // ── Draw edges ─────────────────────────────────────────────
      for (const edge of graph.links) {
        const a = Number.isInteger(edge.a) ? edge.a : edge.source?.id;
        const b = Number.isInteger(edge.b) ? edge.b : edge.target?.id;

        const srcPos = getPos(a) || { x: edge.source?.x, y: edge.source?.y };
        const tgtPos = getPos(b) || { x: edge.target?.x, y: edge.target?.y };

        const sx = srcPos.x;
        const sy = srcPos.y;
        const tx = tgtPos.x;
        const ty = tgtPos.y;

        if (![sx, sy, tx, ty].every(Number.isFinite)) {
          continue;
        }

        const isSpt = sptSet.has(edge._index) || edge.inSPT === true;
        const isFlash = flashSet.has(edge._index);
        const isOptimal = optimalEdgeSet.has(edgeKey(a, b));

        // Weight-based color: green → yellow → red
        const t = Math.min(1, edgeWeight(edge) / maxWeight);
        const r = Math.round(34 + t * 221);     // 34 → 255
        const g = Math.round(197 - t * 128);    // 197 → 69
        const bColor = Math.round(94 - t * 25); // 94 → 69
        let stroke = `rgb(${r},${g},${bColor})`;

        if (isSpt) {
          stroke = COLOR.edgeSpt;
        }
        if (isOptimal) {
          stroke = "#60a5fa"; // bright blue for optimal path
        }
        if (isFlash) {
          stroke = COLOR.edgeFlash;
        }

        // Weight-based thickness: 1px (light) → 4px (heavy)
        let lineWidth = 1 + t * 3;
        if (showUncertainty) {
          lineWidth = Math.max(lineWidth, 1 + edgeSigma(edge));
        }
        if (isSpt) {
          lineWidth += 0.9;
        }
        if (isOptimal) {
          lineWidth += 1.2;
        }

        ctx.save();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;

        if (showUncertainty && edgeSigma(edge) > 0.8) {
          ctx.setLineDash([6, 5]);
        } else {
          ctx.setLineDash([]);
        }

        if (isFlash) {
          const flashAlpha = 0.5 + ((Math.sin(performance.now() / 75) + 1) * 0.5) * 0.5;
          ctx.globalAlpha = flashAlpha;
        }

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2;
        const dx = tx - sx;
        const dy = ty - sy;
        const length = Math.hypot(dx, dy) || 1;
        const ox = (-dy / length) * 10;
        const oy = (dx / length) * 10;

        // Only show weight labels in demo mode — map mode uses color/thickness
        if (!mapMode) {
          ctx.fillStyle = "#cbd5e1";
          ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(edgeWeight(edge).toFixed(1), mx + ox, my + oy);
        }
        ctx.restore();
      }

      // ── Draw nodes ─────────────────────────────────────────────
      const radius = mapMode ? NODE_RADIUS_MAP : NODE_RADIUS;

      for (const node of graph.nodes) {
        const pos = getPos(node.id) || { x: node.x, y: node.y };
        const x = pos.x;
        const y = pos.y;
        if (![x, y].every(Number.isFinite)) {
          continue;
        }

        const isVisiting = visitingSet.has(node.id);
        const isOnOptPath = optimalPath.includes(node.id);

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        // Highlight nodes on the optimal path with a teal fill
        ctx.fillStyle = isOnOptPath ? "#0e4a5c" : COLOR.nodeFill;
        ctx.fill();
        ctx.lineWidth = isOnOptPath ? 2.5 : 2;
        ctx.strokeStyle = isOnOptPath ? "#2dd4bf" : COLOR.nodeBorder;
        ctx.stroke();

        if (isVisiting) {
          const t = performance.now() / 420;
          const pulseRadius = radius + 4 + ((Math.sin(t * Math.PI * 2) + 1) * 0.5) * 6;
          ctx.beginPath();
          ctx.arc(x, y, pulseRadius, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(45, 212, 191, 0.85)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Node ID inside circle
        ctx.fillStyle = COLOR.text;
        const fontSize = mapMode ? 7 : 11;
        ctx.font = `600 ${fontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(nodeLabel(node), x, y);

        if (!mapMode) {
          // Demo mode: show full landmark name + distance below node
          const full = fullNodeLabel(node);
          if (full) {
            ctx.fillStyle = "#dbeafe";
            ctx.font = "600 9px system-ui, -apple-system, Segoe UI, sans-serif";
            ctx.textBaseline = "top";
            ctx.fillText(full, x, y + NODE_RADIUS + 2);

            ctx.fillStyle = COLOR.subText;
            ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
            ctx.fillText(distanceLabel(node), x, y + NODE_RADIUS + 14);
          } else {
            ctx.fillStyle = COLOR.subText;
            ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
            ctx.textBaseline = "top";
            ctx.fillText(distanceLabel(node), x, y + NODE_RADIUS + 4);
          }
        } else {
          // Map mode: show short label above the node only (no distance clutter)
          const full = fullNodeLabel(node);
          if (full) {
            ctx.fillStyle = "rgba(219,234,254,0.9)";
            ctx.font = "bold 9px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(full, x, y - radius - 2);
          }
        }
      }

      // ── Ripples ────────────────────────────────────────────────
      const now = performance.now();
      rippleRef.current = rippleRef.current.filter((ripple) => {
        const elapsed = now - ripple.startedAt;
        if (elapsed >= RIPPLE_MS) {
          return false;
        }

        const pos = getPos(ripple.nodeId);
        const node = nodeById.get(ripple.nodeId);
        const rx = pos?.x ?? node?.x;
        const ry = pos?.y ?? node?.y;
        if (!Number.isFinite(rx) || !Number.isFinite(ry)) {
          return true;
        }

        const progress = elapsed / RIPPLE_MS;
        const radius = NODE_RADIUS + 5 + progress * 32;
        const alpha = 1 - progress;

        ctx.beginPath();
        ctx.arc(rx, ry, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(124, 110, 247, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        return true;
      });

      // ── Optimal path overlay ───────────────────────────────────
      if (optimalPath.length > 1) {
        ctx.save();
        ctx.strokeStyle = COLOR.edgePath;
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);

        let started = false;
        ctx.beginPath();
        for (const nodeId of optimalPath) {
          const pos = getPos(nodeId);
          const node = nodeById.get(nodeId);
          const px = pos?.x ?? node?.x;
          const py = pos?.y ?? node?.y;
          if (!Number.isFinite(px) || !Number.isFinite(py)) {
            continue;
          }

          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else {
            ctx.lineTo(px, py);
          }
        }

        if (started) {
          ctx.stroke();
        }
        ctx.restore();
      }

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [flashSet, mapMode, nodeCoords, optimalEdgeSet, optimalPath, showUncertainty, sptSet, visitingSet]);

  // ── Edge click detection ──────────────────────────────────────
  const handleCanvasClick = useCallback(
    (e) => {
      if (!onEdgeClick) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const graph = graphRef.current;
      const nodeById = new Map();
      graph.nodes.forEach((n) => nodeById.set(n.id, n));

      const getPosLocal = (nodeId) => {
        if (mapMode && leafletMapRef.current && nodeCoordsRef.current[nodeId]) {
          const { lat, lng } = nodeCoordsRef.current[nodeId];
          const pt = leafletMapRef.current.latLngToContainerPoint(L.latLng(lat, lng));
          return { x: pt.x, y: pt.y };
        }
        const n = nodeById.get(nodeId);
        return n ? { x: n.x, y: n.y } : null;
      };

      let bestIdx = -1;
      let bestDist = 12; // max click distance in px

      graph.links.forEach((edge) => {
        const a = Number.isInteger(edge.a) ? edge.a : edge.source?.id;
        const b = Number.isInteger(edge.b) ? edge.b : edge.target?.id;
        const sp = getPosLocal(a) || { x: edge.source?.x, y: edge.source?.y };
        const tp = getPosLocal(b) || { x: edge.target?.x, y: edge.target?.y };
        if (![sp.x, sp.y, tp.x, tp.y].every(Number.isFinite)) return;

        // Distance from point to line segment
        const dx = tp.x - sp.x;
        const dy = tp.y - sp.y;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq === 0 ? 0 : ((mx - sp.x) * dx + (my - sp.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const px = sp.x + t * dx;
        const py = sp.y + t * dy;
        const d = Math.hypot(mx - px, my - py);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = edge._index;
        }
      });

      if (bestIdx >= 0) {
        onEdgeClick(bestIdx);
      }
    },
    [mapMode, onEdgeClick]
  );

  return (
    <div className="graph-canvas-wrap" style={{ position: "relative", width: "100%", height: "100%" }}>
      {mapMode && (
        <div
          ref={mapContainerRef}
          style={{ position: "absolute", inset: 0, zIndex: 0 }}
        />
      )}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          width: "100%",
          height: "100%",
          display: "block",
          cursor: "crosshair",
          background: mapMode ? "transparent" : "#09090b",
          pointerEvents: "auto",
        }}
      />
    </div>
  );
}