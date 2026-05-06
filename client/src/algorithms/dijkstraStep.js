/**
 * Step-by-step Dijkstra generator for visualization.
 *
 * DAA concept: Greedy single-source shortest path.
 *   At each step we pop the minimum-distance node from the priority queue,
 *   mark it visited, and relax all its outgoing edges.
 *
 * This generator yields the full algorithm state after each node expansion,
 * allowing the React UI to pause / resume / step through the algorithm.
 */

// ── Simple binary min-heap ──────────────────────────────────────────────────
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
  // Return a copy of current heap contents for visualization
  contents() {
    return this._data.map((d) => d.value);
  }
}

// ── Sentinel value indicating the generator is done ─────────────────────────
export const STEP_DONE = Symbol("STEP_DONE");

/**
 * Generator function for step-by-step Dijkstra.
 *
 * @param {number} nodeCount  — number of nodes
 * @param {Array}  edges      — [{a, b, weight, sigma, ...}, ...]
 * @param {number} source     — source node ID
 * @yields {{ stepNumber, currentNode, dist, prev, visited, frontier }}
 */
export function* dijkstraStepGenerator(nodeCount, edges, source) {
  // Build adjacency list
  const adj = Array.from({ length: nodeCount }, () => []);
  edges.forEach((edge, idx) => {
    const w = Number(edge.weight) || 1;
    adj[edge.a].push({ to: edge.b, weight: w, idx });
    adj[edge.b].push({ to: edge.a, weight: w, idx });
  });

  const dist = new Array(nodeCount).fill(Infinity);
  const prev = new Array(nodeCount).fill(-1);
  const visited = new Set();
  const heap = new MinHeap();

  dist[source] = 0;
  heap.push(0, source);

  let stepNumber = 0;

  // Yield initial state (before any expansion)
  yield {
    stepNumber,
    currentNode: -1,
    currentNodeDist: 0,
    dist: [...dist],
    prev: [...prev],
    visited: new Set(visited),
    frontier: heap.contents(),
    relaxationLog: [],
    heapSnapshot: [{ nodeId: source, dist: 0 }],
    nodeCount,
  };

  while (heap.size > 0) {
    const { value: u } = heap.pop();

    if (visited.has(u)) continue;
    visited.add(u);
    stepNumber++;

    // Relax neighbors — capture relaxation details
    const relaxationLog = [];
    for (const { to: v, weight } of adj[u]) {
      if (visited.has(v)) continue;
      const oldDist = dist[v];
      const newDist = dist[u] + weight;
      const improved = newDist < oldDist;
      relaxationLog.push({
        from: u,
        neighbor: v,
        edgeWeight: weight,
        oldDist,
        newDist,
        improved,
      });
      if (improved) {
        dist[v] = newDist;
        prev[v] = u;
        heap.push(newDist, v);
      }
    }

    // Build heap snapshot — sorted copy of current heap contents
    const heapSnapshot = heap._data
      .map((entry) => ({ nodeId: entry.value, dist: entry.priority }))
      .filter((entry) => !visited.has(entry.nodeId))
      .sort((a, b) => a.dist - b.dist);

    // De-duplicate (heap may have stale entries for the same node)
    const seenInSnapshot = new Set();
    const uniqueSnapshot = [];
    for (const entry of heapSnapshot) {
      if (!seenInSnapshot.has(entry.nodeId)) {
        seenInSnapshot.add(entry.nodeId);
        uniqueSnapshot.push(entry);
      }
    }

    // Yield state after this expansion
    yield {
      stepNumber,
      currentNode: u,
      currentNodeDist: dist[u],
      dist: [...dist],
      prev: [...prev],
      visited: new Set(visited),
      frontier: heap.contents(),
      relaxationLog,
      heapSnapshot: uniqueSnapshot,
      nodeCount,
    };
  }

  return STEP_DONE;
}
