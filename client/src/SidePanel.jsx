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
  stepState,
  optimalPath,
  source,
}) {
  const rows = useMemo(
    () => [
      {
        key: "dijkstra",
        label: "Dijkstra",
        value: algoResults?.dijkstraResult?.relaxations ?? 0,
        timeMs: algoResults?.dijkstraResult?.timeMs ?? null,
      },
      {
        key: "standard",
        label: "Standard",
        value: algoResults?.standardResult?.relaxations ?? 0,
        timeMs: algoResults?.standardResult?.timeMs ?? null,
      },
      {
        key: "bellman",
        label: "Bellman",
        value: algoResults?.bellmanResult?.relaxations ?? 0,
        timeMs: algoResults?.bellmanResult?.timeMs ?? null,
        negativeCycle: algoResults?.bellmanResult?.negativeCycle ?? false,
      },
    ],
    [algoResults]
  );

  const maxValue = Math.max(1, ...rows.map((row) => Number(row.value) || 0));

  // Negative cycle detection
  const hasNegativeCycle = rows.find((r) => r.key === "bellman")?.negativeCycle === true;

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

  // Graph Statistics
  const graphStats = useMemo(() => {
    if (!nodes || nodes.length === 0 || !edges || edges.length === 0) return null;
    const V = nodes.length;
    const E = edges.length;
    const density = V > 1 ? ((2 * E) / (V * (V - 1))) : 0;
    const avgDegree = V > 0 ? ((2 * E) / V) : 0;

    // Compute diameter via BFS from each node
    const adj = Array.from({ length: V }, () => []);
    edges.forEach((e) => {
      const w = Number(e.weight) || 1;
      adj[e.a].push({ to: e.b, w });
      adj[e.b].push({ to: e.a, w });
    });

    // Use current dist array for diameter (from source)
    let maxDist = 0;
    let farthestNode = null;
    nodes.forEach((n) => {
      if (Number.isFinite(n.dist) && n.dist > maxDist) {
        maxDist = n.dist;
        farthestNode = n;
      }
    });

    return {
      density: (density * 100).toFixed(1),
      avgDegree: avgDegree.toFixed(1),
      maxDist: Number.isFinite(maxDist) && maxDist > 0 ? maxDist.toFixed(1) : null,
      farthestLabel: farthestNode?.label || (farthestNode ? `N${farthestNode.id}` : null),
    };
  }, [nodes, edges]);

  // Theoretical cost calculation
  const theoryCost = useMemo(() => {
    if (!stats || stats.nodes <= 0) return null;
    const V = stats.nodes;
    const E = stats.edges;
    const dijkstra = Math.round(E * Math.log2(V));
    const bellman = V * E;
    return { dijkstra, bellman };
  }, [stats]);

  // Path cost breakdown
  const pathBreakdown = useMemo(() => {
    if (!optimalPath || optimalPath.length < 2 || !edges) return null;
    let totalWeight = 0;
    let totalSigma = 0;
    let hops = 0;
    const edgeDetails = [];
    for (let i = 0; i < optimalPath.length - 1; i++) {
      const a = optimalPath[i];
      const b = optimalPath[i + 1];
      const edge = edges.find(
        (e) => (e.a === a && e.b === b) || (e.a === b && e.b === a)
      );
      if (edge) {
        totalWeight += edge.weight;
        totalSigma += edge.sigma;
        hops++;
        const nodeA = nodes?.find((n) => n.id === a);
        const nodeB = nodes?.find((n) => n.id === b);
        edgeDetails.push({
          from: nodeA?.label || `N${a}`,
          to: nodeB?.label || `N${b}`,
          weight: edge.weight,
          sigma: edge.sigma,
          riskCost: edge.weight + (Number(risk) || 0) * edge.sigma,
        });
      }
    }
    return {
      totalWeight: Math.round(totalWeight * 100) / 100,
      totalSigma: Math.round(totalSigma * 100) / 100,
      totalRiskAdjusted: Math.round((totalWeight + (Number(risk) || 0) * totalSigma) * 100) / 100,
      hops,
      edges: edgeDetails,
    };
  }, [optimalPath, edges, risk, nodes]);

  return (
    <aside className="side-panel">
      {/* ── Negative Cycle Alert ── */}
      {hasNegativeCycle && (
        <section className="panel-section negative-cycle-alert">
          <div className="nc-icon">⚠</div>
          <div className="nc-text">
            <div className="nc-title">Negative Cycle Detected</div>
            <div className="nc-body">
              Bellman-Ford detected a negative-weight cycle. Finite shortest paths cannot be guaranteed for all nodes.
            </div>
          </div>
        </section>
      )}

      {/* ── Step-by-Step Dijkstra Status ── */}
      {stepState && (
        <section className="panel-section step-panel">
          <h3>Dijkstra Step-by-Step</h3>
          <div className="step-stats">
            <div className="step-stat">
              <span className="step-stat-label">Step</span>
              <span className="step-stat-value">{stepState.stepNumber}</span>
            </div>
            <div className="step-stat">
              <span className="step-stat-label">Current Node</span>
              <span className="step-stat-value">{stepState.currentNode >= 0 ? stepState.currentNode : "—"}</span>
            </div>
            <div className="step-stat">
              <span className="step-stat-label">Visited</span>
              <span className="step-stat-value">{stepState.visited?.size ?? 0}</span>
            </div>
            <div className="step-stat">
              <span className="step-stat-label">Frontier</span>
              <span className="step-stat-value">{stepState.frontier?.length ?? 0}</span>
            </div>
          </div>
          <div className="step-legend">
            <span className="step-legend-item"><span className="step-dot visited"></span> Visited</span>
            <span className="step-legend-item"><span className="step-dot frontier"></span> Frontier</span>
            <span className="step-legend-item"><span className="step-dot undiscovered"></span> Undiscovered</span>
          </div>
        </section>
      )}

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
        {/* Execution times */}
        {rows.some((r) => r.timeMs !== null && r.timeMs > 0) && (
          <div className="algo-times">
            {rows.map((row) => (
              row.timeMs !== null && row.timeMs > 0 ? (
                <div className="algo-time-row" key={row.key}>
                  <span className="algo-time-label" style={{ color: BAR_COLORS[row.key] }}>{row.label}</span>
                  <span className="algo-time-val">{row.timeMs.toFixed(3)} ms</span>
                </div>
              ) : null
            ))}
          </div>
        )}
        <div className="complexity-note">
          Values show actual edge relaxation count. Selective update: <b>O(k·ΔE)</b> — only recomputes affected nodes.
        </div>
      </section>

      {/* ── Complexity Analysis Panel ── */}
      {theoryCost && (
        <section className="panel-section theory-panel">
          <h3>Complexity Analysis</h3>
          <div className="theory-grid">
            <div className="theory-card">
              <div className="theory-algo">Dijkstra</div>
              <div className="theory-formula">O((V+E) log V)</div>
              <div className="theory-calc">≈ {theoryCost.dijkstra.toLocaleString()} ops</div>
              <div className="theory-note">V={stats.nodes}, E={stats.edges}</div>
            </div>
            <div className="theory-card">
              <div className="theory-algo">Bellman-Ford</div>
              <div className="theory-formula">O(V · E)</div>
              <div className="theory-calc">≈ {theoryCost.bellman.toLocaleString()} ops</div>
              <div className="theory-note">
                {theoryCost.bellman > theoryCost.dijkstra
                  ? `${Math.round(theoryCost.bellman / theoryCost.dijkstra)}× slower`
                  : "Similar"}
              </div>
            </div>
            <div className="theory-card">
              <div className="theory-algo">A* Search</div>
              <div className="theory-formula">O(E log V)</div>
              <div className="theory-calc">Heuristic guided</div>
              <div className="theory-note">h(n) = haversine dist</div>
            </div>
            <div className="theory-card">
              <div className="theory-algo">Selective SPT</div>
              <div className="theory-formula">O(k log k)</div>
              <div className="theory-calc">k = affected nodes</div>
              <div className="theory-note">Dynamic update</div>
            </div>
          </div>
          <div className="theory-footer">
            <div className="theory-row">
              <span>Prim's MST</span>
              <span className="theory-mono">O(E log V)</span>
            </div>
            <div className="theory-row">
              <span>Kruskal's MST</span>
              <span className="theory-mono">O(E log E)</span>
            </div>
            <div className="theory-row">
              <span>Union-Find ops</span>
              <span className="theory-mono">O(α(n)) amortized</span>
            </div>
          </div>
        </section>
      )}

      {/* ── Path Cost Breakdown ── */}
      {pathBreakdown && (
        <section className="panel-section path-breakdown-panel">
          <h3>Path Cost Breakdown</h3>
          <div className="pb-summary">
            <div className="pb-stat">
              <span className="pb-stat-label">Total Weight</span>
              <span className="pb-stat-value">{pathBreakdown.totalWeight}</span>
            </div>
            <div className="pb-stat">
              <span className="pb-stat-label">Total σ</span>
              <span className="pb-stat-value">{pathBreakdown.totalSigma}</span>
            </div>
            <div className="pb-stat">
              <span className="pb-stat-label">Risk-Adj (k={Number(risk).toFixed(1)})</span>
              <span className="pb-stat-value accent">{pathBreakdown.totalRiskAdjusted}</span>
            </div>
            <div className="pb-stat">
              <span className="pb-stat-label">Hops</span>
              <span className="pb-stat-value">{pathBreakdown.hops}</span>
            </div>
          </div>
          <div className="pb-edges">
            {pathBreakdown.edges.map((e, i) => (
              <div className="pb-edge-row" key={i}>
                <span className="pb-edge-label">{e.from} → {e.to}</span>
                <span className="pb-edge-detail">w={e.weight.toFixed(1)} σ={e.sigma.toFixed(2)} cost={e.riskCost.toFixed(1)}</span>
              </div>
            ))}
          </div>
          <div className="pb-formula">
            Cost = Σ(w<sub>i</sub> + k · σ<sub>i</sub>) where k = {Number(risk).toFixed(1)}
          </div>
        </section>
      )}

      {/* ── A* Search Result ── */}
      {astarResult && (
        <section className="panel-section astar-panel">
          <h3>A* vs Dijkstra</h3>
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
          <h3>Minimum Spanning Tree</h3>
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
          <div className="concept-callout">
            <div className="concept-title">SPT ≠ MST</div>
            <div className="concept-body">
              <strong>SPT</strong> (purple) minimizes distance from a single source node to all others.
              <strong>MST</strong> (green) minimizes total edge weight to connect the entire network.
              These produce different trees — an edge in the MST may not be on any shortest path.
            </div>
          </div>
        </section>
      )}

      {/* ── Algorithm Duel Result ── */}
      {duelData && (
        <section className="panel-section duel-panel">
          <h3>Algorithm Duel</h3>
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

      {/* ── Node Evaluation Visualizer ── */}
      {duelData && nodes && nodes.length > 0 && nodes.length <= 50 && (
        <section className="panel-section node-eval-panel">
          <h3>Evaluated vs Skipped Nodes</h3>
          <div className="node-eval-stats">
            <div>Evaluated: <span>{duelData.selectiveCount}</span></div>
            <div>Skipped: <span>{duelData.fullCount - duelData.selectiveCount}</span></div>
          </div>
          <div className="node-grid">
            {nodes.map(node => {
              const isEvaluated = duelData.selectiveNodes && duelData.selectiveNodes.includes(node.id);
              const label = node.label && node.label.length <= 4 
                 ? node.label 
                 : (node.id < 26 ? String.fromCharCode(65 + node.id) : node.id);
                 
              return (
                <div 
                  key={node.id} 
                  className={`node-pill ${isEvaluated ? "evaluated" : "skipped"}`}
                  title={node.label || `Node ${node.id}`}
                >
                  {label}
                </div>
              );
            })}
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

      {/* ── Graph Statistics Dashboard ── */}
      {graphStats && (
        <section className="panel-section graph-stats-panel">
          <h3>Graph Statistics</h3>
          <div className="gs-grid">
            <div className="gs-item">
              <span className="gs-label">Density</span>
              <span className="gs-value">{graphStats.density}%</span>
            </div>
            <div className="gs-item">
              <span className="gs-label">Avg Degree</span>
              <span className="gs-value">{graphStats.avgDegree}</span>
            </div>
            {graphStats.maxDist && (
              <div className="gs-item">
                <span className="gs-label">Farthest Node</span>
                <span className="gs-value">{graphStats.maxDist}</span>
                <span className="gs-sub">{graphStats.farthestLabel}</span>
              </div>
            )}
          </div>
          <div className="gs-formula">
            Density = 2E / V(V−1) · 100 | Avg Degree = 2E / V
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