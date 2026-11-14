# Architecture

ARES is a two-process prototype: a static Vite shell and a FastAPI decision engine.

Product flow (what the judge should see):

```
Mission briefing
    → NASA data fusion (Trek + catalogued science)
    → Terrain & hazard analysis
    → Multi-objective A* (Safest / Fastest / Science)
    → Route comparison + GO / CAUTION / NO-GO
    → EVA start (GPS HUD)
    → Dynamic hazard
    → Automatic reroute
    → Safe return analysis
```

Engineering flow (what actually runs):

```
MissionProvider          waypoints, hazards, routeMode, planned A* path
  NavigationProvider     astronaut, destination, live route, PLSS tanks, return
    TelemetryProvider    adapter so Tracker / Planner keep working
      DecisionProvider   REST: mission, analyze, telemetry, hazard, compare
        UiProvider       view / role / palette
```

```
Frontend → REST API → Mission Decision Engine → SQLite
```

## Source of truth

| Concern | Owner |
| --- | --- |
| Crew pose, A* geometry, PLSS tick | Browser (`NavigationProvider`) |
| Local Go / No-Go checks | Browser (`assess.js`) |
| Persisted mission, risk, GO/CAUTION/NO-GO | FastAPI + SQLite |
| Globe imagery / DEM | Cesium iframe (`/mars-atlas.html`) |

One crew pose drives the Cesium marker, GPS HUD, profile marker, terrain-ahead strip, PLSS meters, and header badge.

Routes are not rebuilt every animation frame. A* runs when destination, route mode, mission, or validated hazards change. The origin is a snapshot of the astronaut at that moment (`routeOrigin`).

## Frontend modules

```
src/services/pathSolver.js           A*, metrics
src/services/assess.js               local Go / No-Go
src/services/aresApi.js              single HTTP client
src/services/plssCalculator.js       tanks + tickPlss
src/navigation/movementEngine.js     slope-scaled walk
src/routing/returnRoute.js           walk-back A*, three-way compare
src/context/DecisionContext.jsx      mission lifecycle against the API
src/map/atlasBridge.js               parent postMessage helpers
mars-atlas-src/aresBridge.js         Cesium overlay + cameras
```

## Backend modules

```
backend/app/main.py                 FastAPI app, CORS, /health
backend/app/api/missions.py         POST /api/missions
backend/app/api/navigation.py       analyze / compare / hazard
backend/app/api/telemetry.py        POST /api/telemetry/update
backend/app/services/risk_service.py terrain/hazard/resource/mission + decide()
backend/app/core/database.py         SQLite via SQLAlchemy
```

## Map adapter

The globe stays on `/mars-atlas.html`. When that page detects `window.parent !== window` it:

1. Adds `html.ares-embedded` and hides atlas chrome
2. Listens for `{ channel: 'ares', type, payload }`
3. Draws YOU / HAB / DEST / route / dashed return / envelope / POIs / hazards
4. Posts clicks back as `ares:click { lat, lon }`

Standalone `/mars-atlas.html` is unchanged.

## LithoSphere

LithoSphere is the **navigation concept source**, not a second renderer. Walk / Observe / Navigate, orbit vs astronaut camera, Home / Locate, and always-on coordinates were taken from it. Cesium still owns the globe.
