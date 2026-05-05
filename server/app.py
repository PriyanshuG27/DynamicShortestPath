import os
import json
import threading
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO

try:
    from .bridge import BridgeProcessError, CppBridge
except ImportError:
    from bridge import BridgeProcessError, CppBridge


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BINARY = str(PROJECT_ROOT / "main.exe")
CPP_BINARY_PATH = os.environ.get("CPP_BINARY_PATH", DEFAULT_BINARY)
CUSTOM_GRAPH_PATH = PROJECT_ROOT / "data" / "custom_graph.json"

app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False

CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

_bridge: Optional[CppBridge] = None
_bridge_lock = threading.Lock()


@app.before_request
def _handle_preflight():
    if request.method == "OPTIONS":
        return "", 204
    return None


@app.after_request
def _add_cors_headers(response):
    origin = request.headers.get("Origin")
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    else:
        response.headers.setdefault("Access-Control-Allow-Origin", "*")

    response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type, Authorization")
    response.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
    return response


def _build_error_response(message: str, status: int = 400, restarted: bool = False):
    payload = {
        "type": "error",
        "message": message,
    }
    if restarted:
        payload["restarted"] = True
    socketio.emit("cpp_event", payload)
    return jsonify(payload), status


def _get_bridge() -> CppBridge:
    global _bridge
    with _bridge_lock:
        if _bridge is None:
            _bridge = CppBridge(binary_path=CPP_BINARY_PATH, cwd=str(PROJECT_ROOT))
        return _bridge


def _restart_bridge() -> None:
    bridge = _get_bridge()
    bridge.restart()


def _send_and_emit(command: Dict[str, Any], extra: Dict[str, Any] | None = None) -> Tuple[Any, int]:
    try:
        bridge = _get_bridge()
        events = bridge.send(command)
    except (BridgeProcessError, TimeoutError, BrokenPipeError, OSError) as exc:
        restarted = False
        restart_error = ""
        try:
            _restart_bridge()
            restarted = True
        except Exception as restart_exc:  # noqa: BLE001
            restart_error = f"; restart_failed: {restart_exc}"

        return _build_error_response(
            f"cpp_process_error: {exc}{restart_error}",
            status=503,
            restarted=restarted,
        )

    for event in events:
        socketio.emit("cpp_event", event)

    payload: Dict[str, Any] = {"events": events}
    if isinstance(extra, dict):
        payload.update(extra)

    return jsonify(payload), 200


def _get_json_body() -> Dict[str, Any] | None:
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return None
    return payload


@app.post("/api/run")
def api_run():
    payload = _get_json_body()
    if payload is None:
        return _build_error_response("invalid_request: expected JSON object")

    if payload.get("cmd") == "init":
        command = {
            "cmd": "init",
            "nodes": payload.get("nodes"),
            "edges": payload.get("edges", []),
        }
        return _send_and_emit(command)

    if payload.get("cmd") in {"run_dijkstra", "run_standard", "run_bellman"}:
        command = dict(payload)
        return _send_and_emit(command)

    algorithm = payload.get("algorithm", "probabilistic")
    source = payload.get("source", 0)

    if algorithm in {"probabilistic", "dijkstra", "run_dijkstra"}:
        command = {
            "cmd": "run_dijkstra",
            "source": source,
            "k": payload.get("k", 1.0),
        }
        return _send_and_emit(command)

    if algorithm in {"standard", "run_standard"}:
        command = {
            "cmd": "run_standard",
            "source": source,
        }
        return _send_and_emit(command)

    if algorithm in {"bellman", "bellman-ford", "run_bellman"}:
        command = {
            "cmd": "run_bellman",
            "source": source,
        }
        return _send_and_emit(command)

    return _build_error_response("invalid_run: unsupported algorithm")


@app.post("/api/update")
def api_update():
    payload = _get_json_body()
    if payload is None:
        return _build_error_response("invalid_request: expected JSON object")

    command = {
        "cmd": "update",
        "edgeIdx": payload.get("edgeIdx"),
        "weight": payload.get("weight"),
        "sigma": payload.get("sigma"),
        "mode": payload.get("mode", "selective"),
    }
    if "k" in payload:
        command["k"] = payload["k"]

    return _send_and_emit(command)


@app.post("/api/adversarial")
def api_adversarial():
    payload = _get_json_body() or {}

    command: Dict[str, Any] = {"cmd": "adversarial"}
    if "k" in payload:
        command["k"] = payload["k"]

    return _send_and_emit(command)


@app.post("/api/random")
def api_random():
    command = {"cmd": "random_update"}
    return _send_and_emit(command)


