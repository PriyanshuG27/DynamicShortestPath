import { useMemo } from "react";

const BAR_COLORS = {
  dijkstra: "#7c6ef7",
  standard: "#2dd4bf",
  bellman: "#f59e0b",
};

function barPercent(value, maxValue) {
  if (maxValue <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (value / maxValue) * 100));
}

function logClass(type) {
  const normalized = String(type || "").toLowerCase();
  if (normalized.includes("err")) {
    return "log-item err";
  }
  if (normalized.includes("adversarial") || normalized.includes("warn")) {
    return "log-item warn";
  }
  return "log-item";
}

export default function SidePanel({ algoResults, stats, log, reliability, efficiency }) {
  const rows = useMemo(
    () => [
      {
        key: "dijkstra",
        label: "Dijkstra",
        value: algoResults?.dijkstraResult?.relaxations ?? 0,
      },
      {
        key: "standard",
        label: "Standard",
        value: algoResults?.standardResult?.relaxations ?? 0,
      },
      {
        key: "bellman",
        label: "Bellman",
        value: algoResults?.bellmanResult?.relaxations ?? 0,
      },
    ],
    [algoResults]
  );

  const maxValue = Math.max(1, ...rows.map((row) => Number(row.value) || 0));

  return (
    <aside className="side-panel">
      <section className="panel-section">
        <h3>Algorithm Comparison</h3>
        <div className="algo-rows">
          {rows.map((row) => (
            <div className="algo-row" key={row.key}>
              <div className="algo-label">{row.label}</div>
              <div className="algo-bar-track">
                <div
                  className="algo-bar-fill"
                  style={{
                    width: `${barPercent(Number(row.value) || 0, maxValue)}%`,
                    backgroundColor: BAR_COLORS[row.key],
                  }}
                />
              </div>
              <div className="algo-value">{Number(row.value) || 0}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Efficiency Meter ── */}
      {efficiency !== null && (
        <section className="panel-section efficiency-panel">
          <h3>Selective Update Efficiency</h3>
          <div className="efficiency-meter">
            <div className="efficiency-value">{efficiency}%</div>
            <div className="efficiency-label">Nodes Skipped</div>
            <div className="efficiency-bar-track">
              <div
                className="efficiency-bar-fill"
                style={{ width: `${efficiency}%` }}
              />
            </div>
            <div className="efficiency-detail">
              {stats.reEvaluated} recomputed of {stats.updates * stats.nodes} possible
            </div>
          </div>
        </section>
      )}

      {/* ── Path Reliability Score ── */}
      {reliability !== null && (
        <section className="panel-section reliability-panel">
          <div className="reliability-row">
            <span className="reliability-label">Path Reliability</span>
            <span
              className="reliability-value"
              style={{
                color:
                  reliability >= 70
                    ? "#22c55e"
                    : reliability >= 40
                    ? "#f59e0b"
                    : "#ef4444",
              }}
            >
              {reliability}%
            </span>
          </div>
          <div className="reliability-bar-track">
            <div
              className="reliability-bar-fill"
              style={{
                width: `${reliability}%`,
                background:
                  reliability >= 70
                    ? "linear-gradient(90deg, #22c55e, #4ade80)"
                    : reliability >= 40
                    ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                    : "linear-gradient(90deg, #ef4444, #f87171)",
              }}
            />
          </div>
        </section>
      )}

      <section className="panel-section">
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
      </section>

      <section className="panel-section log-section">
        <h3>Event Log</h3>
        <div className="event-log">
          {log.map((entry) => (
            <div key={entry.id} className={logClass(entry.type)}>
              <div className="log-head">{entry.type}</div>
              <div className="log-body">{entry.message}</div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}