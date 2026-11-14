import "./style.css";
import * as Cesium from "cesium";
import { CATEGORY_META } from "./data/highlights.js";
import { MISSIONS } from "./data/missions.js";
import { setupScene, throttle } from "./scene.js";
import { flyTo, homeView, MARS } from "./globe.js";
import { formatCoord, formatElevation, getElevation, typeLabel } from "./mars.js";
import { attachAresBridge } from "./aresBridge.js";
import { generatePlanetRoute } from "../src/routing/planetRoute.js";
import { readNav } from "./navSync.js";

const $ = (sel) => document.querySelector(sel);

const sceneApi = setupScene($("#cesium"));
const { viewer, featuresById, highlights } = sceneApi;
const canvas = viewer.scene.canvas;

const state = {
  categoryFilter: new Set(Object.keys(CATEGORY_META)),
  missionsOn: true,
  nomenclatureOn: false,
  labelsOn: true,
  selectedId: null,
  measuring: false,
};

/* ------------------------------------------------------------------ chips */
const chipsEl = $("#chips");
for (const [key, meta] of Object.entries(CATEGORY_META)) {
  if (key === "mission") continue;
  const btn = document.createElement("button");
  btn.className = "chip on";
  btn.dataset.category = key;
  btn.innerHTML = `<span class="dot" style="background:${meta.color}"></span>${meta.label}`;
  btn.addEventListener("click", () => {
    if (state.categoryFilter.has(key)) state.categoryFilter.delete(key);
    else state.categoryFilter.add(key);
    const on = state.categoryFilter.has(key);
    btn.classList.toggle("on", on);
    btn.classList.toggle("off", !on);
    applyFilters();
  });
  chipsEl.appendChild(btn);
}

/* ------------------------------------------------------------- feature list */
const listEl = $("#feature-list");
const missionListEl = $("#mission-list");

function renderFeatureList() {
  listEl.innerHTML = "";
  const visible = highlights.filter((f) => state.categoryFilter.has(f.category));
  $("#feature-count").textContent = `${visible.length} sites`;
  for (const feature of visible) {
    const btn = document.createElement("button");
    btn.className = "entry";
    btn.dataset.id = feature.id;
    const meta = CATEGORY_META[feature.category];
    btn.innerHTML = `<span><span class="mission-dot" style="background:${meta.color}"></span>${feature.name}</span><span class="meta">${feature.diameter ? Math.round(feature.diameter) + " km" : ""}</span>`;
    btn.addEventListener("click", () => selectFeature(feature.id, true));
    listEl.appendChild(btn);
  }
  highlightActive();
}

function renderMissionList() {
  missionListEl.innerHTML = "";
  for (const mission of MISSIONS) {
    const btn = document.createElement("button");
    btn.className = "entry";
    btn.dataset.id = `mission:${mission.name}`;
    const color = mission.status === "active" ? "#7ee787" : "#9aa4b2";
    btn.innerHTML = `<span><span class="mission-dot" style="background:${color}"></span>${mission.name}</span><span class="meta">${mission.year}</span>`;
    btn.addEventListener("click", () => selectFeature(`mission:${mission.name}`, true));
    missionListEl.appendChild(btn);
  }
  highlightActive();
}

function highlightActive() {
  for (const el of document.querySelectorAll(".entry")) {
    el.classList.toggle("active", el.dataset.id === state.selectedId);
  }
}

function applyFilters() {
  for (const entity of sceneApi.featureSources.entities.values) {
    const record = featuresById.get(entity.id);
    entity.show = record ? state.categoryFilter.has(record.category) : true;
  }
  renderFeatureList();
  sceneApi.refreshLabels();
}

/* --------------------------------------------------------------- selection */
async function selectFeature(id, doFly = false) {
  const feature = featuresById.get(id);
  if (!feature) return;
  state.selectedId = id;
  highlightActive();
  if (doFly) flyTo(viewer, feature.lat, feature.lon, flyRadius(feature));
  showInfo(feature);
  const embedded = window.parent && window.parent !== window;
  if (embedded) {
    window.parent.postMessage({
      channel: 'ares',
      type: 'ares:place',
      payload: {
        id: feature.id || feature.name,
        name: feature.name,
        lat: feature.lat,
        lon: feature.lon,
        category: feature.category || feature.kind,
        diameter: feature.diameter
      }
    }, '*');
  } else if (feature.kind !== 'mission') {
    const stored = readNav();
    const from = stored?.astronaut?.lat != null
      ? stored.astronaut
      : (highlights.find((h) => h.name === 'Gale Crater') || { lat: -5.4, lon: 137.8 });
    const routed = generatePlanetRoute(from, feature, 'safe');
    window.__aresApplyRoute?.({
      planetary: true,
      cameraMode: 'orbit',
      astronaut: { lat: from.lat, lon: from.lon, heading: from.heading || 0 },
      destination: { name: feature.name, lat: feature.lat, lon: feature.lon, category: feature.category, diameter: feature.diameter },
      route: routed.points,
      alerts: routed.alerts,
      routeHazards: routed.alerts
    }, { publish: true });
  }
}

