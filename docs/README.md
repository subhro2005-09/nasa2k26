# ARES documentation

**ARES** is an AI-powered decision and navigation system for human Mars EVAs.

It is not a Mars map with route lines. It is a mission-critical loop:

```
NASA DATA
     ↓
TERRAIN INTELLIGENCE
     ↓
MULTI-OBJECTIVE ROUTE PLANNING
     ↓
MISSION DECISIONS  (GO / CAUTION / NO-GO)
     ↓
ASTRONAUT NAVIGATION
     ↓
DYNAMIC HAZARD RESPONSE
     ↓
SAFE RETURN
```

The question the system answers:

> Given my location, objective, terrain, hazards, remaining oxygen, and scientific opportunities — what is the safest and most valuable route, and can I still return to habitat?

Planning data is modelled and simulated for design review. Not for flight.

## What is NASA vs simulated

| NASA-sourced | Simulated / modelled |
| --- | --- |
| Trek imagery (Viking MDIM, MOLA, CTX/HiRISE) | Analytic DEM used by A* |
| MOLA / HRSC terrain on the Cesium globe | Suit heart rate, MC validation delay |
| Catalogued Jezero / Gale / Coprates sites | Spectral curves (representative, not raw CRISM cubes) |
| Perseverance / Curiosity traverse context | Dust-storm demo events, Earth delay badge |
| Named science targets (CRISM-style records) | PLSS burn rates (NASA-style model, not a real suit) |

See [08-nasa-data.md](./08-nasa-data.md).

## Index

| Doc | Contents |
| --- | --- |
| [01-system-audit.md](./01-system-audit.md) | What already worked, what the engine owns, feature map |
| [02-architecture.md](./02-architecture.md) | Providers, modules, map adapter, product flow |
| [03-navigation-loop.md](./03-navigation-loop.md) | Pose → terrain → A* → decision → walk → PLSS → return |
| [04-setup.md](./04-setup.md) | Run locally, 3-minute judging script |
| [05-operations.md](./05-operations.md) | Runtime order, persistence, fallback |
| [06-backend.md](./06-backend.md) | FastAPI endpoints, risk weights, SQLite |
| [07-demo.md](./07-demo.md) | Hackathon demo narrative and click path |
| [08-nasa-data.md](./08-nasa-data.md) | Data fusion: source → intelligence → decision |

## Run

Two processes. Vite proxies `/api` and `/health` to FastAPI.

```bash
# frontend — http://localhost:5173
npm install && npm run dev

# backend — http://127.0.0.1:8000/docs
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Setup detail: [04-setup.md](./04-setup.md).
