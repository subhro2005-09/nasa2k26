# Navigation loop

This is the product loop. Every panel reads the same astronaut state.

```
USER POSITION (lat, lon, heading, elevation)
        ↓
CURRENT TERRAIN (slope, zone, reported hazard)
        ↓
DESTINATION (POI, map click, or habitat)
        ↓
ROUTE SOLVER  (safe | direct | science) from routeOrigin → dest
        ↓
ROUTE GEOMETRY (tactical pixels, densified ~8 px)
        ↓
ANALYSIS (browser)
  elevation profile     ← active path + you marker
  terrain ahead         ← samples forward of idx
  next GPS instruction  ← heading + remaining km
        ↓
DECISION ENGINE (FastAPI)
  POST /api/navigation/analyze  ← metrics + waypoints + O₂/battery
  GO / CAUTION / NO-GO + safety_score + reasons
        ↓
MOVEMENT
  Walk: WASD / stick, speed × slope/hazard factor
  Navigate: interpolate along the solved path
        ↓
PLSS tick  (O2, battery, feedwater × effort × dt)
        ↓
SAFE RETURN
  A* to habitat + 45 min reserve
  reachable envelope on the same grid
        ↓
MAP + HUD update
        ↓
updated USER POSITION
```

## Control modes

| Mode | Camera | Movement |
| --- | --- | --- |
| Observe | Orbit or astronaut | None. Map clicks set destination (or relocate crew). |
| Walk | Usually astronaut | W/S translate, A/D yaw. Speed 1.0× flat → 0.35× hazard. |
| Navigate | Either | Follows the solved polyline at EVA speed × playback. |

## Route strategies

All three still use `generateDensePath` so the original cost function is preserved.

1. **Safest (`safe`)** — A* with slope² penalty, 15° wall, mapped zones, reported hazards
2. **Fastest (`direct`)** — straight legs; severe hazards still show up in Go / No-Go
3. **Science (`science`)** — A* plus vias through nearby POIs (`withScienceVias`)

## PLSS

`tickPlss` burns tanks from **elapsed movement and local slope**, not `progress × planned minutes`.

```
O2 burn = nominalRate × (moving ? 1 : 0.42) × slopeFactor × terrainFactor × dtMin
```

Idle life support still drains slowly so a stopped crew is not frozen in time.

## Safe return

`generateReturnRoute` runs A* from the live pose to `mission.habSite` in safest mode.

`evaluateSafeReturn` compares remaining O₂ to (return time + 45 min) × current burn rate:

- `nominal` — SAFE RETURN: NOMINAL
- `low` — RETURN MARGIN LOW
- `ponr` — POINT OF NO RETURN

`reachableEnvelope` is a Dijkstra on the same 16 px grid with remaining walk budget. It is a hull of reachable cells, not a circle. Recomputed about every 16 px of motion.

## Core calculations (internally consistent)

These are the numbers every panel must share. Do not invent disconnected percentages.

### Route safety (engine)

```
terrain_risk   30%   max slope vs 15°, mean slope, relief
hazard_risk    35%   count, proximity, LOW/MEDIUM/HIGH
resource_risk  20%   O₂, battery, elapsed vs duration
mission_risk   15%   EVA length vs 8 h, dust τ

safety_score = 100 − total_risk
```

GO if total risk ≤ 40 and slope ≤ 15°. CAUTION above that. NO-GO if O₂ < 20%, battery < 15%, or total risk > 70.

### Science score (frontend + compare)

Driven by POIs on or near the path (`scienceCount`, site importance). Science mode inserts vias; adding a target increases distance, time, O₂, and science value.

### Oxygen

```
O2 burn = nominalRate × (moving ? 1 : 0.42) × slopeFactor × terrainFactor × dtMin
slopeFactor = 1 + (max(slope,0)/10)^1.35 × 0.45
```

Steeper → slower walk (`movementEngine`) → higher burn. Longer route → longer duration → more O₂.

### Safe return

```
CanReturn = remaining O₂  >  (returnMinutes + 45 min reserve) × currentBurnRate
```

Envelope is Dijkstra on the tactical grid with remaining walk budget — not a circle. It shrinks as tanks fall.

## Performance rules

- 10 Hz simulation tick, paused when the tab is hidden
- A* only on dest / mode / hazard changes
- Return path keyed to ~8 px bins
- Envelope keyed to ~16 px bins + O₂ budget
- Cesium gets `ares:you` for pose and `ares:state` for overlays
- Explorer stays mounted so the iframe is not reloaded
- Analyze is debounced (~280 ms) after dest / mode / hazard changes
- Telemetry posts every 2.5 s while EVA follow is running
- Hazard reports call `POST /api/navigation/hazard`; if `route_affected`, the existing A* re-solve is the replacement path
