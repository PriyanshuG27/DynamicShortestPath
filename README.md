# Dynamic Shortest Path on Probabilistic Graphs

Design and Analysis of Algorithms (DAA) PBL project implementing dynamic shortest path analysis over a probabilistic weighted graph.

## Tech Stack
- C++ core engine: Dijkstra (probabilistic + standard), Bellman-Ford, selective SPT updates, adversarial/random/batch edge updates, custom MinHeap.
- Python backend: Flask + Flask-SocketIO bridge to C++ process over stdin/stdout JSON events.
- Frontend: React + Vite + d3-force canvas visualization with live updates.

## Project Structure
- `graph.h`, `heap.h`: graph and heap data structures.
- `dijkstra.cpp`, `bellman.cpp`, `spt.cpp`, `adversarial.cpp`, `batch.cpp`, `main.cpp`: algorithm engine and JSON command loop.
- `server/app.py`, `server/bridge.py`, `server/osm_loader.py`: API, bridge, and optional OSM data loading.
- `client/src/`: UI (`App.jsx`, `GraphCanvas.jsx`, `Controls.jsx`, `SidePanel.jsx`).

## Prerequisites
- C++17 compiler (`g++` recommended)
- Python 3.10+
- Node.js 18+

## Build and Run

### 1) Build C++ core
From the project root:

```bash
make
```

If `make` is unavailable on Windows PowerShell, compile directly:

```powershell
g++ -std=c++17 -O2 -Wall -Wextra main.cpp -o main.exe
```

### 2) Start Python server
In a new terminal:

```powershell
cd server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Server runs on `http://127.0.0.1:5000`.

### 3) Start frontend
In another terminal:

```powershell
cd client
npm install
npm run dev
```

Frontend runs on `http://127.0.0.1:3000` (default Vite port).

## Core API Endpoints
- `POST /api/run`: `init`, `run_dijkstra`, `run_standard`, `run_bellman`
- `POST /api/update`: selective edge update (`mode=selective`)
- `POST /api/adversarial`: adversarial SPT perturbation
- `POST /api/random`: random edge update
- `POST /api/batch`: batch edge updates
- `POST /api/reset`: restore initial graph
- `POST /api/load_osm`: load cached/live Noida OSM graph
- `GET /api/health`: service health

## Quick Smoke Test (Backend)
From project root:

```powershell
python -c "from server.app import app; c=app.test_client(); print(c.post('/api/run', json={'cmd':'init','nodes':3,'edges':[[0,1,1.0,0.2],[1,2,2.0,0.1],[0,2,5.0,0.3]]}).status_code); print(c.post('/api/run', json={'cmd':'run_dijkstra','source':0,'k':1.0}).status_code)"
```

Expected output includes status codes `200` and `200`.

## Notes
- The C++ process communicates only via single-line JSON messages.
- Selective updates now emit refreshed `dist` and `prev` arrays to keep UI node labels synchronized after updates.
- Adversarial event naming is standardized to `adversarial_update`.
