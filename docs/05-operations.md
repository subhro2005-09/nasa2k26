# Runtime operations

Two processes: Vite (UI + solvers) and FastAPI (decision engine). If the engine is down, the UI still plans, walks, and scores locally.

Demo click path: [07-demo.md](./07-demo.md). Data provenance: [08-nasa-data.md](./08-nasa-data.md).

## 1. Mission plan (browser)

On waypoint, mode, or validated-hazard change:

```
waypoints + hazards + routeMode
        → generateDensePath()
        → calculateRouteMetrics()
        → calculatePlssConsumption(metrics, 1)
        → assessRoute()
```

Persisted in `localStorage` key `ares:v2`.

## 2. Live navigation (browser, 10 Hz)

Paused when `document.hidden`.

```
if following:   advanceAlongPath · tickPlss(moving)
else if walk:   walkStep · tickPlss(moving)
else:           tickPlss(idle 0.42×)
```

After each pose: sample elevation/slope, project onto the path, throttle return A* (~8 px) and envelope (~16 px), `postMessage ares:you`.

## 3. Destination solve (browser)

`setDestination` snapshots `routeOrigin = astronaut`, then `compareNavRoutes` (or `generatePlanetRoute` beyond the tactical box). The HUD binds `comparisons[routeMode]`.

## 4. Decision engine (FastAPI)

`DecisionProvider` (`src/context/DecisionContext.jsx`) is the only caller of `src/services/aresApi.js`.

| Event | Call |
| --- | --- |
| Destination set | `POST /api/missions` then `POST /api/navigation/analyze` |
| Mode / metrics / hazards change | debounced `analyze` + `compare` |
| EVA follow | `POST /api/telemetry/update` every 2.5 s |
| Validated hazard added | `POST /api/navigation/hazard` |

Analyze payload includes frontend metrics (distance, slope, duration) and a subsample of waypoints. The engine does not re-run A*.

On `REROUTE_REQUIRED` the UI toasts and, if the crew was in Direct mode, switches to Safe so the existing solver avoids the new radius.

## 5. Cesium bridge

Parent → globe: `ares:state`, `ares:you`, `ares:locate`  
Globe → parent: `ares:ready`, `ares:click`  
All messages: `{ channel: 'ares', type, payload }`.

## 6. Consumables

Tanks start full (`1200 L O₂`, `1800 Wh`, `4.8 L` feedwater). `tickPlss`:

- slope factor `1 + (max(slope,0)/10)^1.35 * 0.45`
- mapped zone × 1.18
- idle × 0.42
- battery +60 W above 8° slope

Point of no return is routed: remaining litres vs `(returnMinutes + 45) * burnRate`.

## 7. Offline

Service worker caches the app shell in production. The globe needs the network. Solver, HUD, charts, and EVA brief keep working if FastAPI or Trek is unreachable. The Go / No-Go card then shows “Decision engine offline”.
