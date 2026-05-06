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

export default function Controls({
  onRun,
  onReset,
  onSourceChange,
  onDestinationChange,
  onModeChange,
  onRiskChange,
  onSpeedChange,
  nodes,
  source,
  destination,
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
  mstType,
  onRunAstar,
  onStartStep,
  onStepForward,
  onStepPlay,
  stepMode,
  stepPlaying,
  onChainAttack,
  onCopySummary,
  onInjectNegativeCycle,
  onRaceMode,
  optimalPath,
  onRunComplexityTest,
  complexityRunning,
}) {
  return (
    <section className="controls-panel">
      {/* Row 1: Primary actions */}
      <div className="controls-row controls-row-2">
        <button className="ctl-btn ctl-run" onClick={onRun}>
          Run Algorithm
        </button>
        <button className="ctl-btn" onClick={onReset}>
          Reset Grid
        </button>
        <button className="ctl-btn ctl-copy" onClick={onCopySummary}>
          Copy Summary
        </button>
      </div>

      {/* Row 2: Step-by-step Dijkstra */}
      <div className="controls-row controls-row-3">
        <button className="ctl-btn ctl-step" onClick={onStartStep}>
          Step Dijkstra
        </button>
        {stepMode && (
          <>
            <button className="ctl-btn" onClick={onStepForward}>
              Step →
            </button>
            <button className="ctl-btn" onClick={onStepPlay}>
              {stepPlaying ? "Pause" : "Play"}
            </button>
          </>
        )}
      </div>

      {/* Row 3: Map + DAA features */}
      <div className="controls-row controls-row-3">
        <button className="ctl-btn ctl-map" onClick={onLoadMap}>
          Load Map Data
        </button>
        {mapMode && (
          <button
            className="ctl-btn ctl-astar"
            onClick={() => onRunAstar(destination)}
          >
            Run A* Heuristic
          </button>
        )}
        {!mapMode && (
          <button
            className="ctl-btn ctl-neg-cycle"
            onClick={onInjectNegativeCycle}
          >
            Inject Negative Cycle
          </button>
        )}
      </div>

      {/* Row 4: MST buttons */}
      <div className="controls-row mst-btn-group">
        <button
          className={`ctl-btn ctl-mst-prim ${mstType === "prim" || mstType === "both" ? "active" : ""}`}
          onClick={() => onToggleMst("prim")}
        >
          Prim's MST
        </button>
        <button
          className={`ctl-btn ctl-mst-kruskal ${mstType === "kruskal" || mstType === "both" ? "active" : ""}`}
          onClick={() => onToggleMst("kruskal")}
        >
          Kruskal's MST
        </button>
        <button
          className={`ctl-btn ctl-mst-both ${mstType === "both" ? "active" : ""}`}
          onClick={() => onToggleMst("both")}
        >
          Compare Both
        </button>
      </div>

      {/* Source & Destination selectors */}
      <div className="control-block node-selector-block">
        <div className="node-selector-pair">
          <div className="node-selector">
            <div className="block-title">Source</div>
            {nodes.length <= 10 && !mapMode ? (
              <div className="source-row">
                {nodes.map((node) => (
                  <button
                    key={node.id}
                    className={`source-btn ${source === node.id ? "active" : ""}`}
                    onClick={() => onSourceChange(node.id)}
                    title={sourceLabel(node)}
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

          <div className="node-selector-arrow">→</div>

          <div className="node-selector">
            <div className="block-title">Destination</div>
            {nodes.length <= 10 && !mapMode ? (
              <div className="source-row">
                {nodes.map((node) => (
                  <button
                    key={node.id}
                    className={`source-btn dest-btn ${destination === node.id ? "active" : ""}`}
                    onClick={() => onDestinationChange(node.id)}
                    title={sourceLabel(node)}
                  >
                    {sourceLabel(node)}
                  </button>
                ))}
              </div>
            ) : (
              <select
                className="source-select dest-select"
                value={destination}
                onChange={(e) => onDestinationChange(Number(e.target.value))}
              >
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {sourceLabel(node)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Traffic scenario presets — only shown in map mode */}
      {mapMode && (
        <>
          <div className="controls-row controls-row-4">
            <button
              className="ctl-btn ctl-traffic rush"
              onClick={() => onTrafficScenario("rush_hour")}
            >
              Rush Hour
            </button>
            <button
              className="ctl-btn ctl-traffic rain"
              onClick={() => onTrafficScenario("rain")}
            >
              Rain
            </button>
            <button
              className="ctl-btn ctl-traffic roadwork"
              onClick={() => onTrafficScenario("roadwork")}
            >
              Roadwork
            </button>
            <button
              className="ctl-btn ctl-traffic clear"
              onClick={() => onTrafficScenario("clear")}
            >
              Clear Traffic
            </button>
          </div>

          {/* Duel Mode + Chain Attack + Algorithm Race */}
          <div className="controls-row controls-row-2">
            <button
              className={`ctl-btn ctl-duel ${duelMode ? "active" : ""}`}
              onClick={onDuelToggle}
            >
              Algorithm Duel {duelMode ? "ON" : "OFF"}
            </button>
            <button className="ctl-btn ctl-chain" onClick={onChainAttack}>
              Chain Attack (×3)
            </button>
          </div>

          {/* 24-Hour Timeline Scrubber */}
          <div className="control-block timeline-block">
            <div className="block-title">
              24-Hour Timeline
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
            Click any node to set it as source · Click any edge to edit weight
          </div>
        </>
      )}

      {/* Algorithm Race button */}
      <div className="controls-row controls-row-2">
        <button
          className="ctl-btn ctl-race"
          onClick={onRaceMode}
          disabled={!optimalPath || optimalPath.length === 0}
          title={(!optimalPath || optimalPath.length === 0) ? "Run an algorithm first" : "Race selective vs full Dijkstra"}
        >
          Algorithm Race
        </button>
        <button
          className={`ctl-btn ctl-complexity ${complexityRunning ? "active" : ""}`}
          onClick={onRunComplexityTest}
          disabled={complexityRunning}
        >
          {complexityRunning ? "Running..." : "Complexity Test"}
        </button>
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
