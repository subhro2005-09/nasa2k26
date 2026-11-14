import * as Cesium from "cesium";
import { CATEGORY_META } from "./data/highlights.js";
import { HIGHLIGHTS } from "./data/highlights.js";
import { MISSIONS } from "./data/missions.js";
import NOMENCLATURE from "./data/nomenclature.json";
import { makeIcon } from "./icons.js";
import { categorise } from "./mars.js";
import { addBasemaps, addTerrain, buildGraticule, createViewer, MARS } from "./globe.js";
import { createSpaceWeather } from "./spaceWeather.js";

const HIGHLIGHT_COLOR = "#e4613a";

export function setupScene(container) {
  const viewer = createViewer(container);
  const basemapLayers = addBasemaps(viewer);
  basemapLayers.get("topo").show = false;
  const spaceWeather = createSpaceWeather(viewer);

  const featureSources = new Cesium.CustomDataSource("features");
  const missionSource = new Cesium.CustomDataSource("missions");
  const nomenclatureSource = new Cesium.CustomDataSource("nomenclature");
  viewer.dataSources.add(featureSources);
  viewer.dataSources.add(missionSource);
  viewer.dataSources.add(nomenclatureSource);
  nomenclatureSource.show = false;

  const grid = buildGraticule(false);
  viewer.dataSources.add(grid);

  const featuresById = new Map();
  const highlights = [];

  // --- signature features -------------------------------------------------
  for (const feature of HIGHLIGHTS) {
    const meta = CATEGORY_META[feature.category] || CATEGORY_META.region;
    const id = `hl:${feature.name}`;
    const record = { ...feature, id, kind: "highlight" };
    featuresById.set(id, record);
    highlights.push(record);

    featureSources.entities.add({
      id,
      name: feature.name,
      position: Cesium.Cartesian3.fromDegrees(feature.lon, feature.lat, 0),
      billboard: {
        image: makeIcon(meta.icon, meta.color),
        width: 30,
        height: 30,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: 0,
        scaleByDistance: new Cesium.NearFarScalar(2e5, 1.25, 2.4e7, 0.6),
        translucencyByDistance: new Cesium.NearFarScalar(2.6e7, 1, 3.6e7, 0.35),
      },
      label: {
        text: feature.name,
        font: "600 12px Inter, system-ui, sans-serif",
        fillColor: Cesium.Color.fromCssColorString("#fbf6f1"),
        outlineColor: Cesium.Color.fromCssColorString("#100a0c"),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("#0d0a10").withAlpha(0.62),
        backgroundPadding: new Cesium.Cartesian2(7, 4),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -16),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3.2e7),
        show: false,
      },
      _meta: { category: feature.category, color: meta.color },
    });
  }

  // --- landing sites ------------------------------------------------------
  for (const mission of MISSIONS) {
    const id = `mission:${mission.name}`;
    featuresById.set(id, { ...mission, id, kind: "mission", category: "mission" });
    const active = mission.status === "active";
    missionSource.entities.add({
      id,
      name: mission.name,
      position: Cesium.Cartesian3.fromDegrees(mission.lon, mission.lat, 0),
      billboard: {
        image: makeIcon("mission", active ? "#7ee787" : "#9aa4b2"),
        width: 26,
        height: 26,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        scaleByDistance: new Cesium.NearFarScalar(2e5, 1.2, 2.4e7, 0.55),
      },
      label: {
        text: mission.name,
        font: "500 11px Inter, system-ui, sans-serif",
        fillColor: Cesium.Color.fromCssColorString(active ? "#c8f7d0" : "#e6e2ea"),
        outlineColor: Cesium.Color.fromCssColorString("#100a0c"),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("#0d0a10").withAlpha(0.6),
        backgroundPadding: new Cesium.Cartesian2(6, 3),
        verticalOrigin: Cesium.VerticalOrigin.TOP,
        pixelOffset: new Cesium.Cartesian2(0, 15),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1.4e7),
        show: false,
      },
    });
  }

  // --- full IAU gazetteer -------------------------------------------------
  const nomenclature = [];
  for (const n of NOMENCLATURE) {
    const category = categorise(n.type);
    const meta = CATEGORY_META[category] || CATEGORY_META.region;
    const id = `nom:${n.name}`;
    const record = { ...n, id, kind: "nomenclature", category };
    featuresById.set(id, record);
    nomenclature.push(record);

    nomenclatureSource.entities.add({
      id,
      name: n.name,
      position: Cesium.Cartesian3.fromDegrees(n.lon, n.lat, 0),
      point: {
        pixelSize: 3.5,
        color: Cesium.Color.fromCssColorString(meta.color).withAlpha(0.85),
        outlineColor: Cesium.Color.fromCssColorString("#0a080c").withAlpha(0.5),
        outlineWidth: 1,
        scaleByDistance: new Cesium.NearFarScalar(5e5, 1.8, 2.4e7, 0.7),
      },
      label: {
        text: n.name,
        font: "500 10.5px Inter, system-ui, sans-serif",
        fillColor: Cesium.Color.fromCssColorString("#efe9f2").withAlpha(0.92),
        outlineColor: Cesium.Color.fromCssColorString("#0d0910"),
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -9),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6e6),
        show: false,
      },
    });
  }

  // --- zoom dependent labels ---------------------------------------------
  const state = {
    labelsOn: true,
    categoryFilter: new Set(Object.keys(CATEGORY_META)),
  };

  const throttled = throttle(() => refreshLabels(), 220);

  function refreshLabels() {
    const h = cameraHeight(viewer);
    const scene = viewer.scene;
    const camPos = viewer.camera.positionWC;

    const highlightBudget = Math.min(30, Math.max(4, Math.round(1.5e8 / Math.max(h, 4e5))));
    const missionOn = missionSource.show;
    const missionBudget = Math.min(14, Math.max(0, Math.round(4e7 / Math.max(h, 4e5))));

    if (!state.labelsOn) {
      hideAll(featureSources);
      hideAll(missionSource);
      hideAll(nomenclatureSource);
      return;
    }

    const occupied = new Set();
    let placed = 0;
    const highlightEntities = [...featureSources.entities.values].sort(
      (a, b) => (featuresById.get(b.id)?.diameter || 0) - (featuresById.get(a.id)?.diameter || 0)
    );
    for (const entity of highlightEntities) {
      const record = featuresById.get(entity.id);
      const show =
        entity.show &&
        placed < highlightBudget &&
        isFacing(record, camPos) &&
        placeLabel(scene, entity, occupied, 128, 30);
      if (entity.label.show !== show) entity.label.show = show;
      if (show) placed += 1;
    }

    let missionPlaced = 0;
    for (const entity of missionSource.entities.values) {
      const record = featuresById.get(entity.id);
      const show =
        missionOn &&
        missionPlaced < missionBudget &&
        isFacing(record, camPos) &&
        placeLabel(scene, entity, occupied, 128, 30);
      if (entity.label.show !== show) entity.label.show = show;
      if (show) missionPlaced += 1;
    }

    if (!nomenclatureSource.show) return;

    const minDiameter = 20 + (h / 1e6) * 140;
    let far = 0;
    for (const record of nomenclature) {
      const entity = nomenclatureSource.entities.getById(record.id);
      if (!entity) continue;
      const visible =
        record.diameter >= minDiameter &&
        far < 70 &&
        isFacing(record, camPos) &&
        placeLabel(scene, entity, occupied, 92, 24);
      if (entity.label.show !== visible) entity.label.show = visible;
      if (visible) far += 1;
    }
  }

  viewer.camera.changed.addEventListener(throttled);
  viewer.scene.camera.percentageChanged = 0.008;

  return {
    viewer,
    basemapLayers,
    featureSources,
    missionSource,
    nomenclatureSource,
    grid,
    featuresById,
    highlights,
    nomenclature,
    refreshLabels,
    spaceWeather,
    setLabels(on) {
      state.labelsOn = on;
      refreshLabels();
    },
    setBasemap(id) {
      for (const [key, layer] of basemapLayers) layer.show = key === id;
    },
    async enableTerrain() {
      try {
        await addTerrain(viewer);
        return true;
      } catch (err) {
        console.warn("Terrain unavailable", err);
        return false;
      }
    },
  };
}

