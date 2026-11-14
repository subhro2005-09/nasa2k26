# Mission decision engine

FastAPI service in `backend/`. Swagger: http://127.0.0.1:8000/docs

This is the explainable copilot, not a chatbot. Every GO / CAUTION / NO-GO includes `reasons[]` and a `recommended_action` derived from the live A* metrics, tanks, and hazards.

## Health

```
GET /health
→ { "status": "online", "service": "ARES Mission Backend" }
```

## Missions

```
POST /api/missions
{
  "mission_name": "Jezero Science Traverse",
  "astronaut_id": "ASTRO-01",
  "start": { "latitude": 18.432, "longitude": 77.221 },
  "destination": { "latitude": 18.482, "longitude": 77.301 },
  "mission_type": "SAFE"
}
→ { "mission_id": "mission_001", "status": "ACTIVE", "created_at": "..." }
```

`GET /api/missions` lists recent rows. `GET /api/missions/{id}` returns one.

## Analyze

```
POST /api/navigation/analyze
```

The frontend sends live A* metrics. If metrics are omitted, the engine falls back to a Mars-geodesic estimate (radius 3389.5 km, suited walk 0.9 m/s).

Response includes `route`, `terrain`, `hazards`, `resources`, `decision`, and the four-way `risk` breakdown.

## Risk (0–100)

| Factor | Weight | Inputs |
| --- | --- | --- |
| Terrain | 30% | max slope vs 15°, average slope, elevation range, roughness |
| Hazard | 35% | count, proximity, LOW/MEDIUM/HIGH |
| Resource | 20% | O₂ remaining, battery remaining, elapsed vs duration |
| Mission | 15% | EVA duration vs 8 h, dust τ |

`safety_score = 100 − total_risk`

Abort lines:

- O₂ below 20% → `NO_GO`
- Battery below 15% → `NO_GO`
- total risk above 70 → `NO_GO`
- total risk above 40 or slope above 15° → `CAUTION`
- else `GO`

Every status includes `reasons[]` and `recommended_action` (`PROCEED`, `REROUTE`, `GENERATE_SAFER_ROUTE`, `ABORT_TO_HABITAT`).

## Telemetry

```
POST /api/telemetry/update
{ mission_id, position, oxygen, battery, elapsed_time_minutes }
→ { mission_status, oxygen, battery, risk_score, decision, reasons }
```

Samples are stored in `telemetry_history`.

## Hazard / reroute

```
POST /api/navigation/hazard
{ mission_id, hazard: { latitude, longitude, radius, severity } }
```

1. Persist the hazard.
2. Measure haversine distance to stored waypoints (or start–dest geodesic).
3. If distance ≤ radius (pad 40 m), `route_affected: true` and `decision: "REROUTE_REQUIRED"`.
4. Frontend A* then publishes a replacement path; a follow-up `analyze` re-scores it.

## Compare

```
POST /api/navigation/compare
```

Scores SAFE / DIRECT / SCIENCE. Recommended route is the highest safety score that is not `NO_GO`, then shorter duration.

## SQLite

File: `backend/ares.db` (configurable via `DATABASE_URL`).

Tables: `missions`, `hazards`, `route_analysis`, `telemetry_history`.

No authentication. This is a competition prototype.

## CORS

Development allows localhost Vite origins plus `*`. Production uses `CORS_ORIGINS` only.
