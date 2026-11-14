import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

export const MARS = Cesium.Ellipsoid.MARS;
Cesium.Ellipsoid.default = MARS;

const TREK = "https://trek.nasa.gov/tiles/Mars/EQ";

const marsTilingScheme = new Cesium.GeographicTilingScheme({
  ellipsoid: MARS,
  numberOfLevelZeroTilesX: 2,
  numberOfLevelZeroTilesY: 1,
});

function trekProvider(layerId) {
  return new Cesium.UrlTemplateImageryProvider({
    url: `${TREK}/${layerId}/1.0.0/default/default028mm/{z}/{y}/{x}.jpg`,
    tilingScheme: marsTilingScheme,
    rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
    minimumLevel: 0,
    maximumLevel: 7,
    credit: new Cesium.Credit("NASA / JPL / USGS · Mars Trek"),
  });
}

export const BASEMAPS = [
  {
    id: "albedo",
    name: "Natural colour",
    detail: "Viking MDIM 2.1 mosaic · 232 m/px",
    layerId: "Mars_Viking_MDIM21_ClrMosaic_global_232m",
  },
  {
    id: "topo",
    name: "Colourised topography",
    detail: "MOLA shaded relief · 463 m/px",
    layerId: "Mars_MGS_MOLA_ClrShade_merge_global_463m",
  },
];

export function createViewer(container) {
  const viewer = new Cesium.Viewer(container, {
    baseLayer: false,
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    shadows: false,
    requestRenderMode: false,
    contextOptions: { webgl: { alpha: false, preserveDrawingBuffer: true } },
  });

  const scene = viewer.scene;
  if (!scene.globe) throw new Error('Globe unavailable');
  scene.globe.baseColor = Cesium.Color.fromCssColorString("#1b0f0c");
  scene.globe.showGroundAtmosphere = false;
  scene.globe.enableLighting = false;
  scene.globe.depthTestAgainstTerrain = false;
  scene.fog.enabled = false;
  scene.highDynamicRange = false;
  scene.backgroundColor = Cesium.Color.fromCssColorString("#07060a");
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
  if (scene.sun) scene.sun.show = false;
  if (scene.moon) scene.moon.show = false;
  if (scene.skyBox) { scene.skyBox.show = true; scene.skyBox.brightness = 0.6; }
  if (scene.postProcessStages?.fxaa) scene.postProcessStages.fxaa.enabled = true;
  scene.screenSpaceCameraController.minimumZoomDistance = 1200;
  scene.screenSpaceCameraController.maximumZoomDistance = 60000000;
  scene.screenSpaceCameraController.inertiaSpin = 0.82;
  scene.screenSpaceCameraController.inertiaZoom = 0.7;

  return viewer;
}

export function addBasemaps(viewer) {
  const layers = new Map();
  for (const bm of BASEMAPS) {
    const layer = viewer.imageryLayers.addImageryProvider(trekProvider(bm.layerId));
    layer.alpha = 1;
    layer.brightness = 1.18;
    layer.contrast = 1.12;
    layer.saturation = 1.18;
    layer.gamma = 1.02;
    layers.set(bm.id, layer);
  }
  return layers;
}

export async function addTerrain(viewer) {
  const provider = await Cesium.CesiumTerrainProvider.fromUrl(
    "https://marshub.s3.amazonaws.com/mars_v14/",
    { requestVertexNormals: true, ellipsoid: MARS }
  );
  viewer.scene.terrainProvider = provider;
  return provider;
}

export function buildGraticule(show) {
  const ds = new Cesium.CustomDataSource("graticule");
  const color = Cesium.Color.fromCssColorString("#ffffff").withAlpha(0.14);
  const subColor = Cesium.Color.fromCssColorString("#ffffff").withAlpha(0.1);

  for (let lon = -180; lon < 180; lon += 10) {
    const positions = [];
    for (let lat = -90; lat <= 90; lat += 2) positions.push(lon, lat);
    ds.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(positions),
        width: lon === 0 ? 1.2 : 0.7,
        material: lon === 0 ? subColor : color,
        arcType: Cesium.ArcType.GEODESIC,
      },
    });
  }
  for (let lat = -80; lat <= 80; lat += 10) {
    const positions = [];
    for (let lon = -180; lon <= 180; lon += 2) positions.push(lon, lat);
    ds.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(positions),
        width: lat === 0 ? 1.2 : 0.7,
        material: lat === 0 ? subColor : color,
        arcType: Cesium.ArcType.GEODESIC,
      },
    });
  }
  ds.show = show;
  return ds;
}

export function flyTo(viewer, lat, lon, radiusKm = 400, duration = 2.2) {
  const height = Math.max(2200, radiusKm * 1000 * 1.6);
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
    duration,
  });
}

export function homeView(viewer, instant = false) {
  const destination = Cesium.Cartesian3.fromDegrees(38, 6, 9400000);
  if (instant) {
    viewer.camera.setView({
      destination,
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
    });
  } else {
    viewer.camera.flyTo({
      destination,
      duration: 2.6,
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
    });
  }
}
