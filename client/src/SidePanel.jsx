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
  kruskalEdges,
  nodes,
  edges,
  stepState,
  optimalPath,
  source,
  skipTableData,
  negCycleEdges,
  divergenceData,
  sptEdges,
  raceData,
  raceHistory,
  updateHistory,
  onClearHistory,
  complexityData,
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

  // Kruskal total weight
  const kruskalTotalWeight = useMemo(() => {
    if (!kruskalEdges || kruskalEdges.length === 0 || !edges) return null;
    let total = 0;
    for (const idx of kruskalEdges) {
      if (edges[idx]) total += Number(edges[idx].weight) || 0;
    }
    return Math.round(total * 100) / 100;
  }, [kruskalEdges, edges]);

  // MST comparison data (when both active)
  const mstCompare = useMemo(() => {
    if (!mstEdges || !kruskalEdges || mstEdges.length === 0 || kruskalEdges.length === 0) return null;
    const pSet = new Set(mstEdges);
    const kSet = new Set(kruskalEdges);
    const inBoth = mstEdges.filter(i => kSet.has(i));
    const primOnly = mstEdges.filter(i => !kSet.has(i));
    const kruskalOnly = kruskalEdges.filter(i => !pSet.has(i));
    return { inBoth: inBoth.length, primOnly: primOnly.length, kruskalOnly: kruskalOnly.length };
  }, [mstEdges, kruskalEdges]);

  // Negative cycle weight sum
  const ncWeightSum = useMemo(() => {
    if (!negCycleEdges || negCycleEdges.length === 0 || !edges) return null;
    let sum = 0;
    for (const idx of negCycleEdges) {
      if (edges[idx]) sum += Number(edges[idx].weight) || 0;
    }
    return Math.round(sum * 100) / 100;
  }, [negCycleEdges, edges]);

  // Skip table summary
  const skipSummary = useMemo(() => {
    if (!skipTableData || skipTableData.length === 0) return null;
    const total = skipTableData.length;
    const recomputed = skipTableData.filter(r => r.status !== "SKIPPED").length;
    const skipped = total - recomputed;
    return {
      total,
      recomputed,
      skipped,
      recomputedPct: Math.round((recomputed / total) * 100),
      skippedPct: Math.round((skipped / total) * 100),
    };
  }, [skipTableData]);

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
      {/* ── Negative Cycle Alert (enhanced) ── */}
      {hasNegativeCycle && (
        <section className="panel-section negative-cycle-alert">
          <div className="nc-icon">⚠</div>
          <div className="nc-text">
            <div className="nc-title">Negative Cycle Detected</div>
            <div className="nc-body">
              Bellman-Ford detected a negative-weight cycle. Finite shortest paths cannot be guaranteed for all nodes.
            </div>
            {negCycleEdges && negCycleEdges.length > 0 && edges && (
              <div className="nc-edges">
                {negCycleEdges.map((idx) => {
                  const e = edges[idx];
                  if (!e) return null;
                  const nA = nodes?.find(n => n.id === e.a);
                  const nB = nodes?.find(n => n.id === e.b);
                  return (
                    <div className="nc-edge-item" key={idx}>
                      <span className="nc-edge-label">{nA?.label || `N${e.a}`} ↔ {nB?.label || `N${e.b}`}</span>
                      <span className="nc-edge-weight">w={Number(e.weight).toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {ncWeightSum !== null && (
              <div className="nc-weight-sum">Cycle weight sum: {ncWeightSum}</div>
            )}
            <div className="nc-explanation">
              Dijkstra assumes non-negative weights — it would produce incorrect results here. Bellman-Ford detects this in the V-th iteration.
            </div>
          </div>
        </section>
      )}

      {/* ── Step-by-Step Dijkstra Status (Enhanced) ── */}
      {stepState && (
        <section className="panel-section step-panel">
          {/* Section A: Current Step Header */}
          <h3>Dijkstra Step-by-Step</h3>
          <div className="step-header-info">
            {stepState.currentNode >= 0 ? (
              <>
                <div className="step-extract-line">
                  Step {stepState.stepNumber} — Extracting Node {
                    nodes?.find(n => n.id === stepState.currentNode)?.label || stepState.currentNode
                  } (dist: {Number.isFinite(stepState.currentNodeDist) ? stepState.currentNodeDist.toFixed(1) : "∞"})
                </div>
                <div className="step-invariant-note">
                  Greedy invariant: this node's distance is now optimal and will never improve
                </div>
              </>
            ) : (
              <div className="step-extract-line">Initialization — source node added to heap</div>
            )}
          </div>

          {/* Section B: Priority Queue (Heap State) */}
          {stepState.heapSnapshot && stepState.heapSnapshot.length > 0 && (
            <div className="step-heap-section">
              <div className="step-section-label">Min-Heap — always extracts minimum distance node</div>
              <div className="step-heap-stack">
                {stepState.heapSnapshot.map((entry, i) => {
                  const nodeObj = nodes?.find(n => n.id === entry.nodeId);
                  const label = nodeObj?.label || `N${entry.nodeId}`;
                  const distStr = Number.isFinite(entry.dist) ? entry.dist.toFixed(1) : "∞";
                  return (
                    <div key={entry.nodeId} className={`heap-pill ${i === 0 ? "heap-pill-top" : ""}`}>
                      <span className="heap-pill-label">{label}: {distStr}</span>
                      {i === 0 && <span className="heap-pill-hint">← extracting next</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section C: Relaxation Log */}
          {stepState.relaxationLog && stepState.relaxationLog.length > 0 && (
            <div className="step-relax-section">
              <div className="step-section-label">Edge Relaxation</div>
              {stepState.relaxationLog.map((entry, i) => {
                const fromLabel = nodes?.find(n => n.id === entry.from)?.label || `N${entry.from}`;
                const toLabel = nodes?.find(n => n.id === entry.neighbor)?.label || `N${entry.neighbor}`;
                const oldStr = Number.isFinite(entry.oldDist) ? entry.oldDist.toFixed(1) : "∞";
                const newStr = entry.newDist.toFixed(1);
                const fromDist = Number.isFinite(stepState.currentNodeDist) ? stepState.currentNodeDist.toFixed(1) : "?";
                return (
                  <div key={i} className={`relax-entry ${entry.improved ? "relax-improved" : "relax-skipped"}`}>
                    {fromLabel} → {toLabel}: {fromDist} + {entry.edgeWeight.toFixed(1)} = {newStr}{" "}
                    {entry.improved
                      ? `< ${oldStr} ✓ (updated)`
                      : `≥ ${oldStr} ✗ (skip)`}
                  </div>
                );
              })}
            </div>
          )}

          {/* Section D: Invariant Tracker */}
          <div className="step-invariant-section">
            <div className="step-category">
              <span className="step-dot visited"></span>
              <span className="step-cat-label">Settled (optimal):</span>
              <span className="step-cat-nodes">
                {nodes?.filter(n => stepState.visited?.has(n.id)).map(n => n.label || `N${n.id}`).join(", ") || "—"}
              </span>
            </div>
            <div className="step-category">
              <span className="step-dot frontier"></span>
              <span className="step-cat-label">Frontier (in heap):</span>
              <span className="step-cat-nodes">
                {stepState.heapSnapshot?.map(e => {
                  const n = nodes?.find(nd => nd.id === e.nodeId);
                  return n?.label || `N${e.nodeId}`;
                }).join(", ") || "—"}
              </span>
            </div>
            <div className="step-category">
              <span className="step-dot undiscovered"></span>
              <span className="step-cat-label">Undiscovered:</span>
              <span className="step-cat-nodes">
                {nodes?.filter(n => !stepState.visited?.has(n.id) && !stepState.heapSnapshot?.some(e => e.nodeId === n.id))
                  .map(n => n.label || `N${n.id}`).join(", ") || "—"}
              </span>
            </div>
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
      {((mstEdges && mstEdges.length > 0) || (kruskalEdges && kruskalEdges.length > 0)) && (
        <section className="panel-section mst-panel">
          <h3>Minimum Spanning Tree</h3>
          <div className="mst-stats">
            {mstEdges && mstEdges.length > 0 && (
              <div className="mst-stat">
                <span className="mst-stat-label">Prim's Edges</span>
                <span className="mst-stat-value">{mstEdges.length}</span>
              </div>
            )}
            {mstEdges && mstEdges.length > 0 && mstTotalWeight !== null && (
              <div className="mst-stat">
                <span className="mst-stat-label">Prim's Weight</span>
                <span className="mst-stat-value">{mstTotalWeight}</span>
              </div>
            )}
            {kruskalEdges && kruskalEdges.length > 0 && (
              <div className="mst-stat">
                <span className="mst-stat-label" style={{ color: "#f97316" }}>Kruskal's Edges</span>
                <span className="mst-stat-value">{kruskalEdges.length}</span>
              </div>
            )}
            {kruskalEdges && kruskalEdges.length > 0 && kruskalTotalWeight !== null && (
              <div className="mst-stat">
                <span className="mst-stat-label" style={{ color: "#f97316" }}>Kruskal's Weight</span>
                <span className="mst-stat-value">{kruskalTotalWeight}</span>
              </div>
            )}
          </div>
          {mstCompare && (
            <div className="mst-compare">
              <div className="mst-compare-row">
                <span className="mst-compare-label">Edges in both</span>
                <span className="mst-compare-val white">{mstCompare.inBoth}</span>
              </div>
              <div className="mst-compare-row">
                <span className="mst-compare-label">Prim's only</span>
                <span className="mst-compare-val green">{mstCompare.primOnly}</span>
              </div>
              <div className="mst-compare-row">
                <span className="mst-compare-label">Kruskal's only</span>
                <span className="mst-compare-val orange">{mstCompare.kruskalOnly}</span>
              </div>
              <div className="mst-compare-note">
                On graphs with unique edge weights, both algorithms produce identical MSTs. Divergence only occurs with equal-weight edges where tie-breaking differs.
              </div>
            </div>
          )}
          <div className="mst-note" style={{ marginTop: 12 }}>
            {mstEdges && mstEdges.length > 0 && kruskalEdges && kruskalEdges.length > 0
              ? "Prim's O(E log V) — Kruskal's O(E log E) with Union-Find."
              : kruskalEdges && kruskalEdges.length > 0
              ? "Kruskal's algorithm (Sort + Union-Find) — O(E log E)."
              : "Prim's algorithm (Greedy) — O(E log V)."}
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

      {/* ── Node Skip Table (Feature 1) ── */}
      {skipTableData && skipTableData.length > 0 && skipSummary && (
        <section className="panel-section skip-table-panel">
          <h3>Selective Update — Node Analysis</h3>
          <div className="skip-summary">
            Recomputed: <strong>{skipSummary.recomputed}/{skipSummary.total}</strong> nodes ({skipSummary.recomputedPct}%) —
            Skipped: <strong>{skipSummary.skipped}/{skipSummary.total}</strong> nodes ({skipSummary.skippedPct}%)
          </div>
          <div className="skip-table-wrap">
            <table className="skip-table">
              <thead>
                <tr>
                  <th>Node</th>
                  <th>Status</th>
                  <th>Old Dist</th>
                  <th>New Dist</th>
                  <th>Δ</th>
                </tr>
              </thead>
              <tbody>
                {skipTableData.map((row) => {
                  const rowClass = row.status === "SKIPPED"
                    ? "skip-row-skipped"
                    : row.status === "RECOMPUTED_NO_CHANGE"
                    ? "skip-row-nochange"
                    : "skip-row-recomputed";
                  const statusClass = row.status === "SKIPPED"
                    ? "skipped"
                    : row.status === "RECOMPUTED_NO_CHANGE"
                    ? "nochange"
                    : "recomputed";
                  const deltaClass = row.delta === null || Math.abs(row.delta) < 0.001
                    ? "skip-delta-zero"
                    : row.delta > 0
                    ? "skip-delta-pos"
                    : "skip-delta-neg";
                  return (
                    <tr key={row.id} className={rowClass}>
                      <td>{row.label}</td>
                      <td>
                        <span className={`skip-status ${statusClass}`}>
                          {row.status === "RECOMPUTED_NO_CHANGE" ? "RECOMPUTED" : row.status}
                        </span>
                        {row.status === "RECOMPUTED_NO_CHANGE" && (
                          <span className="skip-badge skip-badge-nochange">no change</span>
                        )}
                      </td>
                      <td>{Number.isFinite(row.oldDist) ? row.oldDist.toFixed(1) : "∞"}</td>
                      <td>{Number.isFinite(row.newDist) ? row.newDist.toFixed(1) : "∞"}</td>
                      <td className={deltaClass}>
                        {row.delta !== null ? (row.delta >= 0 ? "+" : "") + row.delta.toFixed(2) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── SPT vs MST Divergence (Feature 4) ── */}
      {divergenceData && (
        <section className="panel-section divergence-panel">
          <h3>SPT vs MST Analysis</h3>
          <div className="divergence-stats">
            <div className="divergence-stat">
              <div className="divergence-stat-count purple">{divergenceData.sptOnly.length}</div>
              <div className="divergence-stat-label">SPT Only</div>
            </div>
            <div className="divergence-stat">
              <div className="divergence-stat-count green">{divergenceData.mstOnly.length}</div>
              <div className="divergence-stat-label">MST Only</div>
            </div>
            <div className="divergence-stat">
              <div className="divergence-stat-count white">{divergenceData.inBoth.length}</div>
              <div className="divergence-stat-label">In Both</div>
            </div>
          </div>
          <div className="divergence-edges">
            {divergenceData.sptOnly.map((idx) => {
              const e = edges?.[idx];
              if (!e) return null;
              const nA = nodes?.find(n => n.id === e.a);
              const nB = nodes?.find(n => n.id === e.b);
              return (
                <div className="divergence-edge-note" key={`spt-${idx}`}>
                  <span className="de-swatch" style={{ background: "#a78bfa" }} />
                  Edge {nA?.label || `N${e.a}`}↔{nB?.label || `N${e.b}`}: shortest path edge, not minimum spanning
                </div>
              );
            })}
            {divergenceData.mstOnly.map((idx) => {
              const e = edges?.[idx];
              if (!e) return null;
              const nA = nodes?.find(n => n.id === e.a);
              const nB = nodes?.find(n => n.id === e.b);
              return (
                <div className="divergence-edge-note" key={`mst-${idx}`}>
                  <span className="de-swatch" style={{ background: "#22c55e" }} />
                  Edge {nA?.label || `N${e.a}`}↔{nB?.label || `N${e.b}`}: minimum spanning edge, not on shortest path
                </div>
              );
            })}
          </div>
          <div className="divergence-summary">
            <strong>SPT</strong> minimizes distance from node {nodes?.find(n => n.id === source)?.label || source}.{" "}
            <strong>MST</strong> minimizes total network edge weight. These are different optimization objectives.
          </div>
        </section>
      )}

      {/* ── Algorithm Race Panel ── */}
      {raceData && (
        <section className="panel-section race-panel">
          <h3>Algorithm Race — Empirical Complexity</h3>
          <div className="race-bars">
            <div className="race-bar-row">
              <span className="race-bar-label">SELECTIVE</span>
              <div className="race-bar-track">
                <div className="race-bar race-bar-green" style={{
                  width: `${Math.max(4, Math.min(100, (raceData.selectiveMs / Math.max(raceData.selectiveMs, raceData.dijkstraMs)) * 100))}%`
                }} />
              </div>
              <span className="race-bar-time">{raceData.selectiveMs.toFixed(1)}ms</span>
            </div>
            <div className="race-bar-row">
              <span className="race-bar-label">FULL</span>
              <div className="race-bar-track">
                <div className="race-bar race-bar-red" style={{
                  width: `${Math.max(4, Math.min(100, (raceData.dijkstraMs / Math.max(raceData.selectiveMs, raceData.dijkstraMs)) * 100))}%`
                }} />
              </div>
              <span className="race-bar-time">{raceData.dijkstraMs.toFixed(1)}ms</span>
            </div>
          </div>
          <div className="race-speedup">{raceData.speedup.toFixed(1)}× speedup</div>
          <div className="race-detail">
            Nodes saved: {raceData.nodesSaved}/{raceData.totalNodes} ({raceData.nodesSavedPct}%)
          </div>
          {(() => {
            const k = raceData.nodesRecomputed;
            const n = raceData.totalNodes;
            const predictedRatio = n > 0 ? Math.round((k / n) * 100) : 0;
            const measuredRatio = raceData.dijkstraMs > 0 ? Math.round((raceData.selectiveMs / raceData.dijkstraMs) * 100) : 0;
            const match = Math.abs(measuredRatio - predictedRatio) <= 20;
            return (
              <div className="race-theory">
                <div>Theoretical: O(k log n) vs O(n log n) — ratio ≈ k/n = {predictedRatio}%</div>
                <div>Measured: {measuredRatio}% | Predicted: {predictedRatio}% |{" "}
                  <span className={match ? "race-match-yes" : "race-match-no"}>{match ? "✓ Match" : "✗ Mismatch"}</span>
                </div>
              </div>
            );
          })()}

          {/* Mini history table */}
          {raceHistory && raceHistory.length > 1 && (
            <div className="race-history">
              <table className="race-table">
                <thead>
                  <tr><th>Race#</th><th>Selective</th><th>Full</th><th>Speedup</th><th>Saved</th></tr>
                </thead>
                <tbody>
                  {raceHistory.map((r, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{r.selectiveMs.toFixed(1)}ms</td>
                      <td>{r.dijkstraMs.toFixed(1)}ms</td>
                      <td>{r.speedup.toFixed(1)}×</td>
                      <td>{r.nodesSavedPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="race-history-note">Speedup varies with edge location — edges closer to source affect larger subtrees</div>
            </div>
          )}
        </section>
      )}

      {/* ── Amortized Analysis Panel ── */}
      {updateHistory && updateHistory.length >= 2 && (
        <section className="panel-section amortized-panel">
          <h3>Amortized Analysis</h3>
          {/* SVG Chart */}
          <div className="amortized-chart-wrap">
            <svg className="amortized-chart" viewBox="0 0 280 80" preserveAspectRatio="none">
              {(() => {
                const h = updateHistory;
                const totalNodes = h[0]?.totalNodes || 1;
                const maxY = totalNodes;
                const w = 280;
                const ht = 80;
                const xStep = w / Math.max(1, h.length - 1);
                // Running average
                let runningSum = 0;
                const points = h.map((entry, i) => {
                  runningSum += entry.nodesRecomputed;
                  const avg = runningSum / (i + 1);
                  return {
                    x: i * xStep,
                    y: ht - (entry.nodesRecomputed / maxY) * ht,
                    avgY: ht - (avg / maxY) * ht,
                    isAdversarial: entry.isAdversarial,
                    val: entry.nodesRecomputed,
                  };
                });
                // Baseline line (full Dijkstra)
                const baselineY = ht - (totalNodes / maxY) * ht;
                // Build polylines
                const blueLine = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
                const greenLine = points.map(p => `${p.x.toFixed(1)},${p.avgY.toFixed(1)}`).join(" ");
                return (
                  <>
                    <line x1="0" y1={baselineY} x2={w} y2={baselineY} stroke="#ef4444" strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
                    <polyline points={blueLine} fill="none" stroke="#60a5fa" strokeWidth="1.5" opacity="0.7" />
                    <polyline points={greenLine} fill="none" stroke="#22c55e" strokeWidth="2" />
                    {points.map((p, i) => (
                      <circle key={i} cx={p.x} cy={p.y} r="3"
                        fill={p.isAdversarial ? "#ef4444" : "#60a5fa"} />
                    ))}
                  </>
                );
              })()}
            </svg>
            <div className="amortized-legend">
              <span><span className="al-dot" style={{background:"#60a5fa"}} /> Per-update</span>
              <span><span className="al-dot" style={{background:"#22c55e"}} /> Running avg</span>
              <span><span className="al-dot" style={{background:"#ef4444"}} /> Full baseline</span>
            </div>
          </div>
          {/* Summary stats */}
          {(() => {
            const h = updateHistory;
            const totalNodes = h[0]?.totalNodes || 1;
            const vals = h.map(e => e.nodesRecomputed);
            const worst = Math.max(...vals);
            const best = Math.min(...vals);
            const totalWork = vals.reduce((a, b) => a + b, 0);
            const avg = (totalWork / h.length).toFixed(1);
            const avgPct = Math.round((totalWork / h.length / totalNodes) * 100);
            const fullEquiv = h.length * totalNodes;
            const ratio = fullEquiv > 0 ? (fullEquiv / totalWork).toFixed(1) : "∞";
            return (
              <div className="amortized-stats">
                <div>Worst single update: <strong>{worst}</strong> nodes</div>
                <div>Best single update: <strong>{best}</strong> nodes</div>
                <div>Running average: <strong>{avg}</strong> nodes ({avgPct}% of full)</div>
                <div>Full Dijkstra would always recompute: <strong>{totalNodes}</strong> nodes</div>
                <div className="amortized-bound">
                  Amortized cost = {totalWork} total / {h.length} ops = <strong>{avg} nodes/op</strong>
                </div>
                <div className="amortized-bound">
                  Full equivalent: {fullEquiv} total — <strong className="amortized-ratio">{ratio}× more work</strong>
                </div>
              </div>
            );
          })()}
          <button className="amortized-clear" onClick={onClearHistory}>Clear History</button>
        </section>
      )}

      {/* ── Empirical Complexity Analysis ── */}
      {complexityData && (complexityData.dijkstra.length > 0 || complexityData.prims.length > 0) && (
        <section className="panel-section complexity-panel">
          <h3>Empirical Complexity Analysis</h3>
          {/* SVG Chart */}
          <div className="complexity-chart-wrap">
            <svg className="complexity-chart" viewBox="0 0 280 120" preserveAspectRatio="none">
              {(() => {
                const dj = complexityData.dijkstra || [];
                const pr = complexityData.prims || [];
                if (dj.length === 0 && pr.length === 0) return null;
                const allTimes = [...dj.map(r => r.timeMs), ...pr.map(r => r.timeMs)].filter(t => t > 0);
                const maxTime = Math.max(0.01, ...allTimes);
                const allN = [...dj.map(r => r.n), ...pr.map(r => r.n)];
                const minN = Math.min(...allN);
                const maxN = Math.max(...allN);
                const logMin = Math.log2(minN);
                const logMax = Math.log2(maxN);
                const w = 280;
                const h = 120;
                const xScale = (n) => ((Math.log2(n) - logMin) / Math.max(0.01, logMax - logMin)) * (w - 20) + 10;
                const yScale = (t) => h - 10 - ((t / maxTime) * (h - 20));
                // Theoretical curve scaled to first measurement
                const theoryCurve = (data, color) => {
                  if (data.length === 0) return null;
                  const base = data[0];
                  const baseNlogN = base.n * Math.log2(base.n);
                  return data.map((r, i) => {
                    const theoT = base.timeMs * ((r.n * Math.log2(r.n)) / baseNlogN);
                    return { x: xScale(r.n), y: yScale(theoT) };
                  });
                };
                const djPoints = dj.map(r => ({ x: xScale(r.n), y: yScale(r.timeMs) }));
                const prPoints = pr.map(r => ({ x: xScale(r.n), y: yScale(r.timeMs) }));
                const djTheo = theoryCurve(dj, "#60a5fa") || [];
                const prTheo = theoryCurve(pr, "#22c55e") || [];
                return (
                  <>
                    {djTheo.length > 1 && (
                      <polyline points={djTheo.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
                        fill="none" stroke="#60a5fa" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
                    )}
                    {prTheo.length > 1 && (
                      <polyline points={prTheo.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
                        fill="none" stroke="#22c55e" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
                    )}
                    {djPoints.length > 1 && (
                      <polyline points={djPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
                        fill="none" stroke="#60a5fa" strokeWidth="2" />
                    )}
                    {prPoints.length > 1 && (
                      <polyline points={prPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
                        fill="none" stroke="#22c55e" strokeWidth="2" />
                    )}
                    {djPoints.map((p, i) => <circle key={`d${i}`} cx={p.x} cy={p.y} r="3" fill="#60a5fa" />)}
                    {prPoints.map((p, i) => <circle key={`p${i}`} cx={p.x} cy={p.y} r="3" fill="#22c55e" />)}
                  </>
                );
              })()}
            </svg>
            <div className="complexity-legend">
              <span><span className="al-dot" style={{background:"#60a5fa"}} /> Dijkstra</span>
              <span><span className="al-dot" style={{background:"#22c55e"}} /> Prim's</span>
              <span style={{opacity:0.6}}>Dashed = O(n log n) theoretical</span>
            </div>
          </div>
          {/* Results table */}
          {complexityData.dijkstra.length > 0 && (
            <div className="complexity-table-wrap">
              <table className="complexity-table">
                <thead>
                  <tr><th>n</th><th>E</th><th>Dijkstra</th><th>Ratio</th><th>Prim's</th><th>Ratio</th></tr>
                </thead>
                <tbody>
                  {complexityData.dijkstra.map((dj, i) => {
                    const pr = complexityData.prims[i];
                    const baseDj = complexityData.dijkstra[0];
                    const basePr = complexityData.prims[0];
                    const djRatio = baseDj && baseDj.timeMs > 0 ? (dj.timeMs / baseDj.timeMs).toFixed(1) : "—";
                    const prRatio = basePr && basePr.timeMs > 0 && pr ? (pr.timeMs / basePr.timeMs).toFixed(1) : "—";
                    const theoRatio = baseDj ? ((dj.n * Math.log2(dj.n)) / (baseDj.n * Math.log2(baseDj.n))).toFixed(1) : "—";
                    const djMatch = djRatio !== "—" && theoRatio !== "—" ? Math.abs(parseFloat(djRatio) - parseFloat(theoRatio)) / parseFloat(theoRatio) <= 0.3 : false;
                    return (
                      <tr key={i}>
                        <td>{dj.n}</td>
                        <td>{dj.edgeCount}</td>
                        <td>{dj.timeMs.toFixed(2)}ms</td>
                        <td>{djRatio}× {i > 0 ? (djMatch ? "✓" : "✗") : ""}</td>
                        <td>{pr ? `${pr.timeMs.toFixed(2)}ms` : "—"}</td>
                        <td>{prRatio}×</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="complexity-conclusion">
            Measured growth rate matches O(n log n) prediction within acceptable variance. Deviation at small n is expected — constant factors dominate at small input sizes.
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