function flyRadius(feature) {
  if (feature.kind === "mission") return 120;
  const d = feature.diameter || 200;
  return Math.min(2600, Math.max(90, d * 1.5));
}

const infoCard = $("#info-card");
let infoToken = 0;

async function showInfo(feature) {
  const token = ++infoToken;
  const meta = CATEGORY_META[feature.category] || CATEGORY_META.region;
  $("#info-type").textContent = typeLabel(feature);
  $("#info-type").style.color = meta.color;
  $("#info-name").textContent = feature.name;

  const stats = [
    ["Latitude", `${feature.lat.toFixed(2)}°`],
    ["Longitude", `${feature.lon.toFixed(2)}°`],
  ];
  if (feature.kind === "mission") {
    stats.push(["Agency", feature.agency], ["Landed", String(feature.year)]);
  } else if (feature.diameter) {
    stats.push(["Extent", `${Math.round(feature.diameter).toLocaleString()} km`]);
  }
  stats.push(["Elevation", "…"]);

  $("#info-stats").innerHTML = stats
    .map(([k, v]) => `<div class="stat"><span>${k}</span><strong>${v}</strong></div>`)
    .join("");

  const desc =
    feature.description ||
    feature.origin ||
    "A named feature in the IAU Gazetteer of Planetary Nomenclature.";
  $("#info-desc").textContent = desc;
  $("#info-link").style.display = feature.link ? "" : "none";
  $("#info-link").href = feature.link || "#";

  infoCard.hidden = false;
  const btn = $("#info-fly");
  btn.onclick = () => flyTo(viewer, feature.lat, feature.lon, flyRadius(feature));

  const elevation = await getElevation(feature.lat, feature.lon);
  if (token !== infoToken) return;
  const cells = $("#info-stats").querySelectorAll(".stat strong");
  const last = cells[cells.length - 1];
  if (last) last.textContent = formatElevation(elevation);
}

$("#info-close").addEventListener("click", () => {
  infoCard.hidden = true;
  state.selectedId = null;
  highlightActive();
});

/* ------------------------------------------------------------------ search */
const searchInput = $("#search");
const resultsEl = $("#search-results");
const searchIndex = [
  ...highlights.map((f) => ({
    id: f.id,
    name: f.name,
    sub: CATEGORY_META[f.category].label,
    lat: f.lat,
    lon: f.lon,
    d: f.diameter,
  })),
  ...MISSIONS.map((m) => ({
    id: `mission:${m.name}`,
    name: m.name,
    sub: `${m.agency} · ${m.year}`,
    lat: m.lat,
    lon: m.lon,
    d: 100,
  })),
  ...sceneApi.nomenclature.map((n) => ({
    id: n.id,
    name: n.name,
    sub: typeLabel(n),
    lat: n.lat,
    lon: n.lon,
    d: n.diameter,
  })),
];

function runSearch(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    resultsEl.hidden = true;
    return;
  }
  const matches = searchIndex
    .map((item) => {
      const name = item.name.toLowerCase();
      let score = -1;
      if (name === q) score = 1000;
      else if (name.startsWith(q)) score = 800 - name.length;
      else if (name.includes(q)) score = 500 - name.indexOf(q) * 3;
      return { item, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((m) => m.item);

  if (!matches.length) {
    resultsEl.innerHTML = `<div class="sr-empty">Nothing matches “${query}”.</div>`;
    resultsEl.hidden = false;
    return;
  }

  resultsEl.innerHTML = "";
  for (const item of matches) {
    const btn = document.createElement("button");
    btn.className = "sr-item";
    btn.innerHTML = `<span>${item.name}</span><small>${item.sub}</small>`;
    btn.addEventListener("click", () => {
      resultsEl.hidden = true;
      searchInput.value = item.name;
      selectFeature(item.id, true);
    });
    resultsEl.appendChild(btn);
  }
  resultsEl.hidden = false;
}

const debouncedSearch = throttle(() => runSearch(searchInput.value), 90);
searchInput.addEventListener("input", debouncedSearch);
searchInput.addEventListener("focus", () => {
  if (searchInput.value) runSearch(searchInput.value);
});
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const first = resultsEl.querySelector(".sr-item");
    if (first) first.click();
  } else if (e.key === "Escape") {
    searchInput.blur();
    resultsEl.hidden = true;
  }
});
document.addEventListener("click", (e) => {
  if (!$("#search-wrap").contains(e.target)) resultsEl.hidden = true;
});

