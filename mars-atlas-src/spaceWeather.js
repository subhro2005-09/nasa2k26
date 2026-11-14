import * as Cesium from "cesium";
import { MARS } from "./globe.js";

/**
 * Procedural cinematic lighting for the Mars globe.
 *
 * This is a visualization: thin CO2/dust scattering, a Sun-aligned glow, and
 * optional solar-wind particles. It is not a scientific solar observatory
 * product, and the Sun vector uses Cesium's Simon 1994 ephemeris as a
 * direction only (Mars is the central body; heliocentric geometry is not
 * modelled).
 *
 * Lifecycle
 * - Created once from setupScene after createViewer.
 * - Mutates existing Globe / SkyAtmosphere / Sun; does not replace imagery.
 * - Animates in scene.preUpdate (Cesium's render loop). No extra rAF.
 * - Pauses on document.visibilitychange. Destroys listeners and primitives
 *   via destroy().
 */

const MARS_RADIUS = MARS.maximumRadius;
const FLARE_DISTANCE = 1.8e7;
const WIND_DISTANCE = MARS_RADIUS + 7.2e6;
const BOW_OUTER = MARS_RADIUS + 4.2e5;
const BOW_INNER = MARS_RADIUS + 9e4;

const SKY_RAYLEIGH = new Cesium.Cartesian3(2.05e-5, 9.4e-6, 3.6e-6);
const SKY_MIE = new Cesium.Cartesian3(2.4e-5, 1.35e-5, 7.2e-6);
const GROUND_RAYLEIGH = new Cesium.Cartesian3(1.72e-5, 8.1e-6, 3.1e-6);
const GROUND_MIE = new Cesium.Cartesian3(2.1e-5, 1.2e-5, 6.4e-6);

const sunInertialScratch = new Cesium.Cartesian3();
const matrix3Scratch = new Cesium.Matrix3();
const sunDirScratch = new Cesium.Cartesian3();
const camScratch = new Cesium.Cartesian3();
const toSunScratch = new Cesium.Cartesian3();
const toMarsScratch = new Cesium.Cartesian3();
const flarePosScratch = new Cesium.Cartesian3();
const emitterPosScratch = new Cesium.Cartesian3();
const towardMarsScratch = new Cesium.Cartesian3();
const rotScratch = new Cesium.Matrix3();
const xAxisScratch = new Cesium.Cartesian3();
const yAxisScratch = new Cesium.Cartesian3();
const zAxisScratch = new Cesium.Cartesian3();
const radialScratch = new Cesium.Cartesian3();
const tangentScratch = new Cesium.Cartesian3();
const forceScratch = new Cesium.Cartesian3();
const ghostOffsetA = new Cesium.Cartesian2();
const ghostOffsetB = new Cesium.Cartesian2();
const modelMatrix = new Cesium.Matrix4();

function radialCanvas(size, stops) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function streakCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 280;
  canvas.height = 28;
  const ctx = canvas.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, canvas.width, 0);
  g.addColorStop(0, "rgba(255, 186, 110, 0)");
  g.addColorStop(0.46, "rgba(255, 236, 196, 0.95)");
  g.addColorStop(0.5, "rgba(255, 255, 255, 1)");
  g.addColorStop(0.54, "rgba(255, 210, 140, 0.9)");
  g.addColorStop(1, "rgba(255, 140, 70, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const fade = ctx.createLinearGradient(0, 0, 0, canvas.height);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(0.5, "rgba(0,0,0,0)");
  fade.addColorStop(1, "rgba(0,0,0,1)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function sunDirectionInFixed(time, result) {
  const inertial = Cesium.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(
    time,
    sunInertialScratch
  );
  let rotation = Cesium.Transforms.computeIcrfToCentralBodyFixedMatrix(time, matrix3Scratch);
  if (!Cesium.defined(rotation)) {
    rotation = Cesium.Transforms.computeTemeToPseudoFixedMatrix(time, matrix3Scratch);
  }
  Cesium.Matrix3.multiplyByVector(rotation, inertial, result);
  return Cesium.Cartesian3.normalize(result, result);
}

function rotationAlignZ(dir, result) {
  Cesium.Cartesian3.normalize(dir, zAxisScratch);
  Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_Y, zAxisScratch, xAxisScratch);
  if (Cesium.Cartesian3.magnitudeSquared(xAxisScratch) < 1e-12) {
    Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_X, zAxisScratch, xAxisScratch);
  }
  Cesium.Cartesian3.normalize(xAxisScratch, xAxisScratch);
  Cesium.Cartesian3.cross(zAxisScratch, xAxisScratch, yAxisScratch);
  Cesium.Matrix3.setColumn(result, 0, xAxisScratch, result);
  Cesium.Matrix3.setColumn(result, 1, yAxisScratch, result);
  Cesium.Matrix3.setColumn(result, 2, zAxisScratch, result);
  return result;
}

