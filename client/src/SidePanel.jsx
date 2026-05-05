import { useMemo } from "react";

const BAR_COLORS = {
  dijkstra: "#7c6ef7",
  standard: "#2dd4bf",
  bellman: "#f59e0b",
};

const COMPLEXITY = {
  dijkstra: "O(E log V)",
  standard: "O(E log V)",
  bellman: "O(V·E)",
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

export default function SidePanel({
  algoResults,
  stats,
  log,
  reliability,
  efficiency,
  duelData,
  ghostPaths,
  risk,
  astarResult,
  mstEdges,
  nodes,
  edges,
}) {
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

  // Duel display data
  const duelSaved = duelData
    ? Math.round(((duelData.fullCount - duelData.selectiveCount) / Math.max(1, duelData.fullCount)) * 100)
    : null;

  // MST total weight
  const mstTotalWeight = useMemo(() => {
    if (!mstEdges || mstEdges.length === 0 || !edges) return null;
    let total = 0;
    for (const idx of mstEdges) {
      if (edges[idx]) total += Number(edges[idx].weight) || 0;
    }
    return Math.round(total * 100) / 100;
  }, [mstEdges, edges]);

  return (
    <aside className="side-panel">
      {/* ── Algorithm Comparison with Complexity ── */}
      <section className="panel-section">
        <h3>Algorithm Comparison</h3>
        <div className="algo-rows">
          {rows.map((row) => (
            <div className="algo-row" key={row.key}>
              <div className="algo-label">
                {row.label}
                <span className="algo-complexity">{COMPLEXITY[row.key]}</span>
              </div>
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
        <div className="complexity-note">
          Values show actual edge relaxation count. Selective update: <b>O(k·ΔE)</b> — only recomputes affected nodes.
        </div>
      </section>

      {/* ── A* Search Result ── */}
      {astarResult && (
        <section className="panel-section astar-panel">
          <h3>⭐ A* vs Dijkstra</h3>
          <div className="astar-comparison">
            <div className="astar-col">
              <div className="astar-count" style={{ color: "#fbbf24" }}>
                {astarResult.nodesExpanded}
              </div>
              <div className="astar-label">A* Expanded</div>
            </div>
            <div className="astar-vs">vs</div>
            <div className="astar-col">
              <div className="astar-count" style={{ color: "#7c6ef7" }}>
                {astarResult.dijkstraExpanded}
              </div>
              <div className="astar-label">Dijkstra Expanded</div>
            </div>
          </div>
          {astarResult.dijkstraExpanded > 0 && (
            <div className="astar-saved">
              A* saved{" "}
              {Math.round(
                ((astarResult.dijkstraExpanded - astarResult.nodesExpanded) /
                  astarResult.dijkstraExpanded) *
                  100
              )}
              % node evaluations
            </div>
          )}
          <div className="astar-formula">
            f(n) = g(n) + h(n) where h = haversine distance to target
          </div>
        </section>
      )}

      {/* ── MST Info ── */}
      {mstEdges && mstEdges.length > 0 && (
        <section className="panel-section mst-panel">
          <h3>🌲 Minimum Spanning Tree</h3>
          <div className="mst-stats">
            <div className="mst-stat">
              <span className="mst-stat-label">MST Edges</span>
              <span className="mst-stat-value">{mstEdges.length}</span>
            </div>
            <div className="mst-stat">
              <span className="mst-stat-label">Total Weight</span>
              <span className="mst-stat-value">{mstTotalWeight}</span>
            </div>
          </div>
          <div className="mst-note">
            Prim's algorithm (Greedy) — O(E log V). MST minimizes total edge weight; SPT minimizes distance from source.
          </div>
        </section>
      )}

      {/* ── Algorithm Duel Result ── */}
      {duelData && (
        <section className="panel-section duel-panel">
          <h3>⚔ Algorithm Duel</h3>
          <div className="duel-comparison">
            <div className="duel-col duel-full">
              <div className="duel-count">{duelData.fullCount}</div>
              <div className="duel-label">Full Dijkstra</div>
              <div className="duel-bar-track">
                <div className="duel-bar-fill duel-bar-red" style={{ width: "100%" }} />
              </div>
            </div>
            <div className="duel-vs">vs</div>
            <div className="duel-col duel-selective">
              <div className="duel-count">{duelData.selectiveCount}</div>
              <div className="duel-label">Selective</div>
              <div className="duel-bar-track">
                <div
                  className="duel-bar-fill duel-bar-green"
                  style={{ width: `${Math.max(4, barPercent(duelData.selectiveCount, duelData.fullCount))}%` }}
                />
              </div>
            </div>
          </div>
          <div className="duel-saved">{duelSaved}% computation saved</div>
        </section>
      )}

      {/* ── Route Alternatives Legend ── */}
      {(ghostPaths?.fastest?.length > 1 || ghostPaths?.safest?.length > 1) && (
        <section className="panel-section ghost-legend">
          <h3>Route Alternatives</h3>
          <div className="ghost-rows">
            {ghostPaths.fastest.length > 1 && (
              <div className="ghost-row">
                <span className="ghost-swatch" style={{ background: "#f97316" }} />
                <span className="ghost-text">Fastest (k=0)</span>
              </div>
            )}
            <div className="ghost-row">
              <span className="ghost-swatch" style={{ background: "#60a5fa" }} />
              <span className="ghost-text">Current (k={Number(risk).toFixed(1)})</span>
            </div>
            {ghostPaths.safest.length > 1 && (
              <div className="ghost-row">
                <span className="ghost-swatch" style={{ background: "#a855f7" }} />
                <span className="ghost-text">Safest (k=3)</span>
              </div>
            )}
            {astarResult?.path?.length > 1 && (
              <div className="ghost-row">
                <span className="ghost-swatch" style={{ background: "#fbbf24" }} />
                <span className="ghost-text">A* path</span>
              </div>
            )}
          </div>
        </section>
      )}

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