# Hackathon demo (3 minutes)

Goal: a judge should leave believing ARES is an intelligent mission system, not a Mars map, not a chatbot, and not a route visualizer.

Core line to close on:

> ARES doesn't just show astronauts where Mars is. It helps them decide where to go, how to get there, what to investigate, how to respond when conditions change, and whether they can safely return home.

## Click path (Jezero)

1. Open http://127.0.0.1:5173 — briefing, then **Start planning**.
2. Stay on **Explore**. Confirm the Cesium globe, YOU marker, and NASA layers.
3. Click terrain or a science target → **Navigate here**.
4. Switch **Safest / Fastest / Science**. Read Route comparison + Verdict (safety score, GO / CAUTION / NO-GO).
5. **Begin EVA**. Watch the marker, O₂, distance remaining, GPS HUD.
6. **Report hazard** (dust / slope / thermal). If the path is hit: `REROUTE_REQUIRED`, A* redraws, engine re-scores.
7. Open **Safe return**. Point at O₂ remaining, walk-back path, reachable envelope.
8. Close on the decision chain, not the globe.

## Timed script

### 0:00 — The problem

Show Mars. Do not click yet.

> The first astronaut on Mars cannot simply open Google Maps. Earth is 3 to 22 minutes away. The walk has to be decided on the surface.

### 0:15 — The mission

Briefing overlay, then **Start planning**.

```
MISSION     Jezero Science Traverse (or the loaded catalog mission)
OBJECTIVE   Investigate a geological formation / cached sample
CONSTRAINTS 15° slope limit · 45 min O₂ walk-back reserve
```

### 0:30 — ARES plans

Explorer: globe + data layers + terrain-ahead strip.

Show:

- NASA imagery on the globe (Trek tiles)
- Elevation / slope as trafficability, not decoration
- Hazard zones and science POIs
- Terrain intelligence: elevation, slope, surface class, hazard level

> This is NASA data becoming terrain intelligence — can a human walk here?

### 0:50 — Three routes

Pick a destination. Toggle Safest / Fastest / Science.

| Route | Optimizes | Trade-off to say out loud |
| --- | --- | --- |
| Safest | Low slope, mapped hazards, return margin | Longer, higher safety score |
| Fastest | Shortest time | Higher slope, more CAUTION flags |
| Science | Nearby high-value POIs | Extra minutes and O₂ for science value |

Point at the comparison card and the engine verdict. The numbers must match the path you are looking at.

> The safest route is not always the best mission route. ARES scores Safety × time × science.

### 1:20 — EVA starts

**Begin EVA**. Switch the HUD to astronaut navigation if the camera is in orbit.

The marker must move along the polyline. Call out:

- distance remaining
- O₂ falling with slope, not with a fake timer
- next heading
- communication / terrain strip updating

> The astronaut is actually navigating this route.

### 1:40 — Hazard detected

**Report hazard** on or near the path (dust storm is the wow beat).

```
⚠ MISSION ALERT
Dust / slope / thermal reported on the active traverse
```

Say:

1. Environment updated
2. Affected segment flagged
3. Safety score drops if the path is hit
4. Engine returns `REROUTE_REQUIRED`

### 2:00 — ARES responds

Wait for A* to publish the replacement path. New line on the globe. New analyze.

```
ROUTE UPDATED
Previous safety → new safety
Additional distance / time
Reason: avoiding the reported hazard corridor
```

Verdict reasons are the “copilot.” They explain this route, not a generic chatbot reply.

### 2:30 — Safe return

Open the safe-return panel.

```
O₂ remaining
Max safe return (walk-back + 45 min reserve)
Distance to habitat
Status: NOMINAL / MARGIN LOW / POINT OF NO RETURN
```

Point at the reachable envelope shrinking with oxygen.

If the return path exceeds reserve: **POINT OF NO RETURN** — recommended action is abort to habitat.

### 2:50 — Final vision

Leave the globe up with the new route and the GO / CAUTION / NO-GO card.

> ARES transforms NASA Mars data into real-time mission decisions for the first humans who will walk on Mars.

## What not to demo

- Do not open a generic chat widget.
- Do not dwell on catalogue chrome.
- Do not generate a route without reading the verdict.
- Do not skip the hazard → reroute beat. That is the wow moment.

## Backup if the engine is down

The local Go / No-Go card still runs. Say so once, then continue with A*, PLSS, and safe return. Do not restart mid-pitch unless both processes are dead.