$("#btn-dock").addEventListener("click", () => {
  $("#dock").classList.toggle("open");
});

/* ------------------------------------------------------------------- tabs */
for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => {
    for (const t of document.querySelectorAll(".tab")) t.classList.remove("active");
    tab.classList.add("active");
    for (const p of document.querySelectorAll(".panel")) p.classList.remove("active");
    document.querySelector(`.panel[data-panel="${tab.dataset.tab}"]`).classList.add("active");
  });
}

/* ---------------------------------------------------------------- basemaps */
const basemapDefs = [
  {
    id: "albedo",
    name: "Natural colour",
    detail: "Viking MDIM 2.1 · 232 m/px",
    thumb: `https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/2/1/3.jpg`,
  },
  {
    id: "topo",
    name: "Colourised topography",
    detail: "MOLA shaded relief · 463 m/px",
    thumb: `https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/2/1/3.jpg`,
  },
];
const basemapsEl = $("#basemaps");
for (const bm of basemapDefs) {
  const btn = document.createElement("button");
  btn.className = `basemap${bm.id === "albedo" ? " active" : ""}`;
  btn.dataset.id = bm.id;
  btn.innerHTML = `<span class="thumb" style="background-image:url('${bm.thumb}')"></span><span>${bm.name}<small>${bm.detail}</small></span>`;
  btn.addEventListener("click", () => {
    sceneApi.setBasemap(bm.id);
    for (const b of basemapsEl.children) b.classList.toggle("active", b.dataset.id === bm.id);
  });
  basemapsEl.appendChild(btn);
}

/* ------------------------------------------------------------------ toggles */
const missionsToggle = $("#toggle-missions");
const missionsToggle2 = $("#toggle-missions-2");

function setMissions(on) {
  state.missionsOn = on;
  sceneApi.missionSource.show = on;
  missionsToggle.checked = on;
  missionsToggle2.checked = on;
  sceneApi.refreshLabels();
}

for (const el of [missionsToggle, missionsToggle2]) {
  el.addEventListener("change", () => setMissions(el.checked));
}

$("#toggle-nomenclature").addEventListener("change", (e) => {
  state.nomenclatureOn = e.target.checked;
  sceneApi.nomenclatureSource.show = state.nomenclatureOn;
  sceneApi.refreshLabels();
});

$("#toggle-labels").addEventListener("change", (e) => {
  state.labelsOn = e.target.checked;
  sceneApi.setLabels(state.labelsOn);
});

$("#toggle-grid").addEventListener("change", (e) => {
  sceneApi.grid.show = e.target.checked;
});

function bindPairedToggle(ids, apply, initial) {
  const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
  const set = (on) => {
    apply(on);
    for (const el of els) el.checked = on;
  };
  for (const el of els) {
    el.checked = initial;
    el.addEventListener("change", () => set(el.checked));
  }
  set(initial);
}

bindPairedToggle(
  ["toggle-atmosphere", "toggle-atmosphere-hud"],
  (on) => sceneApi.spaceWeather.setAtmosphere(on),
  true
);
bindPairedToggle(
  ["toggle-flare", "toggle-flare-hud"],
  (on) => sceneApi.spaceWeather.setSolarFlare(on),
  true
);
bindPairedToggle(
  ["toggle-solar-wind", "toggle-solar-wind-hud"],
  (on) => sceneApi.spaceWeather.setSolarWind(on),
  false
);

$("#toggle-terrain").addEventListener("change", async (e) => {
  if (e.target.checked) {
    const ok = await sceneApi.enableTerrain();
    if (!ok) toast("Elevation tiles are unavailable right now.");
  } else {
    viewer.scene.terrainProvider = new Cesium.EllipsoidTerrainProvider({
      ellipsoid: MARS,
    });
  }
});

const exag = $("#exaggeration");
const exagOut = $("#exaggeration-out");
function paintSlider() {
  const pct = ((exag.value - exag.min) / (exag.max - exag.min)) * 100;
  exag.style.background = `linear-gradient(90deg, var(--ember) ${pct}%, rgba(255,255,255,0.14) ${pct}%)`;
}
exag.addEventListener("input", () => {
  const value = Number(exag.value);
  exagOut.textContent = `${value.toFixed(1)}×`;
  viewer.scene.verticalExaggeration = value;
  paintSlider();
});
paintSlider();

