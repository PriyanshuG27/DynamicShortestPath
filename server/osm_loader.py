import json
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

import networkx as nx
import numpy as np
import osmnx as ox
from sklearn.cluster import KMeans


PLACE_NAME = "Noida, Uttar Pradesh, India"
DEFAULT_MAX_NODES = 50
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / "data" / "noida_graph.json"

ROAD_TYPE_UNCERTAINTY = {
    "motorway": 0.1,
    "primary": 0.3,
    "secondary": 0.5,
    "residential": 0.8,
}


def _normalize_highway(highway_value) -> List[str]:
    if isinstance(highway_value, list):
        return [str(v).lower() for v in highway_value]
    if highway_value is None:
        return []
    return [str(highway_value).lower()]


def _road_uncertainty(highway_value) -> float:
    tags = _normalize_highway(highway_value)
    if not tags:
        return 0.6

    for preferred in ("motorway", "primary", "secondary", "residential"):
        for tag in tags:
            if preferred in tag:
                return ROAD_TYPE_UNCERTAINTY[preferred]

    return 0.6


def _largest_connected_component(graph: nx.MultiDiGraph) -> nx.MultiDiGraph:
    if graph.number_of_nodes() == 0:
        return graph

    undirected = nx.Graph()
    undirected.add_nodes_from(graph.nodes())
    undirected.add_edges_from((u, v) for u, v, _ in graph.edges(keys=True))

    largest_nodes = max(nx.connected_components(undirected), key=len)
    return graph.subgraph(largest_nodes).copy()


def _cluster_nodes(
    graph: nx.MultiDiGraph,
    max_nodes: int,
) -> Tuple[Dict[int, int], np.ndarray]:
    original_ids: List[int] = list(graph.nodes())

    coords = np.array(
        [
            [
                float(graph.nodes[node_id].get("x", 0.0)),
                float(graph.nodes[node_id].get("y", 0.0)),
            ]
            for node_id in original_ids
        ],
        dtype=float,
    )

    n_clusters = min(max_nodes, len(original_ids))
    if n_clusters <= 0:
        return {}, np.zeros((0, 2), dtype=float)

    if n_clusters == len(original_ids):
        labels = np.arange(len(original_ids), dtype=int)
        centers = coords.copy()
    else:
        model = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = model.fit_predict(coords)
        centers = model.cluster_centers_

    mapping = {original_ids[i]: int(labels[i]) for i in range(len(original_ids))}
    return mapping, centers


def _edge_tuple_iter(graph: nx.MultiDiGraph) -> Iterable[Tuple[int, int, dict]]:
    for u, v, _key, data in graph.edges(keys=True, data=True):
        yield u, v, data


def build_noida_graph(max_nodes: int = DEFAULT_MAX_NODES) -> Dict[str, object]:
    raw_graph = ox.graph_from_place(PLACE_NAME, network_type="drive", simplify=True)
    graph = _largest_connected_component(raw_graph)

    mapping, centers = _cluster_nodes(graph, max_nodes=max_nodes)

    edge_agg: Dict[Tuple[int, int], Dict[str, float]] = {}
    for u, v, data in _edge_tuple_iter(graph):
        cluster_u = mapping.get(u)
        cluster_v = mapping.get(v)

        if cluster_u is None or cluster_v is None or cluster_u == cluster_v:
            continue

        a, b = (cluster_u, cluster_v) if cluster_u < cluster_v else (cluster_v, cluster_u)

        length_m = float(data.get("length", 0.0))
        if length_m <= 0:
            continue

        weight = length_m / 100.0
        base_uncertainty = _road_uncertainty(data.get("highway"))
        sigma = 0.3 + 0.7 * base_uncertainty

        key = (a, b)
        current = edge_agg.get(key)
        if current is None:
            edge_agg[key] = {
                "weight_sum": weight,
                "sigma_sum": sigma,
                "count": 1.0,
            }
        else:
            current["weight_sum"] += weight
            current["sigma_sum"] += sigma
            current["count"] += 1.0

    edges_out: List[List[float]] = []
    for (a, b), agg in sorted(edge_agg.items()):
        count = max(1.0, agg["count"])
        avg_weight = round(agg["weight_sum"] / count, 3)
        avg_sigma = round(agg["sigma_sum"] / count, 3)
        edges_out.append([int(a), int(b), avg_weight, avg_sigma])

    payload: Dict[str, object] = {
        "cmd": "init",
        "nodes": int(centers.shape[0]),
        "edges": edges_out,
    }
    return payload


def save_noida_graph(
    output_path: Path = DEFAULT_OUTPUT_PATH,
    max_nodes: int = DEFAULT_MAX_NODES,
) -> Dict[str, object]:
    payload = build_noida_graph(max_nodes=max_nodes)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=True), encoding="utf-8")
    return payload


def load_noida_graph(output_path: Path = DEFAULT_OUTPUT_PATH) -> Dict[str, object]:
    raw = output_path.read_text(encoding="utf-8")
    parsed = json.loads(raw)

    if not isinstance(parsed, dict):
        raise ValueError("noida_graph.json must contain a JSON object")

    if parsed.get("cmd") != "init":
        parsed["cmd"] = "init"

    return parsed


def load_or_create_noida_graph(
    output_path: Path = DEFAULT_OUTPUT_PATH,
    rebuild: bool = False,
    max_nodes: int = DEFAULT_MAX_NODES,
) -> Dict[str, object]:
    if rebuild or not output_path.exists():
        return save_noida_graph(output_path=output_path, max_nodes=max_nodes)
    return load_noida_graph(output_path=output_path)


if __name__ == "__main__":
    payload = save_noida_graph()
    print(
        json.dumps(
            {
                "type": "osm_loaded",
                "place": PLACE_NAME,
                "nodes": payload.get("nodes", 0),
                "edges": len(payload.get("edges", [])),
                "output": str(DEFAULT_OUTPUT_PATH),
            },
            ensure_ascii=True,
        )
    )