function cameraHeight(viewer) {
  const carto = viewer.camera.positionCartographic;
  return carto ? carto.height : 1e7;
}

function hideAll(source) {
  for (const entity of source.entities.values) {
    if (entity.label && entity.label.show) entity.label.show = false;
  }
}

function isFacing(record, camPos) {
  const pos = Cesium.Cartesian3.fromDegrees(record.lon, record.lat, 0);
  const normal = MARS.geodeticSurfaceNormal(pos);
  const toCam = Cesium.Cartesian3.subtract(camPos, pos, new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(toCam, toCam);
  return Cesium.Cartesian3.dot(normal, toCam) > 0.02;
}

function placeLabel(scene, entity, occupied, cellW = 100, cellH = 26) {
  const pos = entity.position?.getValue(scene.time);
  if (!pos) return false;
  const screen = Cesium.SceneTransforms.worldToWindowCoordinates(scene, pos);
  if (!screen) return false;
  const width = scene.canvas.clientWidth;
  const height = scene.canvas.clientHeight;
  if (screen.x < 0 || screen.y < 0 || screen.x > width || screen.y > height) return false;
  const cell = `${Math.floor(screen.x / cellW)}:${Math.floor(screen.y / cellH)}`;
  if (occupied.has(cell)) return false;
  occupied.add(cell);
  return true;
}

export function throttle(fn, ms) {
  let last = 0;
  let timer = null;
  return (...args) => {
    const now = performance.now();
    const wait = ms - (now - last);
    if (wait <= 0) {
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        last = performance.now();
        fn(...args);
      }, wait);
    }
  };
}

export { Cesium, MARS };
