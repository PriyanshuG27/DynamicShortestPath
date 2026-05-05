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

function formatHour(h) {
  const hour = Math.floor(h) % 24;
  const min = Math.round((h % 1) * 60);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${min.toString().padStart(2, "0")} ${ampm}`;
}

function timeEmoji(h) {
  if (h < 5 || h >= 22) return "🌙";
  if (h < 7) return "🌅";
  if (h < 17) return "☀️";
  return "🌆";
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
  onTrafficScenario,
  duelMode,
  onDuelToggle,
  timeOfDay,
  onTimeChange,
  onToggleMst,
  mstActive,
  onRunAstar,
  astarTarget,
  onAstarTargetChange,
}) {
  return (
    <section className="controls-panel">
      {/* Row 1: Primary actions */}
      <div className="controls-row controls-row-2">
        <button className="ctl-btn ctl-run" onClick={onRun}>
          ▶ Run Algorithm
        </button>
        <button className="ctl-btn" onClick={onReset}>
          ↺ Reset
        </button>
      </div>

      {/* Row 2: Map + DAA features */}
      <div className="controls-row controls-row-3">
        <button className="ctl-btn ctl-map" onClick={onLoadMap}>
          🗺 Load Noida Map
        </button>
        <button
          className={`ctl-btn ctl-mst ${mstActive ? "active" : ""}`}
          onClick={onToggleMst}
        >
          🌲 {mstActive ? "Hide MST" : "Show MST"}
        </button>
        {mapMode && (
          <button
            className="ctl-btn ctl-astar"
            onClick={() => {
              const t = astarTarget != null ? astarTarget : nodes.length - 1;
              onRunAstar(t);
            }}
          >
            ⭐ Run A*
          </button>
        )}
      </div>

      {/* A* target selector — map mode only */}
      {mapMode && (
        <div className="control-block">
          <div className="block-title">A* Target Node</div>
          <select
            className="source-select"
            value={astarTarget ?? nodes.length - 1}
            onChange={(e) => onAstarTargetChange(Number(e.target.value))}
          >
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {sourceLabel(node)}
              </option>
            ))}
          </select>
        </div>
      )}

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

          {/* Duel Mode Toggle */}
          <div className="controls-row controls-row-2">
            <button
              className={`ctl-btn ctl-duel ${duelMode ? "active" : ""}`}
              onClick={onDuelToggle}
            >
              ⚔ Algorithm Duel {duelMode ? "ON" : "OFF"}
            </button>
          </div>

          {/* 24-Hour Timeline Scrubber */}
          <div className="control-block timeline-block">
            <div className="block-title">
              {timeEmoji(timeOfDay ?? 12)} 24-Hour Timeline
              {timeOfDay !== null && (
                <span className="timeline-time">{formatHour(timeOfDay)}</span>
              )}
            </div>
            <input
              className="timeline-slider"
              type="range"
              min="0"
              max="24"
              step="0.5"
              value={timeOfDay ?? 12}
              onChange={(e) => onTimeChange(Number(e.target.value))}
            />
            <div className="timeline-marks">
              <span>12AM</span>
              <span>6AM</span>
              <span>12PM</span>
              <span>6PM</span>
              <span>12AM</span>
            </div>
          </div>

          <div className="edge-hint">
            💡 Click any node to set it as source · Click any edge to edit weight
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
