/**
 * A* Search on a graph with geographic node coordinates.
 *
 * DAA concept: Informed / Heuristic search.
 *   f(n) = g(n) + h(n)
 *   where h(n) = haversine straight-line distance to target in km
 *
 * Compared with Dijkstra (uninformed greedy), A* typically expands fewer nodes
 * because the heuristic guides search toward the target.
 */

// ── Haversine distance (km) ─────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this._data[left].priority < this._data[smallest].priority) smallest = left;
      if (right < n && this._data[right].priority < this._data[smallest].priority) smallest = right;
      if (smallest === i) break;
      [this._data[i], this._data[smallest]] = [this._data[smallest], this._data[i]];
      i = smallest;
    }
  }
}

// ── Build adjacency list from edges ─────────────────────────────────────────
function buildAdj(nodeCount, edges) {
  const adj = Array.from({ length: nodeCount }, () => []);
  edges.forEach((edge, idx) => {
    const w = Number(edge.weight) || 1;
    adj[edge.a].push({ to: edge.b, weight: w, idx });
    adj[edge.b].push({ to: edge.a, weight: w, idx });
  });
  return adj;
}

// ── A* Search ───────────────────────────────────────────────────────────────
/**
 * @param {Array} nodes      — [{id, label, ...}, ...]
 * @param {Array} edges      — [{a, b, weight, sigma, ...}, ...]
 * @param {Object} nodeCoords — { nodeId: {lat, lng} }
 * @param {number} source
 * @param {number} target
 * @returns {{ path: number[], dist: number, nodesExpanded: number, expandedSet: number[] }}
 */
export function runAstar(nodes, edges, nodeCoords, source, target) {
  const n = nodes.length;
  const adj = buildAdj(n, edges);

  const targetCoord = nodeCoords[target];
  if (!targetCoord) {
    return { path: [], dist: Infinity, nodesExpanded: 0, expandedSet: [] };
  }

  // Heuristic: straight-line distance to target
  const h = (nodeId) => {
    const c = nodeCoords[nodeId];
    if (!c) return 0;
    return haversineKm(c.lat, c.lng, targetCoord.lat, targetCoord.lng);
  };

  const gScore = new Float64Array(n).fill(Infinity);
  const fScore = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);

  gScore[source] = 0;
  fScore[source] = h(source);

  const heap = new MinHeap();
  heap.push(fScore[source], source);

  let nodesExpanded = 0;
  const expandedSet = [];

  while (heap.size > 0) {
    const { value: u } = heap.pop();

    if (closed[u]) continue;
    closed[u] = 1;
    nodesExpanded++;
    expandedSet.push(u);

    if (u === target) break;

    for (const { to: v, weight } of adj[u]) {
      if (closed[v]) continue;
      const tentative = gScore[u] + weight;
      if (tentative < gScore[v]) {
        gScore[v] = tentative;
        fScore[v] = tentative + h(v);
        prev[v] = u;
        heap.push(fScore[v], v);
      }
    }
  }

  // Reconstruct path
  const path = [];
  if (gScore[target] < Infinity) {
    let cur = target;
    while (cur !== -1) {
      path.push(cur);
      cur = prev[cur];
    }
    path.reverse();
  }

  return {
    path,
    dist: gScore[target],
    nodesExpanded,
    expandedSet,
  };
}

// ── Dijkstra (for comparison count) ─────────────────────────────────────────
/**
 * Standard Dijkstra run in JS — used purely to count nodes expanded
 * for the A* vs Dijkstra comparison card.
 */
export function runDijkstraJS(nodes, edges, source, target) {
  const n = nodes.length;
  const adj = buildAdj(n, edges);

  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);

  dist[source] = 0;
  const heap = new MinHeap();
  heap.push(0, source);

  let nodesExpanded = 0;
  const expandedSet = [];

  while (heap.size > 0) {
    const { value: u } = heap.pop();

    if (closed[u]) continue;
    closed[u] = 1;
    nodesExpanded++;
    expandedSet.push(u);

    if (u === target) break;

    for (const { to: v, weight } of adj[u]) {
      if (closed[v]) continue;
      const d = dist[u] + weight;
      if (d < dist[v]) {
        dist[v] = d;
        prev[v] = u;
        heap.push(d, v);
      }
    }
  }

  const path = [];
  if (dist[target] < Infinity) {
    let cur = target;
    while (cur !== -1) {
      path.push(cur);
      cur = prev[cur];
    }
    path.reverse();
  }

  return { path, dist: dist[target], nodesExpanded, expandedSet };
}
