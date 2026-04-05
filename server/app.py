import os
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

app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False

CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000"]}})
socketio = SocketIO(app, cors_allowed_origins=["http://localhost:3000"])

_bridge: Optional[CppBridge] = None
_bridge_lock = threading.Lock()


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


def _send_and_emit(command: Dict[str, Any]) -> Tuple[Any, int]:
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

    return jsonify({"events": events}), 200


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
    payload = _get_json_body() or {}

    max_nodes = payload.get("max_nodes", 50)
    rebuild = bool(payload.get("rebuild", False))

    if not isinstance(max_nodes, int) or max_nodes <= 0:
        return _build_error_response("invalid_request: max_nodes must be a positive integer")

    try:
        try:
            from .osm_loader import DEFAULT_OUTPUT_PATH, load_noida_graph, load_or_create_noida_graph
        except ImportError:
            from osm_loader import DEFAULT_OUTPUT_PATH, load_noida_graph, load_or_create_noida_graph
    except ImportError as exc:
        return _build_error_response(
            f"osm_dependency_missing: {exc}",
            status=500,
        )

    try:
        graph_payload = load_or_create_noida_graph(rebuild=rebuild, max_nodes=max_nodes)
    except Exception as exc:  # noqa: BLE001
        try:
            graph_payload = load_noida_graph(DEFAULT_OUTPUT_PATH)
            warn_event = {
                "type": "warn",
                "message": f"osm_load_failed_live_fetch_using_cache: {exc}",
                "cachedFile": str(DEFAULT_OUTPUT_PATH),
            }
            socketio.emit("cpp_event", warn_event)
        except Exception:  # noqa: BLE001
            return _build_error_response(
                f"osm_load_failed: {exc}",
                status=500,
            )

    command = {
        "cmd": "init",
        "nodes": graph_payload.get("nodes", 0),
        "edges": graph_payload.get("edges", []),
    }

    return _send_and_emit(command)


@app.get("/api/health")
def api_health():
    return jsonify({
        "type": "health",
        "ok": True,
        "binary": CPP_BINARY_PATH,
    })


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000)
