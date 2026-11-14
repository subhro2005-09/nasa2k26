# Project setup

Two processes. Vite proxies `/api` and `/health` to FastAPI (`vite.config.js`).

Timed judging script: [07-demo.md](./07-demo.md). NASA sources: [08-nasa-data.md](./08-nasa-data.md).

## Requirements

- Node.js 18+
- Python 3.11+
- npm
- A browser with WebGL
- Internet access for NASA Mars Trek imagery and marshub terrain

## Frontend

```bash
npm install
npm run dev
```

Vite serves **http://localhost:5173/** (`host: true`). `/api` and `/health` proxy to `http://127.0.0.1:8000`.

| Script | Result |
| --- | --- |
| `npm run dev` | Vite on port 5173 |
| `npm run build` | `dist/` plus precompressed `.br` / `.gz` |
| `npm run preview` | Serve `dist/` locally |

`vite.config.js` has two HTML entries: `index.html` (ARES shell) and `mars-atlas.html` (globe). Both must stay in the build so the iframe works in production.

## Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

| URL | What |
| --- | --- |
| http://127.0.0.1:8000/health | `{ status: online, service: ARES Mission Backend }` |
| http://127.0.0.1:8000/docs | Swagger UI |
| http://127.0.0.1:8000/api/missions | Mission create / list |

```bash
cd backend && source .venv/bin/activate && pytest -q
```

## Environment

| Name | Where | Default |
| --- | --- | --- |
| `VITE_API_URL` | Frontend build | empty (relative `/api` via Vite proxy) |
| `ENVIRONMENT` | Backend | `development` |
| `DATABASE_URL` | Backend | `sqlite:///./ares.db` |
| `CORS_ORIGINS` | Backend | localhost Vite ports |

## Important URLs

| URL | What |
| --- | --- |
| `/` | ARES mission control + navigation |
| `/mars-atlas.html` | Globe standalone |
| `/mars-atlas.html` in an iframe | Embedded mode |

## Demo story (Jezero)

Default site: Jezero Crater, habitat **Ares Base Alpha**.

1. Dismiss the briefing (Enter).
2. Header shows **Return nominal**. HUD shows lat/lon at the habitat. Sidebar **Engine** should read Online once FastAPI is up.
3. **Locate astronaut** — the globe frames you.
4. Open **Science targets** and **Navigate here** on Skinner Ridge (or click the globe).
5. Wait for **Mission analysis** in the Go / No-Go card: safety score and GO / CAUTION / NO-GO.
6. Compare **Safest / Fastest / Science**. Keep Safest if the engine recommends it.
7. **Begin EVA**. Marker, profile, terrain-ahead, O₂, and ETA move together. Telemetry posts in the background.
8. **Report hazard** mid-walk. After validation the route re-solves. If the engine returns `REROUTE REQUIRED`, Direct mode switches to Safe.
9. Watch **Safe return**. If margin drops, **Return to base**.
10. Camera **Astronaut** for a heading-up follow view. **Walk** + WASD for manual motion.

## 3-minute judging table

| Time | Beat | Click |
| --- | --- | --- |
| 0:00 | Problem: no Google Maps on Mars | Globe, don't click yet |
| 0:15 | Mission briefing | **Start planning** |
| 0:30 | NASA layers + terrain intelligence | Explorer, terrain-ahead |
| 0:50 | Safest / Fastest / Science | Destination + mode toggle |
| 1:20 | EVA starts | **Begin EVA** — marker must move |
| 1:40 | Hazard | **Report hazard** on the path |
| 2:00 | Reroute + reasons | New polyline + Verdict |
| 2:30 | Safe return | Envelope + O₂ vs walk-back |
| 2:50 | Close | Decision chain, not the map |

Close:

> ARES transforms NASA Mars data into real-time mission decisions for the first humans who will walk on Mars.

## Keyboard

| Key | Action |
| --- | --- |
| W / ↑ | Walk forward (Walk mode) |
| S / ↓ | Walk back |
| A / ← | Turn left |
| D / → | Turn right |
| Ctrl/Cmd K or `/` | Command palette |
| Enter / Esc | Skip first-run briefing |
