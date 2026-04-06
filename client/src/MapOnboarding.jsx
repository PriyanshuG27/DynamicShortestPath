import React from "react";

export default function MapOnboarding({
  open,
  maxNodes,
  onMaxNodesChange,
  onLoadMap,
  onSkip,
  onOpenEditor,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="overlay-modal" role="dialog" aria-modal="true" aria-label="Map onboarding">
      <div className="overlay-card">
        <h2>Welcome to Dynamic Route Lab</h2>
        <p>
          Start with a real-world graph from OpenStreetMap, or continue with the demo graph.
          Map mode is ideal for traffic-style edge changes and visual shortest-path comparisons.
        </p>

        <div className="map-preview">
          <div className="map-grid" />
          <div className="map-pin pin-a" />
          <div className="map-pin pin-b" />
          <div className="map-road" />
        </div>

        <div className="modal-control">
          <label htmlFor="onboarding-max-nodes">Map max nodes</label>
          <input
            id="onboarding-max-nodes"
            type="range"
            min="10"
            max="200"
            step="5"
            value={maxNodes}
            onChange={(event) => onMaxNodesChange(Number(event.target.value))}
          />
          <div>{maxNodes} nodes</div>
        </div>

        <div className="modal-actions">
          <button className="ctl-btn" onClick={onLoadMap}>
            Load Map Graph
          </button>
          <button className="ctl-btn" onClick={onOpenEditor}>
            Open Map Editor
          </button>
          <button className="ctl-btn" onClick={onSkip}>
            Skip to Demo Graph
          </button>
        </div>
      </div>
    </div>
  );
}
