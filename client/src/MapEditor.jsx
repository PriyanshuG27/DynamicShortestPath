import React, { useMemo, useState } from "react";

const CANVAS_W = 640;
const CANVAS_H = 360;
const NODE_R = 12;

function distance(a, b, x, y) {
  return Math.hypot(a - x, b - y);
}

function edgeKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export default function MapEditor({ open, onClose, onApply }) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [defaultWeight, setDefaultWeight] = useState(2.5);
  const [defaultSigma, setDefaultSigma] = useState(0.6);

  const edgeSet = useMemo(() => {
    const set = new Set();
    edges.forEach((edge) => {
      set.add(edgeKey(edge.a, edge.b));
    });
    return set;
  }, [edges]);

  if (!open) {
    return null;
  }

  const resetEditor = () => {
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
  };

  const handleCanvasClick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const clickedNode = nodes.find((node) => distance(node.x, node.y, x, y) <= NODE_R + 4);

    if (clickedNode) {
      if (selectedNodeId == null) {
        setSelectedNodeId(clickedNode.id);
        return;
      }

      if (selectedNodeId === clickedNode.id) {
        setSelectedNodeId(null);
        return;
      }

      const a = Math.min(selectedNodeId, clickedNode.id);
      const b = Math.max(selectedNodeId, clickedNode.id);
      const key = edgeKey(a, b);

      if (!edgeSet.has(key)) {
        setEdges((prev) => [
          ...prev,
          {
            a,
            b,
            weight: Number(defaultWeight) || 1,
            sigma: Number(defaultSigma) || 0.1,
          },
        ]);
      }
      setSelectedNodeId(null);
      return;
    }

    const id = nodes.length;
    setNodes((prev) => [...prev, { id, x, y }]);
  };

  const updateEdgeField = (index, field, value) => {
    setEdges((prev) =>
      prev.map((edge, idx) =>
        idx === index
          ? {
              ...edge,
              [field]: Number(value),
            }
          : edge
      )
    );
  };

  const deleteEdge = (index) => {
    setEdges((prev) => prev.filter((_, idx) => idx !== index));
  };

  const applyGraph = (persist) => {
    if (nodes.length < 2 || edges.length < 1 || typeof onApply !== "function") {
      return;
    }

    const tuples = edges.map((edge) => [
      Number(edge.a),
      Number(edge.b),
      Number(edge.weight || 1),
      Number(edge.sigma || 0.1),
    ]);

    onApply({
      nodes: nodes.length,
      edges: tuples,
      persist,
    });
  };

  return (
    <div className="overlay-modal" role="dialog" aria-modal="true" aria-label="Map editor">
      <div className="overlay-card overlay-card-wide">
        <h2>Map Editor</h2>
        <p>
          Click empty space to add nodes. Click one node, then another node to create an edge.
          Click the selected node again to cancel selection.
        </p>

        <div className="editor-controls">
          <label htmlFor="editor-weight">Default weight</label>
          <input
            id="editor-weight"
            type="number"
            step="0.1"
            min="0.1"
            value={defaultWeight}
            onChange={(event) => setDefaultWeight(event.target.value)}
          />

          <label htmlFor="editor-sigma">Default sigma</label>
          <input
            id="editor-sigma"
            type="number"
            step="0.1"
            min="0"
            value={defaultSigma}
            onChange={(event) => setDefaultSigma(event.target.value)}
          />

          <button className="ctl-btn" onClick={resetEditor}>
            Clear
          </button>
        </div>

        <svg
          className="map-editor-canvas"
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          onClick={handleCanvasClick}
        >
          {edges.map((edge, idx) => {
            const a = nodes[edge.a];
            const b = nodes[edge.b];
            if (!a || !b) {
              return null;
            }
            return (
              <g key={`${edge.a}-${edge.b}-${idx}`}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#38bdf8" strokeWidth="2" />
                <text
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 6}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="10"
                >
                  {Number(edge.weight).toFixed(1)}
                </text>
              </g>
            );
          })}

          {nodes.map((node) => (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r={NODE_R}
                fill={selectedNodeId === node.id ? "#f59e0b" : "#7c6ef7"}
                stroke="#e2e8f0"
                strokeWidth="1.5"
              />
              <text
                x={node.x}
                y={node.y + 4}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="10"
                fontWeight="700"
              >
                {node.id < 26 ? String.fromCharCode(65 + node.id) : `N${node.id}`}
              </text>
            </g>
          ))}
        </svg>

        <div className="editor-edge-list">
          <div className="editor-list-title">Edges</div>
          {edges.length === 0 ? (
            <div className="editor-empty">No edges yet. Connect two nodes to create one.</div>
          ) : (
            edges.map((edge, idx) => (
              <div className="editor-edge-row" key={`${edge.a}-${edge.b}-${idx}`}>
                <div>
                  {edge.a < 26 ? String.fromCharCode(65 + edge.a) : `N${edge.a}`} -
                  {edge.b < 26 ? String.fromCharCode(65 + edge.b) : `N${edge.b}`}
                </div>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={edge.weight}
                  onChange={(event) => updateEdgeField(idx, "weight", event.target.value)}
                />
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={edge.sigma}
                  onChange={(event) => updateEdgeField(idx, "sigma", event.target.value)}
                />
                <button className="ctl-btn" onClick={() => deleteEdge(idx)}>
                  Remove
                </button>
              </div>
            ))
          )}
        </div>

        <div className="modal-actions">
          <button className="ctl-btn" onClick={() => applyGraph(false)}>
            Apply in Session
          </button>
          <button className="ctl-btn" onClick={() => applyGraph(true)}>
            Save + Apply
          </button>
          <button className="ctl-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