function configureMarsAtmosphere(sky, globe, sceneAtmosphere) {
  sky.perFragmentAtmosphere = true;
  sky.atmosphereLightIntensity = 36;
  sky.atmosphereRayleighCoefficient = SKY_RAYLEIGH;
  sky.atmosphereMieCoefficient = SKY_MIE;
  sky.atmosphereRayleighScaleHeight = 11100;
  sky.atmosphereMieScaleHeight = 2200;
  sky.atmosphereMieAnisotropy = 0.38;
  sky.hueShift = 0.28;
  sky.saturationShift = 0.18;
  sky.brightnessShift = 0.05;

  globe.atmosphereLightIntensity = 16;
  globe.atmosphereRayleighCoefficient = GROUND_RAYLEIGH;
  globe.atmosphereMieCoefficient = GROUND_MIE;
  globe.atmosphereRayleighScaleHeight = 11100;
  globe.atmosphereMieScaleHeight = 2200;
  globe.atmosphereMieAnisotropy = 0.34;
  globe.atmosphereHueShift = 0.28;
  globe.atmosphereSaturationShift = 0.16;
  globe.atmosphereBrightnessShift = 0.08;
  globe.lightingFadeOutDistance = 1.8e6;
  globe.lightingFadeInDistance = 3.2e7;
  globe.nightFadeOutDistance = 5e6;
  globe.nightFadeInDistance = 4e7;
  globe.lambertDiffuseMultiplier = 0.95;
  globe.vertexShadowDarkness = 0.48;
  globe.dynamicAtmosphereLighting = true;
  globe.dynamicAtmosphereLightingFromSun = true;

  if (!sceneAtmosphere) return;
  sceneAtmosphere.lightIntensity = 22;
  sceneAtmosphere.rayleighCoefficient = SKY_RAYLEIGH;
  sceneAtmosphere.mieCoefficient = SKY_MIE;
  sceneAtmosphere.rayleighScaleHeight = 11100;
  sceneAtmosphere.mieScaleHeight = 2200;
  sceneAtmosphere.mieAnisotropy = 0.38;
  sceneAtmosphere.hueShift = 0.28;
  sceneAtmosphere.saturationShift = 0.18;
  sceneAtmosphere.brightnessShift = 0.05;
}

