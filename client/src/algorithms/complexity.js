/**
 * Empirical Complexity Analysis — client-side measurements.
 *
 * DAA concept: Verify that measured runtime scales according to
 * theoretical Big-O predictions for graph algorithms.
 *
 * Generates random connected graphs of increasing size, times
 * Dijkstra and Prim's, and returns results for chart rendering.
 */

import { runDijkstraJS } from "./astar";
import { runPrims } from "./mst";

/**
 * Generate a random connected graph with n nodes and roughly 2n edges.
 *
 * Strategy:
 *   1. Create a spanning path 0→1→2→...→n-1 (guarantees connectivity)
 *   2. Add n random extra edges with random weights
 *
 * @param {number} n — number of nodes
 * @returns {{ nodes: Array, edges: Array }}
 */
export function generateRandomGraph(n) {
  const nodes = [];
  for (let i = 0; i < n; i++) {
    nodes.push({ id: i, label: `N${i}`, dist: i === 0 ? 0 : Infinity });
  }

  const edges = [];
  const edgeSet = new Set();

  const edgeKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

  // Spanning path: guarantees connectivity
  for (let i = 0; i < n - 1; i++) {
    const w = 1.0 + Math.random() * 9.0;
    const s = 0.1 + Math.random() * 0.9;
    edges.push({ a: i, b: i + 1, weight: Number(w.toFixed(2)), sigma: Number(s.toFixed(2)), inSPT: false });
    edgeSet.add(edgeKey(i, i + 1));
  }

  // Random extra edges (up to n more)
  let attempts = 0;
  let added = 0;
  while (added < n && attempts < n * 4) {
    attempts++;
    const a = Math.floor(Math.random() * n);
    const b = Math.floor(Math.random() * n);
    if (a === b) continue;
    const key = edgeKey(a, b);
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    const w = 1.0 + Math.random() * 9.0;
    const s = 0.1 + Math.random() * 0.9;
    edges.push({ a, b, weight: Number(w.toFixed(2)), sigma: Number(s.toFixed(2)), inSPT: false });
    added++;
  }

  return { nodes, edges };
}

/**
 * Measure Dijkstra runtime on a random graph of size n.
 * @param {number} n
 * @returns {{ n: number, edgeCount: number, timeMs: number, nodesExpanded: number }}
 */
export function measureDijkstra(n) {
  const { nodes, edges } = generateRandomGraph(n);
  const target = n - 1;

  const start = performance.now();
  const result = runDijkstraJS(nodes, edges, 0, target);
  const end = performance.now();

  return {
    n,
    edgeCount: edges.length,
    timeMs: Number((end - start).toFixed(4)),
    nodesExpanded: result.nodesExpanded,
  };
}

/**
 * Measure Prim's MST runtime on a random graph of size n.
 * @param {number} n
 * @returns {{ n: number, edgeCount: number, timeMs: number }}
 */
export function measurePrims(n) {
  const { nodes, edges } = generateRandomGraph(n);

  const start = performance.now();
  runPrims(nodes.length, edges);
  const end = performance.now();

  return {
    n,
    edgeCount: edges.length,
    timeMs: Number((end - start).toFixed(4)),
  };
}

/**
 * Run complexity experiment across multiple sizes.
 * Returns array of measurement results.
 *
 * @param {number[]} sizes — e.g. [8, 16, 32, 64, 128, 256]
 * @param {function} measureFn — measureDijkstra or measurePrims
 * @returns {Array} results
 */
export function runComplexityExperiment(sizes, measureFn) {
  return sizes.map((n) => measureFn(n));
}
