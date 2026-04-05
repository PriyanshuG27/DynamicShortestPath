import React, { useMemo } from "react";

const BAR_COLORS = {
  dijkstra: "#7c6ef7",
  standard: "#2dd4bf",
  bellman: "#f59e0b",
};

function progressWidth(value, max) {
  if (!max || max <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function logKind(entry) {
  const t = String(entry.type || "").toLowerCase();
  if (t.includes("error") || t.includes("err")) {
    return "err";
  }
  if (t.includes("warn") || t.includes("conflict")) {
    return "warn";
  }
  return "highlight";
}

export default function SidePanel({
  dijkstraResult,
  standardResult,
  bellmanResult,
  stats,
  log,
}) {
  const rows = useMemo(
    () => [
      { key: "dijkstra", label: "Dijkstra", value: dijkstraResult?.relaxations ?? 0 },
      { key: "standard", label: "Standard", value: standardResult?.relaxations ?? 0 },
      { key: "bellman", label: "Bellman", value: bellmanResult?.relaxations ?? 0 },
    ],
    [dijkstraResult, standardResult, bellmanResult]
  );

  const maxRelax = Math.max(1, ...rows.map((r) => r.value));

  return (
    <aside className="side-panel">
      <div className="panel-section">
        <h3>Algorithm Comparison</h3>
        <div className="algo-rows">
          {rows.map((row) => {
            const width = progressWidth(row.value, maxRelax);
            return (
              <div key={row.key} className="algo-row">
                <div className="algo-label">{row.label}</div>
                <div className="algo-bar-track">
                  <div
                    className="algo-bar-fill"
                    style={{
                      width: `${width}%`,
                      backgroundColor: BAR_COLORS[row.key],
                    }}
                  />
                </div>
                <div className="algo-value">{row.value}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel-section">
        <h3>Stats</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">nodes</div>
            <div className="stat-value">{stats.nodes}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">edges</div>
            <div className="stat-value">{stats.edges}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">updates</div>
            <div className="stat-value">{stats.updates}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">re-evaluated</div>
            <div className="stat-value">{stats.reEvaluated}</div>
          </div>
        </div>
      </div>

      <div className="panel-section log-section">
        <h3>Event Log</h3>
        <div className="event-log">
          {log.map((entry) => (
            <div key={entry.id} className={`log-item ${logKind(entry)}`}>
              <div className="log-head">{entry.type}</div>
              <div className="log-body">{entry.message}</div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