export function createSpaceWeather(viewer) {
  const scene = viewer.scene;
  const globe = scene.globe;
  const canvas = scene.canvas;

  const previousSky = scene.skyAtmosphere;
  const sky = new Cesium.SkyAtmosphere(MARS);
  scene.skyAtmosphere = sky;
  if (previousSky && previousSky !== sky && !previousSky.isDestroyed()) {
    previousSky.destroy();
  }
  configureMarsAtmosphere(sky, globe, scene.atmosphere);

  const sun = scene.sun || new Cesium.Sun();
  scene.sun = sun;
  sun.glowFactor = 5.4;

  const sunLight = new Cesium.SunLight({
    color: Cesium.Color.fromCssColorString("#fff1d4"),
    intensity: 1.7,
  });
  const originalLight = scene.light;

  const glowImage = radialCanvas(128, [
    [0, "rgba(255,255,255,1)"],
    [0.12, "rgba(255,236,196,0.95)"],
    [0.38, "rgba(255,176,92,0.42)"],
    [1, "rgba(255,120,40,0)"],
  ]);
  const ghostImage = radialCanvas(64, [
    [0, "rgba(255,210,150,0.85)"],
    [0.45, "rgba(255,140,80,0.28)"],
    [1, "rgba(255,80,30,0)"],
  ]);
  const particleImage = radialCanvas(32, [
    [0, "rgba(255,236,210,0.95)"],
    [0.35, "rgba(255,186,120,0.55)"],
    [1, "rgba(255,120,60,0)"],
  ]);
  const anamorphicImage = streakCanvas();

  const flareSprites = scene.primitives.add(
    new Cesium.BillboardCollection({
      scene,
      blendOption: Cesium.BlendOption.TRANSLUCENT,
    })
  );
  const glowColor = Cesium.Color.fromCssColorString("#ffe7c2").withAlpha(0.55);
  const streakColor = Cesium.Color.fromCssColorString("#ffd7a0").withAlpha(0.42);
  const ghostColorA = Cesium.Color.fromCssColorString("#ffb070").withAlpha(0.22);
  const ghostColorB = Cesium.Color.fromCssColorString("#ff7a4a").withAlpha(0.14);

  const glowBillboard = flareSprites.add({
    position: Cesium.Cartesian3.ZERO,
    image: glowImage,
    width: 168,
    height: 168,
    color: glowColor,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
    id: { aresFx: "sun-glow" },
  });
  const streakBillboard = flareSprites.add({
    position: Cesium.Cartesian3.ZERO,
    image: anamorphicImage,
    width: 320,
    height: 18,
    color: streakColor,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
    id: { aresFx: "sun-streak" },
  });
  const ghostA = flareSprites.add({
    position: Cesium.Cartesian3.ZERO,
    image: ghostImage,
    width: 36,
    height: 36,
    color: ghostColorA,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
    id: { aresFx: "lens-ghost-a" },
  });
  const ghostB = flareSprites.add({
    position: Cesium.Cartesian3.ZERO,
    image: ghostImage,
    width: 22,
    height: 22,
    color: ghostColorB,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
    id: { aresFx: "lens-ghost-b" },
  });

  function applySolarWindForce(particle, dt) {
    const r = Cesium.Cartesian3.magnitude(particle.position);
    if (r > BOW_OUTER) return;
    Cesium.Cartesian3.normalize(particle.position, radialScratch);
    if (r < BOW_INNER) {
      const push = ((BOW_INNER - r) / BOW_INNER) * 2.6e6;
      Cesium.Cartesian3.multiplyByScalar(radialScratch, push, forceScratch);
      Cesium.Cartesian3.add(particle.velocity, forceScratch, particle.velocity);
      particle.endColor.alpha = 0;
      return;
    }
    const t = (BOW_OUTER - r) / (BOW_OUTER - BOW_INNER);
    Cesium.Cartesian3.cross(radialScratch, sunDirScratch, tangentScratch);
    if (Cesium.Cartesian3.magnitudeSquared(tangentScratch) < 1e-12) {
      Cesium.Cartesian3.cross(radialScratch, Cesium.Cartesian3.UNIT_Z, tangentScratch);
    }
    Cesium.Cartesian3.normalize(tangentScratch, tangentScratch);
    Cesium.Cartesian3.multiplyByScalar(tangentScratch, 7.2e5 * t * t * dt, forceScratch);
    Cesium.Cartesian3.add(particle.velocity, forceScratch, particle.velocity);
    Cesium.Cartesian3.multiplyByScalar(radialScratch, 3.1e5 * t * dt, forceScratch);
    Cesium.Cartesian3.add(particle.velocity, forceScratch, particle.velocity);
  }

  const particleSystem = scene.primitives.add(
    new Cesium.ParticleSystem({
      show: false,
      image: particleImage,
      startColor: Cesium.Color.fromCssColorString("#ffe6c4").withAlpha(0.55),
      endColor: Cesium.Color.fromCssColorString("#e4613a").withAlpha(0),
      startScale: 0.7,
      endScale: 2.4,
      minimumImageSize: new Cesium.Cartesian2(2, 2),
      maximumImageSize: new Cesium.Cartesian2(5, 5),
      sizeInMeters: false,
      emitter: new Cesium.ConeEmitter(Cesium.Math.toRadians(7.5)),
      emissionRate: 16,
      minimumParticleLife: 6.5,
      maximumParticleLife: 11,
      minimumSpeed: 7.4e5,
      maximumSpeed: 1.15e6,
      lifetime: Number.MAX_VALUE,
      loop: true,
      modelMatrix,
      updateCallback: applySolarWindForce,
    })
  );

  const state = {
    atmosphere: true,
    flare: true,
    wind: false,
    visible: typeof document === "undefined" ? true : !document.hidden,
    destroyed: false,
  };

  function is3D() {
    return scene.mode === Cesium.SceneMode.SCENE3D;
  }

  function applyAtmosphere() {
    const on = state.atmosphere && is3D();
    sky.show = on;
    globe.showGroundAtmosphere = on;
  }

  function applyFlare() {
    const on = state.flare && is3D();
    sun.show = on;
    globe.enableLighting = on;
    scene.light = on ? sunLight : originalLight;
    scene.sunBloom = on;
    flareSprites.show = on;
  }

  function applyWind() {
    const on = state.wind && state.visible && is3D();
    particleSystem.show = on;
    particleSystem.emissionRate = on ? 16 : 0;
  }

  function setAtmosphere(on) {
    state.atmosphere = !!on;
    applyAtmosphere();
  }

  function setSolarFlare(on) {
    state.flare = !!on;
    applyFlare();
  }

  function setSolarWind(on) {
    state.wind = !!on;
    applyWind();
  }

  function updateFlareSprites(time, intensity, occulted) {
    const camera = scene.camera;
    sunDirectionInFixed(time, sunDirScratch);
    Cesium.Cartesian3.multiplyByScalar(sunDirScratch, 1e10, toSunScratch);
    Cesium.Cartesian3.subtract(toSunScratch, camera.positionWC, toSunScratch);
    Cesium.Cartesian3.normalize(toSunScratch, toSunScratch);
    Cesium.Cartesian3.multiplyByScalar(toSunScratch, FLARE_DISTANCE, flarePosScratch);
    Cesium.Cartesian3.add(camera.positionWC, flarePosScratch, flarePosScratch);

    glowBillboard.position = flarePosScratch;
    streakBillboard.position = flarePosScratch;
    ghostA.position = flarePosScratch;
    ghostB.position = flarePosScratch;

    const inFront = Cesium.Cartesian3.dot(camera.directionWC, toSunScratch) > 0.02;
    const show = state.flare && is3D() && inFront && !occulted;
    const pulse = show ? intensity : 0;
    glowBillboard.show = show;
    streakBillboard.show = show;
    ghostA.show = show;
    ghostB.show = show;
    glowColor.alpha = 0.22 + 0.42 * pulse;
    streakColor.alpha = 0.12 + 0.38 * pulse;
    ghostColorA.alpha = 0.08 + 0.2 * pulse;
    ghostColorB.alpha = 0.05 + 0.14 * pulse;
    glowBillboard.color = glowColor;
    streakBillboard.color = streakColor;
    ghostA.color = ghostColorA;
    ghostB.color = ghostColorB;
    glowBillboard.scale = 0.92 + 0.28 * pulse;
    streakBillboard.scale = 0.85 + 0.45 * pulse;

    const win = Cesium.SceneTransforms.worldToWindowCoordinates(scene, flarePosScratch);
    if (!win) {
      ghostA.show = false;
      ghostB.show = false;
      return;
    }
    const dx = canvas.clientWidth * 0.5 - win.x;
    const dy = canvas.clientHeight * 0.5 - win.y;
    streakBillboard.rotation = Math.atan2(dy, dx);
    ghostOffsetA.x = dx * 0.34;
    ghostOffsetA.y = dy * 0.34;
    ghostOffsetB.x = dx * 0.62;
    ghostOffsetB.y = dy * 0.62;
    ghostA.pixelOffset = ghostOffsetA;
    ghostB.pixelOffset = ghostOffsetB;
  }

  function updateWindEmitter() {
    Cesium.Cartesian3.multiplyByScalar(sunDirScratch, WIND_DISTANCE, emitterPosScratch);
    Cesium.Cartesian3.negate(sunDirScratch, towardMarsScratch);
    rotationAlignZ(towardMarsScratch, rotScratch);
    Cesium.Matrix4.fromRotationTranslation(rotScratch, emitterPosScratch, modelMatrix);
    particleSystem.modelMatrix = modelMatrix;
  }

  function sunOccluded(time) {
    const camera = scene.camera;
    Cesium.Cartesian3.clone(camera.positionWC, camScratch);
    const camDist = Cesium.Cartesian3.magnitude(camScratch);
    if (camDist <= MARS_RADIUS) return true;
    Cesium.Cartesian3.negate(camScratch, toMarsScratch);
    Cesium.Cartesian3.normalize(toMarsScratch, toMarsScratch);
    Cesium.Cartesian3.multiplyByScalar(sunDirScratch, 1e10, toSunScratch);
    Cesium.Cartesian3.subtract(toSunScratch, camScratch, toSunScratch);
    Cesium.Cartesian3.normalize(toSunScratch, toSunScratch);
    const cos = Cesium.Math.clamp(Cesium.Cartesian3.dot(toMarsScratch, toSunScratch), -1, 1);
    const angle = Math.acos(cos);
    const limb = Math.asin(Cesium.Math.clamp(MARS_RADIUS / camDist, 0, 1));
    return angle < limb * 0.94;
  }

  function onPreUpdate(_scene, time) {
    if (state.destroyed || !state.visible) return;
    if (!is3D()) {
      applyAtmosphere();
      applyFlare();
      applyWind();
      return;
    }

    const t = performance.now() * 0.001;
    const shimmer = Math.sin(t * 0.62);
    const haze = Math.sin(t * 0.91 + 1.15);
    const slow = 0.5 + 0.5 * Math.sin(t * 0.33);
    const flarePulse = Math.max(0, Math.sin(t * 0.117)) ** 18;
    const intensity = Cesium.Math.clamp(0.42 + 0.46 * slow + 0.55 * flarePulse, 0.2, 1.2);

    if (state.atmosphere) {
      sky.hueShift = 0.28 + 0.02 * shimmer;
      sky.brightnessShift = 0.02 + 0.045 * haze;
      sky.saturationShift = 0.12 + 0.03 * shimmer;
      sky.atmosphereMieAnisotropy = 0.38 + 0.06 * haze;
      globe.atmosphereHueShift = sky.hueShift;
      globe.atmosphereBrightnessShift = 0.04 + 0.04 * haze;
      globe.atmosphereMieAnisotropy = 0.34 + 0.05 * shimmer;
      if (scene.atmosphere) {
        scene.atmosphere.hueShift = sky.hueShift;
        scene.atmosphere.brightnessShift = sky.brightnessShift;
        scene.atmosphere.saturationShift = sky.saturationShift;
      }
    }

    if (state.flare) {
      sun.glowFactor = 6.2 + 3.4 * intensity;
      sunLight.intensity = 1.55 + 0.85 * intensity;
      scene.sunBloom = true;
    } else {
      scene.sunBloom = false;
    }

    sunDirectionInFixed(time, sunDirScratch);
    updateFlareSprites(time, intensity, sunOccluded(time));
    if (state.wind) updateWindEmitter();
  }

  function onVisibility() {
    state.visible = !document.hidden;
    applyWind();
  }

  function onMorph() {
    applyAtmosphere();
    applyFlare();
    applyWind();
  }

  scene.preUpdate.addEventListener(onPreUpdate);
  scene.morphComplete.addEventListener(onMorph);
  document.addEventListener("visibilitychange", onVisibility);

  applyAtmosphere();
  applyFlare();
  applyWind();

  return {
    setAtmosphere,
    setSolarFlare,
    setSolarWind,
    getState() {
      return { ...state };
    },
    destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      scene.preUpdate.removeEventListener(onPreUpdate);
      scene.morphComplete.removeEventListener(onMorph);
      document.removeEventListener("visibilitychange", onVisibility);
      if (scene.primitives.contains(particleSystem)) scene.primitives.remove(particleSystem);
      if (scene.primitives.contains(flareSprites)) scene.primitives.remove(flareSprites);
      if (!particleSystem.isDestroyed()) particleSystem.destroy();
      if (!flareSprites.isDestroyed()) flareSprites.destroy();
      globe.enableLighting = false;
      globe.showGroundAtmosphere = false;
      if (sky) sky.show = false;
      if (sun) sun.show = false;
      scene.light = originalLight;
    },
  };
}
