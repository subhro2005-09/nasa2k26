# ARES — Autonomous EVA Routing & Environmental Safety System

ARES is an adaptive mission decision-support system for Mars EVAs. It combines terrain-aware navigation, hazard analysis, astronaut resource monitoring and dynamic rerouting to help astronauts make safer movement decisions in unpredictable Martian environments.

https://ares-frontend-b6x7.onrender.com/

APIS - https://ares-backend-vso9.onrender.com/docs

```
Frontend → REST API → Mission Decision Engine → SQLite
```

The Vite + Preact shell keeps the Cesium Mars Atlas, A* solver, movement engine and PLSS tick. FastAPI scores the live route and returns explainable **GO / CAUTION / NO-GO**.

Planning data is modelled and simulated for design review. Not for flight.

## Features

- Mars navigation on NASA Trek imagery (Cesium globe)
- Hazard-aware A* routing (Safest / Fastest / Science)
- Mission risk analysis (terrain 30% · hazard 35% · resource 20% · mission 15%)
- GO / CAUTION / NO-GO with written reasons
- EVA telemetry (position, O₂, battery, elapsed time)
- Dynamic rerouting when a reported hazard intersects the active path

## Architecture

```
                         USER
                           │
                           ▼
                ┌─────────────────────┐
                │    ARES FRONTEND    │
                │  Vite + Preact      │
                │  Cesium Mars Atlas  │
                │  A* + PLSS tick     │
                └──────────┬──────────┘
                           │ REST
                           ▼
                ┌─────────────────────┐
                │    ARES BACKEND     │
                │  Mission API        │
                │  Risk / Decision    │
                │  Telemetry / Hazard │
                └──────────┬──────────┘
                           ▼
                         SQLite
```

Docs: [docs/README.md](docs/README.md) · [3-minute demo](docs/07-demo.md) · [NASA data fusion](docs/08-nasa-data.md)

## Run locally

Frontend (http://localhost:5173):

```bash
npm install
npm run dev
```

Backend (http://127.0.0.1:8000 · Swagger at `/docs`):

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Vite proxies `/api` and `/health` to the backend in development. If the engine is down, the existing in-browser Go/No-Go still works.

## Demo story (Jezero)

1. Open the explorer and pick a destination (globe click, Explore list, or **Navigate here** on a science target).
2. ARES solves Safest / Fastest / Science from your position.
3. The decision engine returns a safety score and GO / CAUTION / NO-GO.
4. **Begin EVA** — consumables and telemetry update as you walk.
5. **Report hazard** — the engine flags `REROUTE_REQUIRED` if the path is hit.
6. The frontend A* publishes a replacement route; the engine re-scores it.

## Environment

Frontend:

```
VITE_API_URL=https://YOUR-BACKEND.onrender.com
```

Leave unset for local Vite (relative `/api` via proxy).

Backend:

```
ENVIRONMENT=production
DATABASE_URL=sqlite:///./ares.db
CORS_ORIGINS=https://YOUR-FRONTEND.onrender.com
```

## Deploy (Render)

| Service | Type | Build | Start / publish |
| --- | --- | --- | --- |
| Frontend | Static site | `npm install && npm run build` | `dist` |
| Backend | Web service | `pip install -r requirements.txt` | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |

Backend root directory: `backend`. Set `VITE_API_URL` on the static site to the backend origin.

## Tests

```bash
cd backend
source .venv/bin/activate
pytest -q
```

## License

MIT. See [LICENSE](LICENSE).
