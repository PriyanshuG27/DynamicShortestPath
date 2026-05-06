import { useCallback, useEffect, useMemo, useRef } from "react";
import { forceCenter, forceLink, forceManyBody, forceSimulation } from "d3-force";
import * as L from "leaflet";

const COLOR = {
  edgeDefault: "#737b87",
  edgeSpt: "#a78bfa",
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
  onNodeClick,
  duelMode = false,
  duelData = null,
  ghostPaths = { fastest: [], safest: [] },
  mstEdges = [],
  kruskalEdges = [],
  negCycleEdges = [],
  divergenceData = null,
  astarPath = [],
  stepFrontier = [],
  stepState = null,
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
  // Leaflet layer groups for map mode
  const edgeLayerRef = useRef(null);
  const nodeLayerRef = useRef(null);
  const pathLayerRef = useRef(null);

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

  const stepFrontierSet = useMemo(() => new Set(stepFrontier), [stepFrontier]);

  // ── Leaflet map lifecycle ──────────────────────────────────────────
  useEffect(() => {
    if (!mapMode) {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
      return undefined;
    }

    // Wait until nodeCoords is actually populated before initializing the map
    if (Object.keys(nodeCoords).length === 0) return undefined;

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

    // Create layer groups for graph rendering
    edgeLayerRef.current = L.layerGroup().addTo(map);
    nodeLayerRef.current = L.layerGroup().addTo(map);
    pathLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      leafletMapRef.current = null;
      edgeLayerRef.current = null;
      nodeLayerRef.current = null;
      pathLayerRef.current = null;
    };
  }, [mapMode, nodeCoords]);

  const mstSet = useMemo(() => new Set(mstEdges), [mstEdges]);
  const kruskalSet = useMemo(() => new Set(kruskalEdges), [kruskalEdges]);
  const negCycleSet = useMemo(() => new Set(negCycleEdges), [negCycleEdges]);
  const hasDivergence = divergenceData !== null;

  // ── Leaflet layer updates (map mode) ────────────────────────────────
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!mapMode || !map || !edgeLayerRef.current) return;

    // Clear existing layers
    edgeLayerRef.current.clearLayers();
    nodeLayerRef.current.clearLayers();
    pathLayerRef.current.clearLayers();

    const maxWeight = edges.reduce((m, e) => Math.max(m, edgeWeight(e)), 1);

    // ── Draw edges ──
    edges.forEach((edge, idx) => {
      const ca = nodeCoords[edge.a];
      const cb = nodeCoords[edge.b];
      if (!ca || !cb) return;

      const isSpt = sptSet.has(idx);
      const isFlash = flashSet.has(idx);
      const isOptimal = optimalEdgeSet.has(edgeKey(edge.a, edge.b));
      const isMst = mstSet.has(idx);

      const t = Math.min(1, edgeWeight(edge) / maxWeight);
      const r = Math.round(34 + t * 221);
      const g = Math.round(197 - t * 128);
      const bC = Math.round(94 - t * 25);
      let color = `rgb(${r},${g},${bC})`;
      let weight = 2 + t * 2;
      let dashArray = null;
      let opacity = 0.7;

      if (isSpt) { color = COLOR.edgeSpt; weight += 1; opacity = 0.9; }
      if (isOptimal) { color = "#60a5fa"; weight += 1.5; opacity = 1; }
      if (isFlash) { color = COLOR.edgeFlash; weight += 1; opacity = 1; }
      if (isMst) { color = "#22c55e"; dashArray = "8 5"; weight = 3; opacity = 0.8; }

      // Invisible, wide polyline for easier clicking and tooltip
      const hitBox = L.polyline(
        [[ca.lat, ca.lng], [cb.lat, cb.lng]],
        { color: 'transparent', weight: 20, opacity: 0, className: "graph-edge-hitbox" }
      );

      hitBox.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        if (onEdgeClick) onEdgeClick(idx);
      });

      hitBox.bindTooltip(
        `Edge ${edge.a}↔${edge.b}<br>Weight: ${edgeWeight(edge).toFixed(1)}<br>σ: ${edgeSigma(edge).toFixed(2)}`,
        { sticky: true, className: "edge-tooltip" }
      );

      hitBox.addTo(edgeLayerRef.current);

      // Visible polyline
      const polyline = L.polyline(
        [[ca.lat, ca.lng], [cb.lat, cb.lng]],
        { color, weight, opacity, dashArray, className: "graph-edge", interactive: false }
      );

      polyline.addTo(edgeLayerRef.current);
    });

    // ── Draw ghost paths ──
    const drawGhost = (path, color) => {
      if (!path || path.length < 2) return;
      const latlngs = path.map(id => nodeCoords[id]).filter(Boolean).map(c => [c.lat, c.lng]);
      if (latlngs.length < 2) return;
      L.polyline(latlngs, { color, weight: 3, opacity: 0.35, dashArray: "6 8", interactive: false })
        .addTo(pathLayerRef.current);
    };
    drawGhost(ghostPaths.fastest, "#f97316");
    drawGhost(ghostPaths.safest, "#a855f7");

    // ── Draw A* path ──
    if (astarPath.length > 1) {
      const latlngs = astarPath.map(id => nodeCoords[id]).filter(Boolean).map(c => [c.lat, c.lng]);
      if (latlngs.length > 1) {
        L.polyline(latlngs, { color: "#fbbf24", weight: 4, opacity: 0.85, dashArray: "10 6", interactive: false })
          .addTo(pathLayerRef.current);
      }
    }

    // ── Draw optimal path ──
    if (optimalPath.length > 1) {
      const latlngs = optimalPath.map(id => nodeCoords[id]).filter(Boolean).map(c => [c.lat, c.lng]);
      if (latlngs.length > 1) {
        // Glowing backdrop for high visibility
        L.polyline(latlngs, { color: COLOR.edgePath, weight: 12, opacity: 0.3, interactive: false })
          .addTo(pathLayerRef.current);
        // Main solid path
        L.polyline(latlngs, { color: COLOR.edgePath, weight: 6, opacity: 1, interactive: false })
          .addTo(pathLayerRef.current);
      }
    }

    // ── Draw nodes ──
    nodes.forEach((node) => {
      const c = nodeCoords[node.id];
      if (!c) return;

      const isVisiting = visitingSet.has(node.id);
      const isOnPath = optimalPath.includes(node.id);

      let fillColor = "#1e293b";
      let borderColor = COLOR.nodeBorder;
      let radius = 8;
      if (isOnPath) { fillColor = "#0e4a5c"; borderColor = "#2dd4bf"; radius = 10; }
      if (isVisiting) { fillColor = "#7c6ef7"; borderColor = "#a78bfa"; radius = 11; }

      const marker = L.circleMarker([c.lat, c.lng], {
        radius,
        fillColor,
        color: borderColor,
        weight: 2,
        fillOpacity: 0.9,
      });

      const label = node.label || `Node ${node.id}`;
      const distText = Number.isFinite(node.dist) ? node.dist.toFixed(1) : "∞";

      marker.bindTooltip(
        `<b>${label}</b><br>Dist: ${distText}`,
        { direction: "top", offset: [0, -10], className: "node-tooltip" }
      );

      marker.on("click", () => {
        if (onNodeClick) onNodeClick(node.id);
      });

      marker.addTo(nodeLayerRef.current);
    });

  }, [mapMode, nodes, edges, nodeCoords, sptSet, flashSet, optimalEdgeSet, visitingSet,
      optimalPath, ghostPaths, mstSet, astarPath, onEdgeClick, onNodeClick]);

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

    const existingPositions = new Map();
    graphRef.current.nodes.forEach(n => {
      if (Number.isFinite(n.x) && Number.isFinite(n.y)) {
        existingPositions.set(n.id, { x: n.x, y: n.y, vx: n.vx || 0, vy: n.vy || 0 });
      }
    });

    const localNodes = nodes.map((node) => {
      const existing = existingPositions.get(node.id);
      return existing ? { ...node, ...existing } : { ...node };
    });
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
      simulation.alpha(existingPositions.size > 0 ? 0.3 : 1).restart();

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

        // Negative cycle pulsing red
        let lineWidth = 1 + t * 3;
        const isNegCycle = negCycleSet.has(edge._index);
        if (isNegCycle) {
          const flashAlpha = 0.5 + ((Math.sin(performance.now() / 75) + 1) * 0.5) * 0.5;
          stroke = COLOR.edgeFlash;
          lineWidth += 2;
          ctx.globalAlpha = flashAlpha;
        }

        // Feature 4: Divergence mode coloring
        const isMstEdge = mstSet.has(edge._index) || kruskalSet.has(edge._index);
        if (hasDivergence && !isFlash && !isNegCycle) {
          if (isSpt && !isMstEdge) {
            stroke = "#a78bfa"; // SPT only — purple
            ctx.globalAlpha = 0.9;
          } else if (!isSpt && isMstEdge) {
            stroke = "#22c55e"; // MST only — green
            ctx.globalAlpha = 0.9;
          } else if (isSpt && isMstEdge) {
            stroke = "#ffffff"; // Both — white
            ctx.globalAlpha = 1;
          } else {
            ctx.globalAlpha = 0.4; // Neither — dim
          }
        }

        // Weight-based thickness adjustments
        if (showUncertainty) {
          lineWidth = Math.max(lineWidth, 1 + edgeSigma(edge));
        }
        if (isSpt) {
          lineWidth += 1.5;
        }
        if (isOptimal) {
          lineWidth += 1.2;
        }

        ctx.save();

        // SPT glow effect — draw a wider, semi-transparent stroke underneath
        if (isSpt && !isFlash) {
          ctx.save();
          ctx.strokeStyle = "rgba(167, 139, 250, 0.35)";
          ctx.lineWidth = lineWidth + 6;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          ctx.restore();
        }

        // Both (divergence) glow
        if (hasDivergence && isSpt && isMstEdge && !isFlash) {
          ctx.save();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
          ctx.lineWidth = lineWidth + 8;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          ctx.restore();
        }

        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;

        if (showUncertainty && edgeSigma(edge) > 0.8) {
          ctx.setLineDash([6, 5]);
        } else {
          ctx.setLineDash([]);
        }

        if (isFlash && !isNegCycle) {
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

          // Feature 4: Divergence labels at edge midpoint (demo mode only)
          if (hasDivergence && !isFlash) {
            let divLabel = null;
            let divColor = null;
            if (isSpt && !isMstEdge) { divLabel = "SP"; divColor = "#a78bfa"; }
            else if (!isSpt && isMstEdge) { divLabel = "MST"; divColor = "#22c55e"; }
            else if (isSpt && isMstEdge) { divLabel = "BOTH"; divColor = "#ffffff"; }
            if (divLabel) {
              ctx.fillStyle = divColor;
              ctx.font = "bold 8px system-ui, sans-serif";
              ctx.fillText(divLabel, mx - ox * 0.8, my - oy * 0.8);
            }
          }
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
        const isOnFrontier = stepFrontierSet.has(node.id);
        const isInStepMode = stepState !== null && stepFrontier.length > 0;
        const isSettled = isInStepMode && stepState?.visited?.has(node.id);
        const isUndiscovered = isInStepMode && !isSettled && !isOnFrontier;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);

        // Step mode: 3-state visual distinction
        if (isInStepMode) {
          if (isSettled) {
            // Settled — solid teal fill
            ctx.fillStyle = "#0e4a5c";
            ctx.fill();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = "#2dd4bf";
            ctx.stroke();
          } else if (isOnFrontier) {
            // Frontier — amber fill at 30% opacity + amber ring
            ctx.fillStyle = "rgba(251, 191, 36, 0.3)";
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "rgba(251, 191, 36, 0.85)";
            ctx.stroke();
            // Outer ring
            ctx.beginPath();
            ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(251, 191, 36, 0.85)";
            ctx.lineWidth = 2.5;
            ctx.stroke();
          } else {
            // Undiscovered — dimmed
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = COLOR.nodeFill;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = COLOR.nodeBorder;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        } else {
          // Normal mode
          ctx.fillStyle = isOnOptPath ? "#0e4a5c" : COLOR.nodeFill;
          ctx.fill();
          ctx.lineWidth = isOnOptPath ? 2.5 : 2;
          ctx.strokeStyle = isOnOptPath ? "#2dd4bf" : COLOR.nodeBorder;
          ctx.stroke();
        }

        // Step-by-step frontier: amber ring (non-step-mode fallback)
        if (!isInStepMode && isOnFrontier && !isVisiting) {
          ctx.beginPath();
          ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(251, 191, 36, 0.85)";
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }

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

      // ── Ghost alternate routes ─────────────────────────────────
      const drawGhostPath = (path, color) => {
        if (!path || path.length < 2) return;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.3;
        ctx.setLineDash([6, 8]);
        let started = false;
        ctx.beginPath();
        for (const nodeId of path) {
          const pos = getPos(nodeId);
          const node = nodeById.get(nodeId);
          const px = pos?.x ?? node?.x;
          const py = pos?.y ?? node?.y;
          if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
          if (!started) { ctx.moveTo(px, py); started = true; }
          else { ctx.lineTo(px, py); }
        }
        if (started) ctx.stroke();
        ctx.restore();
      };
      drawGhostPath(ghostPaths.fastest, "#f97316"); // orange
      drawGhostPath(ghostPaths.safest, "#a855f7");  // purple

      // ── Optimal path overlay ───────────────────────────────────
      if (optimalPath.length > 1) {
        ctx.save();
        // High visibility glow
        ctx.shadowColor = COLOR.edgePath;
        ctx.shadowBlur = 16;
        ctx.strokeStyle = COLOR.edgePath;
        ctx.lineWidth = 6;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

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

      // ── Duel wave animation ────────────────────────────────────
      if (duelMode && duelData && duelData.timestamp) {
        const elapsed = performance.now() - duelData.timestamp;
        if (elapsed < 2000) {
          const progress = elapsed / 2000;
          const fadeAlpha = 1 - progress;

          // Red wave: all nodes (what full Dijkstra would touch)
          for (const node of graph.nodes) {
            const pos = getPos(node.id) || { x: node.x, y: node.y };
            if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue;
            const waveRadius = (mapMode ? NODE_RADIUS_MAP : NODE_RADIUS) + 6 + progress * 28;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, waveRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(239, 68, 68, ${(fadeAlpha * 0.4).toFixed(3)})`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          // Green ripple: only selective nodes
          const selSet = new Set(duelData.selectiveNodes || []);
          for (const node of graph.nodes) {
            if (!selSet.has(node.id)) continue;
            const pos = getPos(node.id) || { x: node.x, y: node.y };
            if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue;
            const greenRadius = (mapMode ? NODE_RADIUS_MAP : NODE_RADIUS) + 4 + progress * 18;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, greenRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(34, 197, 94, ${(fadeAlpha * 0.8).toFixed(3)})`;
            ctx.lineWidth = 3;
            ctx.stroke();
            // Green fill
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, greenRadius * 0.6, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(34, 197, 94, ${(fadeAlpha * 0.15).toFixed(3)})`;
            ctx.fill();
          }
        }
      }
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [duelMode, duelData, flashSet, ghostPaths, mapMode, nodeCoords, optimalEdgeSet, optimalPath, showUncertainty, sptSet, stepFrontierSet, visitingSet, negCycleSet, kruskalSet, hasDivergence, mstSet]);

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
      let bestDist = 24; // max click distance in px

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
        onClick={!mapMode ? handleCanvasClick : undefined}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: mapMode ? -1 : 1,
          width: "100%",
          height: "100%",
          display: mapMode ? "none" : "block",
          cursor: "crosshair",
          background: mapMode ? "transparent" : "#09090b",
          pointerEvents: mapMode ? "none" : "auto",
        }}
      />
    </div>
  );
}