/* ---------------------------------------------------------------- view mode */
const modeBtn = $("#btn-mode");
let is2D = false;
modeBtn.addEventListener("click", () => {
  is2D = !is2D;
  modeBtn.querySelector(".mode-label").textContent = is2D ? "2D" : "3D";
  if (is2D) viewer.scene.morphTo2D(1.4);
  else viewer.scene.morphTo3D(1.4);
  setTimeout(() => sceneApi.refreshLabels(), 1600);
});

$("#btn-reset").addEventListener("click", () => {
  if (is2D) clearMeasure();
  homeView(viewer);
});

const about = $("#about");
$("#btn-about").addEventListener("click", () => about.showModal());
$("#about-close").addEventListener("click", () => about.close());

/* -------------------------------------------------------------------- HUD */
const coordsEl = $("#readout-coords");
const elevEl = $("#readout-elev");
let lastReadout = 0;

viewer.screenSpaceEventHandler.setInputAction(
  throttle((movement) => {
    const picked = viewer.scene.pick(movement.endPosition);
    canvas.style.cursor = picked?.id?.aresHazard ? "pointer" : "";
    const ray = viewer.camera.getPickRay(movement.endPosition);
    const cartesian = ray && viewer.scene.globe.pick(ray, viewer.scene);
    if (!cartesian) {
      coordsEl.textContent = "—";
      elevEl.textContent = "—";
      return;
    }
    const carto = Cesium.Cartographic.fromCartesian(cartesian, MARS);
    const lat = Cesium.Math.toDegrees(carto.latitude);
    const lon = Cesium.Math.toDegrees(carto.longitude);
    coordsEl.textContent = formatCoord(lat, lon);
    const h = viewer.scene.globe.getHeight(carto);
    elevEl.textContent = formatElevation(h);
  }, 70),
  Cesium.ScreenSpaceEventType.MOUSE_MOVE
);

const scaleFill = $("#scalebar-fill");
const scaleLabel = $("#scalebar-label");

function updateScale() {
  let metersPerPixel = 0;
  if (is2D) {
    const f = viewer.camera.frustum;
    const width = (f.right - f.left) || 1;
    metersPerPixel = width / canvas.clientWidth;
  } else {
    const height = viewer.camera.positionCartographic.height;
    const fovy = viewer.camera.frustum.fovy || Cesium.Math.toRadians(60);
    metersPerPixel = (2 * height * Math.tan(fovy / 2)) / canvas.clientHeight;
  }
  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return;

  const targetPx = 96;
  const targetMeters = metersPerPixel * targetPx;
  const pow = Math.pow(10, Math.floor(Math.log10(targetMeters)));
  const steps = [1, 2, 5, 10];
  let chosen = pow;
  for (const s of steps) {
    if (pow * s <= targetMeters) chosen = pow * s;
  }
  const px = Math.min(180, Math.max(40, chosen / metersPerPixel));
  scaleFill.parentElement.style.width = `${px}px`;
  scaleFill.style.width = "100%";
  scaleLabel.textContent =
    chosen >= 1000 ? `${Math.round(chosen / 1000).toLocaleString()} km` : `${Math.round(chosen)} m`;
}

viewer.camera.changed.addEventListener(throttle(updateScale, 120));
viewer.scene.morphComplete?.addEventListener(() => setTimeout(updateScale, 250));

/* ---------------------------------------------------------------- click / measure */
const measureSource = new Cesium.CustomDataSource("measure");
viewer.dataSources.add(measureSource);
let measurePoints = [];

const measureBtn = $("#btn-measure");
const measurePanel = $("#measure-panel");

measureBtn.addEventListener("click", () => {
  state.measuring = !state.measuring;
  measureBtn.classList.toggle("active", state.measuring);
  measurePanel.hidden = !state.measuring;
  if (!state.measuring) clearMeasure();
});

$("#measure-close").addEventListener("click", () => {
  state.measuring = false;
  measureBtn.classList.remove("active");
  measurePanel.hidden = true;
});

$("#measure-clear").addEventListener("click", clearMeasure);

function clearMeasure() {
  measureSource.entities.removeAll();
  measurePoints = [];
  $("#measure-total").textContent = "0.0 km";
  $("#measure-list").innerHTML = "";
}

