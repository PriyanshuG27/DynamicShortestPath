import React, { useEffect, useState } from "react";

function sourceLabel(node) {
  if (typeof node.label === "string" && node.label.length > 0) {
    return node.label;
  }
  if (typeof node.id === "number" && node.id >= 0 && node.id < 26) {
    return String.fromCharCode(65 + node.id);
  }
  return String(node.id ?? "?");
}

export default function Controls({
  onRun,
  onRunProbabilistic,
  onRunStandard,
  onRunBellman,
  onReset,
  onAdversarial,
  onRandom,
  onBatch,
  onCustomInit,
  onManualUpdate,
  onManualBatch,
  onLoadOsm,
  onNotice,
  onToggleUncertainty,
  onModeChange,
  onSourceChange,
  onRiskChange,
  onSpeedChange,
  onTrafficModeChange,
  onTrafficIntervalChange,
  nodes,
  edges,
  source,
  mode,
  risk,
  speed,
  trafficMode,
  trafficIntervalMs,
  showUncertainty,
}) {
  const [customNodeCount, setCustomNodeCount] = useState(nodes.length || 1);
  const [customEdgesText, setCustomEdgesText] = useState("");

  const [manualEdgeIdx, setManualEdgeIdx] = useState(0);
  const [manualWeight, setManualWeight] = useState(5);
  const [manualSigma, setManualSigma] = useState(0.5);

  const [batchText, setBatchText] = useState("0,5.0,0.4\n1,3.5,0.6\n2,2.0,0.3");

  const [osmMaxNodes, setOsmMaxNodes] = useState(50);
  const [osmRebuild, setOsmRebuild] = useState(false);

  useEffect(() => {
    setCustomNodeCount(nodes.length || 1);
  }, [nodes.length]);

  useEffect(() => {
    if (!Array.isArray(edges) || edges.length === 0) {
      return;
    }
    const text = edges
      .map((e) => `${e.a},${e.b},${Number(e.weight).toFixed(2)},${Number(e.sigma).toFixed(2)}`)
      .join("\n");
    setCustomEdgesText(text);
  }, [edges.length]);

  const reportNotice = (type, message) => {
    if (typeof onNotice === "function") {
      onNotice(type, message);
    }
  };

  const parseEdgeLines = (text, nodeCount) => {
    const parsed = [];
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (let i = 0; i < lines.length; i += 1) {
      const parts = lines[i].split(/[\s,]+/).filter(Boolean);
      if (parts.length < 4) {
        throw new Error(`edge line ${i + 1}: expected a,b,weight,sigma`);
      }

      const a = Number(parts[0]);
      const b = Number(parts[1]);
      const weight = Number(parts[2]);
      const sigma = Number(parts[3]);

      if (![a, b, weight, sigma].every(Number.isFinite)) {
        throw new Error(`edge line ${i + 1}: invalid numeric value`);
      }

      if (a < 0 || b < 0 || a >= nodeCount || b >= nodeCount) {
        throw new Error(`edge line ${i + 1}: node index must be in [0, ${nodeCount - 1}]`);
      }

      parsed.push([Math.floor(a), Math.floor(b), weight, sigma]);
    }

    if (parsed.length === 0) {
      throw new Error("at least one edge is required");
    }

    return parsed;
  };

  const parseBatchLines = (text, edgeCount) => {
    const parsed = [];
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (let i = 0; i < lines.length; i += 1) {
      const parts = lines[i].split(/[\s,]+/).filter(Boolean);
      if (parts.length < 3) {
        throw new Error(`batch line ${i + 1}: expected edgeIdx,weight,sigma`);
      }

      const edgeIdx = Number(parts[0]);
      const weight = Number(parts[1]);
      const sigma = Number(parts[2]);

      if (![edgeIdx, weight, sigma].every(Number.isFinite)) {
        throw new Error(`batch line ${i + 1}: invalid numeric value`);
      }

      if (edgeIdx < 0 || edgeIdx >= edgeCount) {
        throw new Error(`batch line ${i + 1}: edgeIdx must be in [0, ${edgeCount - 1}]`);
      }

      parsed.push([Math.floor(edgeIdx), weight, sigma]);
    }

    if (parsed.length === 0) {
      throw new Error("at least one batch update line is required");
    }

    return parsed;
  };

  const handleCustomInit = () => {
    if (typeof onCustomInit !== "function") {
      return;
    }

    try {
      const nodeCount = Math.max(1, Math.floor(Number(customNodeCount) || 1));
      const parsedEdges = parseEdgeLines(customEdgesText, nodeCount);
      onCustomInit({ nodes: nodeCount, edges: parsedEdges });
    } catch (err) {
      reportNotice("err", err.message);
    }
  };

  const handleManualUpdate = () => {
    if (typeof onManualUpdate !== "function") {
      return;
    }

    const edgeCount = Array.isArray(edges) ? edges.length : 0;
    const edgeIdx = Math.floor(Number(manualEdgeIdx));
    const weight = Number(manualWeight);
    const sigma = Number(manualSigma);

    if (!Number.isFinite(edgeIdx) || edgeIdx < 0 || edgeIdx >= edgeCount) {
      reportNotice("err", `edgeIdx must be in [0, ${Math.max(0, edgeCount - 1)}]`);
      return;
    }
    if (!Number.isFinite(weight) || !Number.isFinite(sigma)) {
      reportNotice("err", "weight and sigma must be valid numbers");
      return;
    }

    onManualUpdate({ edgeIdx, weight, sigma });
  };

  const handleManualBatch = () => {
    if (typeof onManualBatch !== "function") {
      return;
    }

    try {
      const edgeCount = Array.isArray(edges) ? edges.length : 0;
      const updates = parseBatchLines(batchText, edgeCount);
      onManualBatch({ updates });
    } catch (err) {
      reportNotice("err", err.message);
    }
  };

  const handleLoadOsm = () => {
    if (typeof onLoadOsm !== "function") {
      return;
    }

    const maxNodes = Math.max(2, Math.floor(Number(osmMaxNodes) || 50));
    onLoadOsm({ maxNodes, rebuild: osmRebuild });
  };

  return (
    <section className="controls-panel">
      <div className="controls-grid">
        <div className="controls-row">
          <button className="ctl-btn ctl-run" onClick={onRun}>
            ▶ Run
          </button>
          <button className="ctl-btn" onClick={onReset}>
            ↺ Reset
          </button>
          <button className="ctl-btn" onClick={onRandom}>
            + Edge Update
          </button>
        </div>

        <div className="controls-row">
          <button className="ctl-btn ctl-adversarial" onClick={onAdversarial}>
            ⚡ Adversarial
          </button>
          <button className="ctl-btn" onClick={onBatch}>
            ⊞ Batch
          </button>
          <button className="ctl-btn" onClick={onToggleUncertainty}>
            σ Uncertainty {showUncertainty ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      <div className="controls-grid controls-direct-run">
        <div className="controls-row controls-row-4">
          <button className="ctl-btn" onClick={onRunProbabilistic}>
            Run Probabilistic
          </button>
          <button className="ctl-btn" onClick={onRunStandard}>
            Run Standard
          </button>
          <button className="ctl-btn" onClick={onRunBellman}>
            Run Bellman
          </button>
          <button className="ctl-btn" onClick={onReset}>
            Reset Graph
          </button>
        </div>
      </div>

      <div className="controls-meta">
        <div className="control-block">
          <div className="block-title">Source Node</div>
          <div className="source-row">
            {nodes.map((node) => (
              <button
                key={node.id}
                className={`source-btn ${source === node.id ? "active" : ""}`}
                onClick={() => onSourceChange(node.id)}
              >
                {sourceLabel(node)}
              </button>
            ))}
          </div>
        </div>

        <div className="control-block">
          <div className="block-title">Mode</div>
          <div className="mode-toggle">
            <button
              className={`mode-btn ${mode === "selective" ? "active" : ""}`}
              onClick={() => onModeChange("selective")}
            >
              selective
            </button>
            <button
              className={`mode-btn ${mode === "full" ? "active" : ""}`}
              onClick={() => onModeChange("full")}
            >
              full recompute
            </button>
          </div>
        </div>

        <div className="slider-wrap">
          <label htmlFor="risk-slider">Risk k</label>
          <input
            id="risk-slider"
            type="range"
            min="0"
            max="3"
            step="0.1"
            value={risk}
            onChange={(e) => onRiskChange(Number(e.target.value))}
          />
          <div className="slider-value">Current: {Number(risk).toFixed(1)}</div>
        </div>

        <div className="slider-wrap">
          <label htmlFor="speed-slider">Speed</label>
          <input
            id="speed-slider"
            type="range"
            min="1"
            max="5"
            step="1"
            value={speed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
          />
          <div className="slider-value">Current: {Number(speed).toFixed(0)}</div>
        </div>

        <div className="slider-wrap">
          <label className="lab-check" htmlFor="traffic-toggle">
            <input
              id="traffic-toggle"
              type="checkbox"
              checked={trafficMode}
              onChange={(e) => onTrafficModeChange(e.target.checked)}
            />
            Simulate Traffic Mode
          </label>
          <label htmlFor="traffic-interval">Traffic Interval (ms)</label>
          <input
            id="traffic-interval"
            type="range"
            min="1200"
            max="6000"
            step="200"
            value={trafficIntervalMs}
            onChange={(e) => onTrafficIntervalChange(Number(e.target.value))}
          />
          <div className="slider-value">Cycle: {trafficIntervalMs} ms</div>
        </div>
      </div>

      <div className="lab-panel">
        <div className="lab-title">UI Testing Lab</div>
        <div className="lab-grid">
          <div className="lab-card">
            <div className="lab-card-title">1) Custom Graph Init</div>
            <label className="lab-label" htmlFor="lab-node-count">
              Node Count
            </label>
            <input
              id="lab-node-count"
              type="number"
              min="1"
              value={customNodeCount}
              onChange={(e) => setCustomNodeCount(e.target.value)}
            />

            <label className="lab-label" htmlFor="lab-edges">
              Edges (a,b,weight,sigma) one per line
            </label>
            <textarea
              id="lab-edges"
              rows={7}
              value={customEdgesText}
              onChange={(e) => setCustomEdgesText(e.target.value)}
            />
            <button className="ctl-btn" onClick={handleCustomInit}>
              Apply Custom Init
            </button>
          </div>

          <div className="lab-card">
            <div className="lab-card-title">2) Manual Edge Update</div>
            <label className="lab-label" htmlFor="lab-edge-idx">
              Edge Index (0 to {Math.max(0, edges.length - 1)})
            </label>
            <input
              id="lab-edge-idx"
              type="number"
              min="0"
              value={manualEdgeIdx}
              onChange={(e) => setManualEdgeIdx(e.target.value)}
            />

            <label className="lab-label" htmlFor="lab-edge-weight">
              New Weight
            </label>
            <input
              id="lab-edge-weight"
              type="number"
              step="0.1"
              value={manualWeight}
              onChange={(e) => setManualWeight(e.target.value)}
            />

            <label className="lab-label" htmlFor="lab-edge-sigma">
              New Sigma
            </label>
            <input
              id="lab-edge-sigma"
              type="number"
              step="0.1"
              value={manualSigma}
              onChange={(e) => setManualSigma(e.target.value)}
            />

            <button className="ctl-btn" onClick={handleManualUpdate}>
              Apply Manual Update
            </button>
          </div>

          <div className="lab-card">
            <div className="lab-card-title">3) Manual Batch Update</div>
            <label className="lab-label" htmlFor="lab-batch">
              Batch Lines (edgeIdx,weight,sigma)
            </label>
            <textarea
              id="lab-batch"
              rows={7}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
            />
            <button className="ctl-btn" onClick={handleManualBatch}>
              Apply Manual Batch
            </button>
          </div>

          <div className="lab-card">
            <div className="lab-card-title">4) OSM Graph Loader</div>
            <label className="lab-label" htmlFor="lab-osm-max">
              Max Nodes
            </label>
            <input
              id="lab-osm-max"
              type="number"
              min="2"
              value={osmMaxNodes}
              onChange={(e) => setOsmMaxNodes(e.target.value)}
            />

            <label className="lab-check">
              <input
                type="checkbox"
                checked={osmRebuild}
                onChange={(e) => setOsmRebuild(e.target.checked)}
              />
              Force rebuild from map source
            </label>

            <button className="ctl-btn" onClick={handleLoadOsm}>
              Load OSM Graph
            </button>
            <div className="lab-hint">
              Tip: run init first, then test run/adversarial/random/update/batch directly from UI.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
