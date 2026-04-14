function sourceLabel(node) {
  if (typeof node.label === "string" && node.label.length > 0) {
    return node.label;
  }
  const id = Number(node.id);
  if (Number.isInteger(id) && id >= 0 && id < 26) {
    return String.fromCharCode(65 + id);
  }
  return String(node.id ?? "?");
}

export default function Controls({
  onRun,
  onReset,
  onSourceChange,
  onModeChange,
  onRiskChange,
  onSpeedChange,
  nodes,
  source,
  mode,
  risk,
  speed,
  onLoadMap,
  mapMode,
  onMapModeChange,
  onTrafficScenario,
}) {
  return (
    <section className="controls-panel">
      {/* Row 1: Primary actions */}
      <div className="controls-row">
        <button className="ctl-btn ctl-run" onClick={onRun}>
          ▶ Run Algorithm
        </button>
        <button className="ctl-btn" onClick={onReset}>
          ↺ Reset
        </button>
      </div>

      {/* Row 2: Map controls */}
      <div className="controls-row">
        <button className="ctl-btn ctl-map" onClick={onLoadMap}>
          🗺 Load Noida Map
        </button>
        <button
          className={`ctl-btn ${mapMode ? "ctl-map active" : ""}`}
          onClick={() => onMapModeChange(!mapMode)}
        >
          {mapMode ? "🗺 Map Mode" : "⬡ Demo Mode"}
        </button>
      </div>

      {/* Traffic scenario presets — only shown in map mode */}
      {mapMode && (
        <>
          <div className="controls-row controls-row-4">
            <button
              className="ctl-btn ctl-traffic rush"
              onClick={() => onTrafficScenario("rush_hour")}
            >
              🚗 Rush Hour
            </button>
            <button
              className="ctl-btn ctl-traffic rain"
              onClick={() => onTrafficScenario("rain")}
            >
              🌧 Rain
            </button>
            <button
              className="ctl-btn ctl-traffic roadwork"
              onClick={() => onTrafficScenario("roadwork")}
            >
              🚧 Roadwork
            </button>
            <button
              className="ctl-btn ctl-traffic clear"
              onClick={() => onTrafficScenario("clear")}
            >
              ✅ Clear
            </button>
          </div>
          <div className="edge-hint">
            💡 Click any edge on the map to manually update its weight
          </div>
        </>
      )}

      {/* Source node selector */}
      <div className="control-block">
        <div className="block-title">Source Node</div>
        {nodes.length <= 10 ? (
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
        ) : (
          <select
            className="source-select"
            value={source}
            onChange={(e) => onSourceChange(Number(e.target.value))}
          >
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {sourceLabel(node)}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Mode toggle */}
      <div className="control-block">
        <div className="block-title">Update Mode</div>
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

      {/* Sliders */}
      <div className="slider-row">
        <div className="slider-wrap">
          <label htmlFor="risk-slider">
            Risk k <span className="slider-val">{Number(risk).toFixed(1)}</span>
          </label>
          <input
            id="risk-slider"
            type="range"
            min="0"
            max="3"
            step="0.1"
            value={risk}
            onChange={(event) => onRiskChange(Number(event.target.value))}
          />
          <div className="slider-hints">
            <span>Fast</span>
            <span>Reliable</span>
          </div>
        </div>

        <div className="slider-wrap">
          <label htmlFor="speed-slider">Animation Speed</label>
          <input
            id="speed-slider"
            type="range"
            min="1"
            max="5"
            step="1"
            value={speed}
            onChange={(event) => onSpeedChange(Number(event.target.value))}
          />
        </div>
      </div>
    </section>
  );
}
