# NASA data fusion

ARES is built to make the chain visible:

**NASA data → intelligence → decision**

Do not hide sources. Every layer below is either streamed from NASA Trek / Cesium, catalogued from published mission context, or explicitly labelled as a simulation model.

## Fusion board (say this in the demo)

```
NASA DATA FUSION

🛰  High-resolution Mars imagery     Viking MDIM · CTX / HiRISE
⛰  Elevation & topography           MOLA / HRSC on the globe
📐  Terrain slope                    Derived trafficability grid
🌡  Environmental surface data       Temperature / dust (modelled)
🪨  Geological features              CRISM-style mineral records
📍  Exploration coordinates          Jezero / Gale / Coprates sites
```

## Datasets

| Layer | Source | What it contributes | How ARES uses it |
| --- | --- | --- | --- |
| Viking MDIM 2.1 | NASA JPL · Trek tiles | Global true-color basemap | Globe context; “you are here” |
| MOLA topographic relief | MGS / NASA GSFC | Elevation vs aeroid | Globe DEM; slope context |
| CTX / HiRISE | MRO / Malin & UArizona | Meter-scale surface texture | High-res overlay; boulder / ripple context |
| Slope & trafficability | MOLA / HiRISE-derived model | Degrees of incline | A* cost, 15° wall, O₂ exertion, HUD warnings |
| CRISM mineralogy | MRO CRISM / JHU APL (catalogued) | Carbonates, clays, olivine, hydrated silica | Science score, Science-optimal vias |
| SHARAD / GRS ice indicators | MRO SHARAD · Odyssey GRS (catalogued) | Shallow ice / ISRU hints | Science POIs, not a live radar cube |
| Rover traverse history | Perseverance / Curiosity | Real drive context | Mission waypoints, place list |

Live tile endpoints live in `src/data/layersData.js`. The Cesium atlas (`mars-atlas-src/`) streams Trek imagery and MOLA/HRSC terrain. The A* solver uses a matching **analytic DEM** (`src/data/terrainElevationData.js`) so routing still works when tiles are slow.

## Elevation

```
ELEVATION DATA
Used for:
• Slope calculation
• Traversability analysis
• Route optimization
• Oxygen exertion (steeper → slower → more O₂)
```

Globe elevation: NASA MOLA / HRSC via Cesium. Solver elevation: modelled Jezero / Gale / Coprates DEM, internally consistent with the 15° EVA limit.

## Slope → walkability

Classification shown to crew (not “what Mars looks like”):

| Class | Slope | Meaning |
| --- | --- | --- |
| SAFE | < 5° | Nominal walking terrain |
| MODERATE | 5–15° | Higher O₂ cost |
| DIFFICULT / DANGEROUS | > 15° | Slip / rollover; A* treats as wall on Safest |

## Geology → science value

Science-optimal routing pulls named POIs (`src/data/sciencePoisData.js`) with CRISM-style mineral notes. Adding a target:

- recalculates the path (`science` mode vias, or waypoint insert)
- adds minutes and O₂
- raises science count on the traverse
- is re-scored by the decision engine

That is the intended trade: **safety × mission efficiency × scientific value**.

## Environment

Surface temperature, dust optical depth, and radiation badges are **modelled** for the demo. They feed the mission-risk term (15% of total risk) and HUD status. They are not a live Mars weather feed.

## Provenance rule

If a number is computed in-browser or in FastAPI, it must be traceable:

- distance / slope → `pathSolver.js` metrics
- O₂ / battery → `plssCalculator.js`
- local Go / No-Go → `assess.js`
- persisted GO / CAUTION / NO-GO → `backend/app/services/risk_service.py`

Do not invent disconnected percentages in the UI. If you add a panel, bind it to one of those four.
