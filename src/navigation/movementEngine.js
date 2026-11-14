import { getElevationAtPoint, getSlopeAtPoint } from '../data/terrainElevationData.js';
import { METERS_PER_PIXEL } from '../services/coordinates.js';
import { inMappedZone, inReported, SLOPE_LIMIT } from '../services/pathSolver.js';
import { BASE_WALK_MPS, effectiveSpeed } from '../lib/terrainEngine.js';
import { geoBearing, headingBetween, offsetByHeading, turnToward, wrapDeg } from './heading.js';

export { BASE_WALK_MPS };
export const TURN_RATE_DPS = 70;

export function clampTactical(x, y) {
  return { x: Math.min(799, Math.max(0, x)), y: Math.min(599, Math.max(0, y)) };
}

export function sampleTerrain(missionId, x, y, hazards = []) {
  const elevation = getElevationAtPoint(missionId, x, y);
  const slope = getSlopeAtPoint(missionId, x, y);
  const zone = inMappedZone(missionId, x, y);
  const reported = inReported(hazards, x, y);
  const isHazard = slope > SLOPE_LIMIT || reported;
  return { elevation, slope, zone, reported, isHazard };
}

/** Terrain-dependent speed multiplier. Flat = 1, steep/hazard slows the crew. */
export function speedFactor(sample = {}, fatigue = 0, dustTau = 0.3) {
  return effectiveSpeed(sample, fatigue, dustTau) / BASE_WALK_MPS;
}

export function walkStep(astro, { forward = 0, turn = 0, dt = 0.1, missionId, hazards = [], fatigue = 0, dustTau = 0.3 } = {}) {
  const heading = wrapDeg(astro.heading + turn * TURN_RATE_DPS * dt);
  const here = sampleTerrain(missionId, astro.x, astro.y, hazards);
  const meters = effectiveSpeed(here, fatigue, dustTau) * forward * dt;
  const pixels = meters / METERS_PER_PIXEL;
  const stepped = offsetByHeading(astro.x, astro.y, heading, pixels);
  const next = clampTactical(stepped.x, stepped.y);
  const sampled = sampleTerrain(missionId, next.x, next.y, hazards);
  return {
    ...astro,
    x: next.x,
    y: next.y,
    heading,
    ...sampled,
    speedMps: Math.abs(meters / Math.max(dt, 1e-3)),
    movedM: Math.abs(meters)
  };
}

export function nearestIndex(points, x, y) {
  if (!points.length) return 0;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(points[i].x - x, points[i].y - y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

export function pointAtDistance(points, distPx) {
  if (!points.length) return null;
  const max = points[points.length - 1].d || 0;
  const d = Math.min(max, Math.max(0, distPx));
  let lo = 0, hi = points.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    points[m].d < d ? (lo = m + 1) : (hi = m);
  }
  const b = points[lo];
  const a = points[Math.max(0, lo - 1)];
  const span = (b.d - a.d) || 1;
  const t = (d - a.d) / span;
  const x = a.x + (b.x - a.x) * t;
  const y = a.y + (b.y - a.y) * t;
  const heading = geoBearing(a, b);
  const lat = a.lat != null && b.lat != null ? a.lat + (b.lat - a.lat) * t : b.lat;
  const lon = a.lon != null && b.lon != null ? a.lon + (b.lon - a.lon) * t : b.lon;
  const elevation = a.elevation != null && b.elevation != null ? a.elevation + (b.elevation - a.elevation) * t : b.elevation;
  return { ...b, x, y, lat, lon, elevation, heading, d, idx: lo, t: max ? d / max : 0 };
}

export function advanceAlongPath(points, alongPx, meters, missionId, hazards) {
  const deltaPx = meters / METERS_PER_PIXEL;
  const next = pointAtDistance(points, alongPx + deltaPx);
  if (!next) return null;
  const sampled = sampleTerrain(missionId, next.x, next.y, hazards);
  const look = points[Math.min(points.length - 1, next.idx + 1)];
  return {
    alongPx: next.d,
    progress: next.t,
    idx: next.idx,
    pose: {
      x: next.x,
      y: next.y,
      lat: next.lat,
      lon: next.lon,
      heading: look ? geoBearing(next, look) : next.heading,
      ...sampled,
      elevation: next.elevation ?? sampled.elevation,
      slope: next.slope ?? sampled.slope,
      speedMps: meters > 0 ? meters / 0.1 : 0
    }
  };
}

export function snapToPath(points, x, y) {
  const idx = nearestIndex(points, x, y);
  const p = points[idx];
  if (!p) return { idx: 0, alongPx: 0, progress: 0 };
  return { idx, alongPx: p.d || 0, progress: p.t || 0 };
}

export function steerAlongPath(currentHeading, points, idx, dt) {
  const look = points[Math.min(points.length - 1, idx + 3)];
  const here = points[idx];
  if (!look || !here) return currentHeading;
  return turnToward(currentHeading, headingBetween(here.x, here.y, look.x, look.y), TURN_RATE_DPS * dt);
}