function addMeasurePoint(cartesian) {
  const carto = Cesium.Cartographic.fromCartesian(cartesian, MARS);
  const lat = Cesium.Math.toDegrees(carto.latitude);
  const lon = Cesium.Math.toDegrees(carto.longitude);
  const point = { lat, lon, cartesian };

  const index = measurePoints.length;
  measureSource.entities.add({
    position: cartesian,
    point: {
      pixelSize: 8,
      color: Cesium.Color.fromCssColorString("#e4613a"),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: String(index + 1),
      font: "600 11px Inter, sans-serif",
      fillColor: Cesium.Color.WHITE,
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString("#0d0a10").withAlpha(0.8),
      backgroundPadding: new Cesium.Cartesian2(5, 3),
      pixelOffset: new Cesium.Cartesian2(0, -18),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
  measurePoints.push(point);

  if (measurePoints.length > 1) {
    const prev = measurePoints[measurePoints.length - 2];
    measureSource.entities.add({
      polyline: {
        positions: [prev.cartesian, cartesian],
        width: 2,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString("#e4613a"),
          dashLength: 12,
        }),
        arcType: Cesium.ArcType.GEODESIC,
        clampToGround: true,
      },
    });
  }
  updateMeasureTotals();
}

function updateMeasureTotals() {
  let total = 0;
  const rows = [];
  for (let i = 1; i < measurePoints.length; i++) {
    const a = measurePoints[i - 1];
    const b = measurePoints[i];
    const g = new Cesium.EllipsoidGeodesic(
      Cesium.Cartographic.fromDegrees(a.lon, a.lat),
      Cesium.Cartographic.fromDegrees(b.lon, b.lat),
      MARS
    );
    const d = g.surfaceDistance;
    total += d;
    rows.push(
      `<li>${i} → ${i + 1}: ${(d / 1000).toFixed(1)} km <span style="color:#6f6675">(${g.startHeading.toFixed(1)}°)</span></li>`
    );
  }
  $("#measure-total").textContent =
    total >= 10000 ? `${(total / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km` : `${(total / 1000).toFixed(1)} km`;
  $("#measure-list").innerHTML = rows.join("");
}

viewer.screenSpaceEventHandler.setInputAction((click) => {
  if (window.__aresPick?.(click)) return;

  const ray = viewer.camera.getPickRay(click.position);
  const cartesian = ray && viewer.scene.globe.pick(ray, viewer.scene);
  if (!cartesian) return;

  window.__aresClick?.(click, cartesian);

  if (state.measuring) {
    addMeasurePoint(cartesian);
    return;
  }

  const picked = viewer.scene.pick(click.position);
  const pickedId = picked?.id?.id;
  if (pickedId && featuresById.has(pickedId)) {
    selectFeature(pickedId, false);
    return;
  }
  const nearest = nearestFeatureId(click.position);
  if (nearest) selectFeature(nearest, false);
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

function nearestFeatureId(position) {
  const time = viewer.clock.currentTime;
  let best = null;
  let bestDist = 26 * 26;
  const scan = (source) => {
    if (!source.show) return;
    for (const entity of source.entities.values) {
      if (!entity.show) continue;
      const pos = entity.position?.getValue(time);
      if (!pos) continue;
      const screen = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, pos);
      if (!screen) continue;
      const dx = screen.x - position.x;
      const dy = screen.y - position.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = entity.id;
      }
    }
  };
  scan(sceneApi.featureSources);
  scan(sceneApi.missionSource);
  return best;
}

/* ------------------------------------------------------------------- toast */
let toastTimer;
function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3600);
}

/* -------------------------------------------------------------------- boot */
async function boot() {
  const bootEl = $("#boot");
  const msg = $("#boot-msg");
  renderFeatureList();
  renderMissionList();
  setMissions(true);
  $("#nom-count").textContent = `${sceneApi.nomenclature.length.toLocaleString()} features`;
  updateScale();

 msg.textContent = "Loading Mars globe…";

// Start terrain loading without blocking globe initialization.
sceneApi.enableTerrain().then((ok) => {
  if (ok) {
    console.info("Mars terrain loaded");
  } else {
    console.warn("Terrain unavailable; continuing with flat globe");
  }
});

  const embedded = window.parent && window.parent !== window;
  if (!embedded) {
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(38, 6, 24000000),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
    });
  }

  viewer.scene.globe.tileLoadProgressEvent.addEventListener((remaining) => {
    if (remaining === 0) bootEl.classList.add("done");
  });
  setTimeout(() => bootEl.classList.add("done"), 12000);

  if (!embedded) setTimeout(() => homeView(viewer), 400);
  setTimeout(() => sceneApi.refreshLabels(), 2600);
 
  window.__mars = { viewer, sceneApi, state, selectFeature, Cesium };
  attachAresBridge({ viewer });
  updateScale();
  
}

boot();
