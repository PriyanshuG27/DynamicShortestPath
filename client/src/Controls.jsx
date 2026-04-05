import React from "react";

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
  onReset,
  onAdversarial,
  onRandom,
  onBatch,
  onToggleUncertainty,
  onModeChange,
  onSourceChange,
  onRiskChange,
  onSpeedChange,
  nodes,
  source,
  mode,
  showUncertainty,
}) {
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
            defaultValue="1"
            onChange={(e) => onRiskChange(Number(e.target.value))}
          />
        </div>

        <div className="slider-wrap">
          <label htmlFor="speed-slider">Speed</label>
          <input
            id="speed-slider"
            type="range"
            min="1"
            max="5"
            step="1"
            defaultValue="3"
            onChange={(e) => onSpeedChange(Number(e.target.value))}
          />
        </div>
      </div>
    </section>
  );
}
