# ARES Mission Backend

FastAPI decision engine for the Autonomous EVA Routing & Environmental Safety System.

The Vite frontend keeps the A* solver, Cesium globe, and PLSS tick. This service:

- persists missions, hazards, telemetry, and route analyses in SQLite
- scores terrain / hazard / resource / mission risk
- returns explainable **GO / CAUTION / NO-GO**
- flags **REROUTE_REQUIRED** when a reported hazard intersects the active path

```
Frontend → REST API → Mission Decision Engine → SQLite
```

## Run locally

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API: http://127.0.0.1:8000
- Health: http://127.0.0.1:8000/health
- Swagger: http://127.0.0.1:8000/docs

## Tests

```bash
cd backend
source .venv/bin/activate
pytest -q
```

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | `production` tightens CORS |
| `DATABASE_URL` | `sqlite:///./ares.db` | SQLite path or other SQLAlchemy URL |
| `CORS_ORIGINS` | localhost Vite ports | Comma-separated frontend origins |

## Render

```
Root directory: backend
Build: pip install -r requirements.txt
Start: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Set `ENVIRONMENT=production` and `CORS_ORIGINS` to the static-site URL.