@app.post("/api/batch")
def api_batch():
    payload = _get_json_body()
    if payload is None:
        return _build_error_response("invalid_request: expected JSON object")

    command: Dict[str, Any] = {
        "cmd": "batch",
        "updates": payload.get("updates", []),
    }
    if "k" in payload:
        command["k"] = payload["k"]

    return _send_and_emit(command)


@app.post("/api/reset")
def api_reset():
    command = {"cmd": "reset"}
    return _send_and_emit(command)


@app.post("/api/load_osm")
def api_load_osm():
    landmarks_path = PROJECT_ROOT / "data" / "noida_landmarks.json"

    try:
        raw = landmarks_path.read_text(encoding="utf-8")
        data = json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        return _build_error_response(f"landmarks_load_failed: {exc}", status=500)

    nodes_list = data.get("nodes", [])
    edges_list = data.get("edges", [])
    n = len(nodes_list)

    # Build edge tuples for C++ (a, b, weight, sigma)
    edge_tuples = []
    edge_types = []
    for edge in edges_list:
        a, b, w, s = edge[0], edge[1], edge[2], edge[3]
        road_type = edge[4] if len(edge) > 4 else "secondary"
        edge_tuples.append([int(a), int(b), float(w), float(s)])
        edge_types.append(road_type)

    command = {
        "cmd": "init",
        "nodes": n,
        "edges": edge_tuples,
    }

    result = _send_and_emit(
        command,
        extra={
            "graph": {
                "nodes": n,
                "edges": edge_tuples,
            }
        },
    )

    # Emit rich graph metadata for the frontend
    node_coords = [[nd["id"], nd["lat"], nd["lng"]] for nd in nodes_list]
    node_labels = {nd["id"]: nd.get("label", f"N{nd['id']}") for nd in nodes_list}
    node_types = {nd["id"]: nd.get("type", "residential") for nd in nodes_list}

    socketio.emit("cpp_event", {
        "type": "graph_meta",
        "nodeCoords": node_coords,
        "nodeLabels": node_labels,
        "nodeTypes": node_types,
        "edgeTypes": edge_types,
        "nodeCount": n,
        "edgeCount": len(edge_tuples),
        "place": "Noida, Uttar Pradesh, India",
    })

    return result


@app.post("/api/save_graph")
def api_save_graph():
    payload = _get_json_body()
    if payload is None:
        return _build_error_response("invalid_request: expected JSON object")

    nodes = payload.get("nodes")
    edges = payload.get("edges")

    if not isinstance(nodes, int) or isinstance(nodes, bool) or nodes < 1:
        return _build_error_response("invalid_request: nodes must be a positive integer")

    if not isinstance(edges, list) or len(edges) == 0:
        return _build_error_response("invalid_request: edges must be a non-empty list")

    normalized_edges = []
    for index, edge in enumerate(edges):
        if not isinstance(edge, list) or len(edge) < 4:
            return _build_error_response(
                f"invalid_request: edge[{index}] must be [a,b,weight,sigma]"
            )

        a, b, weight, sigma = edge[:4]
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in (a, b, weight, sigma)):
            return _build_error_response(
                f"invalid_request: edge[{index}] values must be numeric"
            )

        a_i = int(a)
        b_i = int(b)
        if a_i < 0 or b_i < 0 or a_i >= nodes or b_i >= nodes:
            return _build_error_response(
                f"invalid_request: edge[{index}] nodes must be in [0, {nodes - 1}]"
            )

        normalized_edges.append([a_i, b_i, float(weight), float(sigma)])

    graph_payload = {
        "cmd": "init",
        "nodes": nodes,
        "edges": normalized_edges,
    }

    CUSTOM_GRAPH_PATH.parent.mkdir(parents=True, exist_ok=True)
    CUSTOM_GRAPH_PATH.write_text(
        json.dumps(graph_payload, ensure_ascii=True),
        encoding="utf-8",
    )

    socketio.emit(
        "cpp_event",
        {
            "type": "graph_saved",
            "path": str(CUSTOM_GRAPH_PATH),
            "nodes": nodes,
            "edges": len(normalized_edges),
        },
    )

    return jsonify(
        {
            "type": "graph_saved",
            "path": str(CUSTOM_GRAPH_PATH),
            "graph": graph_payload,
        }
    ), 200


@app.get("/api/health")
def api_health():
    return jsonify({
        "type": "health",
        "ok": True,
        "binary": CPP_BINARY_PATH,
    })


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, allow_unsafe_werkzeug=True)
