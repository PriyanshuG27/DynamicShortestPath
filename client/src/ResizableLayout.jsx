import { useCallback, useEffect, useRef, useState } from "react";

const SIDE_MIN = 160;
const SIDE_MAX = 520;
const SIDE_DEFAULT = 260;
const CTRL_MIN = 80;
const CTRL_MAX = 400;
const CTRL_DEFAULT = 175;

const LS_KEY_SIDE = "dsp_side_width";
const LS_KEY_CTRL = "dsp_ctrl_height";

function loadSize(key, fallback) {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function saveSize(key, value) {
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    /* quota exceeded — ignore */
  }
}

export default function ResizableLayout({ header, canvas, sidebar, controls }) {
  const [sideWidth, setSideWidth] = useState(() => loadSize(LS_KEY_SIDE, SIDE_DEFAULT));
  const [ctrlHeight, setCtrlHeight] = useState(() => loadSize(LS_KEY_CTRL, CTRL_DEFAULT));

  const draggingRef = useRef(null); // 'side' | 'ctrl' | null
  const startPosRef = useRef(0);
  const startSizeRef = useRef(0);

  // Persist sizes on change
  useEffect(() => { saveSize(LS_KEY_SIDE, sideWidth); }, [sideWidth]);
  useEffect(() => { saveSize(LS_KEY_CTRL, ctrlHeight); }, [ctrlHeight]);

  const onPointerDown = useCallback((axis, e) => {
    e.preventDefault();
    draggingRef.current = axis;
    startPosRef.current = axis === "side" ? e.clientX : e.clientY;
    startSizeRef.current = axis === "side" ? sideWidth : ctrlHeight;
    document.body.style.userSelect = "none";
    document.body.style.cursor = axis === "side" ? "col-resize" : "row-resize";
  }, [sideWidth, ctrlHeight]);

  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current) return;
      if (draggingRef.current === "side") {
        // dragging right edge of canvas = left edge of sidebar
        const delta = startPosRef.current - e.clientX; // moving left = bigger sidebar
        const next = Math.max(SIDE_MIN, Math.min(SIDE_MAX, startSizeRef.current + delta));
        setSideWidth(next);
      } else {
        const delta = startPosRef.current - e.clientY; // moving up = taller controls
        const next = Math.max(CTRL_MIN, Math.min(CTRL_MAX, startSizeRef.current + delta));
        setCtrlHeight(next);
      }
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const shellStyle = {
    "--side-width": `${Math.round(sideWidth)}px`,
    "--controls-h": `${Math.round(ctrlHeight)}px`,
  };

  return (
    <div className="app-shell" style={shellStyle}>
      {header}

      <main className="main-grid">
        <section className="canvas-panel">{canvas}</section>

        {/* horizontal resize handle */}
        <div
          className="resize-handle-v"
          onPointerDown={(e) => onPointerDown("side", e)}
        />

        {sidebar}
      </main>

      {/* vertical resize handle */}
      <div
        className="resize-handle-h"
        onPointerDown={(e) => onPointerDown("ctrl", e)}
      />

      {controls}
    </div>
  );
}
