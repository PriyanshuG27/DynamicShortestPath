/**
 * Minimum Spanning Tree algorithms.
 *
 * DAA concepts:
 *   Prim's  — Greedy, pick lightest edge crossing the cut (uses priority queue)
 *   Kruskal's — Greedy, sort edges globally + Union-Find
 *
 * Both produce the same MST (for unique edge weights).
 * Good comparison with Shortest Path Tree (SPT): SPT minimises distance from
 * a single source, MST minimises total edge weight to connect all nodes.
 */

// ── Simple min-heap ─────────────────────────────────────────────────────────
class MinHeap {
  constructor() {
    this._data = [];
  }
  get size() {
    return this._data.length;
  }
  push(priority, value) {
    this._data.push({ priority, value });
    this._bubbleUp(this._data.length - 1);
  }
  pop() {
    if (this._data.length === 0) return null;
    const top = this._data[0];
    const last = this._data.pop();
    if (this._data.length > 0 && last) {
      this._data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }
  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._data[i].priority >= this._data[parent].priority) break;
      [this._data[i], this._data[parent]] = [this._data[parent], this._data[i]];
      i = parent;
    }
  }
  _sinkDown(i) {
    const n = this._data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this._data[l].priority < this._data[smallest].priority) smallest = l;
      if (r < n && this._data[r].priority < this._data[smallest].priority) smallest = r;
      if (smallest === i) break;
      [this._data[i], this._data[smallest]] = [this._data[smallest], this._data[i]];
      i = smallest;
    }
  }
}

// ── Union-Find (Disjoint Set Union) ─────────────────────────────────────────
class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Uint32Array(n);
  }

  find(x) {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]); // path compression
    }
    return this.parent[x];
  }

  union(x, y) {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx === ry) return false;
    // union by rank
    if (this.rank[rx] < this.rank[ry]) {
      this.parent[rx] = ry;
    } else if (this.rank[rx] > this.rank[ry]) {
      this.parent[ry] = rx;
    } else {
      this.parent[ry] = rx;
      this.rank[rx]++;
    }
    return true;
  }
}

// ── Prim's Algorithm ────────────────────────────────────────────────────────
/**
 * @param {number} nodeCount
 * @param {Array} edges  — [{a, b, weight, ...}, ...]
 * @returns {{ mstEdgeIndices: number[], totalWeight: number }}
 */
export function runPrims(nodeCount, edges) {
  if (nodeCount <= 0 || edges.length === 0) {
    return { mstEdgeIndices: [], totalWeight: 0 };
  }

  // Build adjacency list with edge indices
  const adj = Array.from({ length: nodeCount }, () => []);
  edges.forEach((edge, idx) => {
    const w = Number(edge.weight) || 1;
    adj[edge.a].push({ to: edge.b, weight: w, idx });
    adj[edge.b].push({ to: edge.a, weight: w, idx });
  });

  const inMST = new Uint8Array(nodeCount);
  const mstEdgeIndices = [];
  let totalWeight = 0;

  const heap = new MinHeap();
  // Start from node 0
  inMST[0] = 1;
  for (const { to, weight, idx } of adj[0]) {
    heap.push(weight, { to, idx });
  }

  while (heap.size > 0 && mstEdgeIndices.length < nodeCount - 1) {
    const { value: { to, idx } } = heap.pop();
    if (inMST[to]) continue;

    inMST[to] = 1;
    mstEdgeIndices.push(idx);
    totalWeight += edges[idx].weight;

    for (const neighbor of adj[to]) {
      if (!inMST[neighbor.to]) {
        heap.push(neighbor.weight, { to: neighbor.to, idx: neighbor.idx });
      }
    }
  }

  return { mstEdgeIndices, totalWeight: Math.round(totalWeight * 100) / 100 };
}

// ── Kruskal's Algorithm ─────────────────────────────────────────────────────
/**
 * @param {number} nodeCount
 * @param {Array} edges  — [{a, b, weight, ...}, ...]
 * @returns {{ mstEdgeIndices: number[], totalWeight: number }}
 */
export function runKruskal(nodeCount, edges) {
  if (nodeCount <= 0 || edges.length === 0) {
    return { mstEdgeIndices: [], totalWeight: 0 };
  }

  // Sort edges by weight
  const sorted = edges
    .map((e, idx) => ({ idx, weight: Number(e.weight) || 1 }))
    .sort((a, b) => a.weight - b.weight);

  const uf = new UnionFind(nodeCount);
  const mstEdgeIndices = [];
  let totalWeight = 0;

  for (const { idx, weight } of sorted) {
    const edge = edges[idx];
    if (uf.union(edge.a, edge.b)) {
      mstEdgeIndices.push(idx);
      totalWeight += weight;
      if (mstEdgeIndices.length === nodeCount - 1) break;
    }
  }

  return { mstEdgeIndices, totalWeight: Math.round(totalWeight * 100) / 100 };
}
