import json
import queue
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional


class BridgeProcessError(RuntimeError):
    """Raised when the C++ subprocess is unavailable or exits unexpectedly."""


class CppBridge:
    def __init__(self, binary_path: str, cwd: Optional[str] = None) -> None:
        self.binary_path = str(binary_path)
        self.cwd = cwd

        self._process: Optional[subprocess.Popen[str]] = None
        self._event_queue: "queue.Queue[Dict[str, Any]]" = queue.Queue()
        self._send_lock = threading.Lock()
        self._stderr_lock = threading.Lock()

        self._reader_thread: Optional[threading.Thread] = None
        self._stderr_thread: Optional[threading.Thread] = None
        self._stop_threads = threading.Event()
        self._last_stderr: List[str] = []

        self._start_process()

    def _start_process(self) -> None:
        binary = Path(self.binary_path)
        if not binary.exists():
            raise FileNotFoundError(f"C++ binary not found: {binary}")

        self._stop_threads.clear()

        self._process = subprocess.Popen(
            [str(binary)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=self.cwd,
            text=True,
            bufsize=1,
        )

        self._reader_thread = threading.Thread(target=self._stdout_reader_loop, daemon=True)
        self._reader_thread.start()

        self._stderr_thread = threading.Thread(target=self._stderr_reader_loop, daemon=True)
        self._stderr_thread.start()

    def _stdout_reader_loop(self) -> None:
        proc = self._process
        if proc is None or proc.stdout is None:
            return

        try:
            while not self._stop_threads.is_set():
                line = proc.stdout.readline()
                if line == "":
                    break

                line = line.strip()
                if not line:
                    continue

                try:
                    parsed = json.loads(line)
                    if isinstance(parsed, dict):
                        event = parsed
                    else:
                        event = {"type": "bridge_raw", "payload": parsed}
                except json.JSONDecodeError:
                    event = {
                        "type": "bridge_parse_error",
                        "raw": line,
                    }

                self._event_queue.put(event)
        finally:
            self._event_queue.put({"type": "bridge_eof"})

    def _stderr_reader_loop(self) -> None:
        proc = self._process
        if proc is None or proc.stderr is None:
            return

        while not self._stop_threads.is_set():
            line = proc.stderr.readline()
            if line == "":
                break

            message = line.strip()
            if not message:
                continue

            with self._stderr_lock:
                self._last_stderr.append(message)
                if len(self._last_stderr) > 30:
                    self._last_stderr.pop(0)

    def _is_running(self) -> bool:
        return self._process is not None and self._process.poll() is None

    def _ensure_running(self) -> None:
        if not self._is_running():
            raise BridgeProcessError("C++ process is not running")

    @staticmethod
    def _is_done_event(event: Dict[str, Any]) -> bool:
        event_type = event.get("type")
        if not isinstance(event_type, str):
            return False

        terminal_events = {
            "bye",
            "error",
            "edge_update",
            "adversarial_update",
            "adversarial",
            "random_update",
        }
        return event_type.endswith("_done") or event_type in terminal_events

    def send(self, command_dict: Dict[str, Any], timeout: float = 10.0) -> List[Dict[str, Any]]:
        payload = json.dumps(command_dict, separators=(",", ":"))

        with self._send_lock:
            self._ensure_running()
            proc = self._process
            if proc is None or proc.stdin is None:
                raise BridgeProcessError("C++ process stdin is unavailable")

            try:
                proc.stdin.write(payload + "\n")
                proc.stdin.flush()
            except (BrokenPipeError, OSError) as exc:
                raise BridgeProcessError(f"failed to write command to C++ process: {exc}") from exc

            events: List[Dict[str, Any]] = []
            deadline = time.time() + timeout

            while True:
                remaining = deadline - time.time()
                if remaining <= 0:
                    raise TimeoutError("timed out waiting for response from C++ process")

                try:
                    event = self._event_queue.get(timeout=remaining)
                except queue.Empty as exc:
                    raise TimeoutError("timed out waiting for response from C++ process") from exc

                if event.get("type") == "bridge_eof":
                    stderr_tail = self.get_last_stderr()
                    detail = f" (stderr: {stderr_tail})" if stderr_tail else ""
                    raise BridgeProcessError(f"C++ process terminated unexpectedly{detail}")

                events.append(event)

                if self._is_done_event(event):
                    break

            # Drain trailing events that were emitted immediately after done.
            grace_deadline = time.time() + 0.05
            while True:
                remaining = grace_deadline - time.time()
                if remaining <= 0:
                    break

                try:
                    event = self._event_queue.get(timeout=remaining)
                except queue.Empty:
                    break

                if event.get("type") == "bridge_eof":
                    break

                events.append(event)

            return events

    def get_last_stderr(self) -> str:
        with self._stderr_lock:
            if not self._last_stderr:
                return ""
            return " | ".join(self._last_stderr[-5:])

    def restart(self) -> None:
        with self._send_lock:
            self._close_unlocked()
            # Reset queue so stale events do not leak into next request.
            self._event_queue = queue.Queue()
            self._last_stderr = []
            self._start_process()

    def close(self) -> None:
        with self._send_lock:
            self._close_unlocked()

    def _close_unlocked(self) -> None:
        self._stop_threads.set()

        proc = self._process
        self._process = None

        if proc is None:
            return

        try:
            if proc.stdin is not None:
                try:
                    proc.stdin.write('{"cmd":"quit"}\n')
                    proc.stdin.flush()
                except Exception:
                    pass
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=2)
