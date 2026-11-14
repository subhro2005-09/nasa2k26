import { HIGHLIGHTS } from '../../mars-atlas-src/data/highlights.js';
import { METERS_PER_PIXEL } from '../services/coordinates.js';
import { calculateRouteMetrics } from '../services/pathSolver.js';

const MARS_R_KM = 3389.5;
export const EVA_RANGE_KM = 12;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function haversineKm(a, b) {
  const p1 = rad(a.lat), p2 = rad(b.lat);
  const dφ = p2 - p1, dλ = rad(b.lon - a.lon);
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dλ / 2) ** 2;
  return 2 * MARS_R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(a, b) {
  const φ1 = rad(a.lat), φ2 = rad(b.lat), λ = rad(b.lon - a.lon);
  const y = Math.sin(λ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function offsetKm(pt, bearing, km) {
  const δ = km / MARS_R_KM, θ = rad(bearing);
  const φ1 = rad(pt.lat), λ1 = rad(pt.lon);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: deg(φ2), lon: ((deg(λ2) + 540) % 360) - 180 };
}

export function interpolate(a, b, f) {
  const d = haversineKm(a, b) / MARS_R_KM;
  if (d < 1e-6) return { lat: a.lat, lon: a.lon };
  const φ1 = rad(a.lat), λ1 = rad(a.lon), φ2 = rad(b.lat), λ2 = rad(b.lon);
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return { lat: deg(Math.atan2(z, Math.sqrt(x * x + y * y))), lon: deg(Math.atan2(y, x)) };
}

function sampleGeodesic(from, to, n = 96) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(interpolate(from, to, i / n));
  return out;
}

const SEVERE = new Set(['volcano', 'canyon', 'chaos']);
const SCIENCE = new Set(['canyon', 'chaos', 'crater', 'basin']);

function nearbyFeatures(pt, maxKm = 250) {
  const out = [];
  for (const f of HIGHLIGHTS) {
    const d = haversineKm(pt, f);
    const r = Math.max(25, (f.diameter || 60) * 0.45);
    if (d <= Math.max(r, maxKm)) out.push({ ...f, distKm: d, radiusKm: r });
  }
  return out;
}

function nearestFeature(pt, cats) {
  let best = null, bestD = Infinity;
  for (const f of HIGHLIGHTS) {
    if (cats && !cats.has(f.category)) continue;
    const d = haversineKm(pt, f);
    const r = Math.max(30, (f.diameter || 70) * 0.45);
    if (d < r && d < bestD) { best = { ...f, distKm: d, radiusKm: r }; bestD = d; }
  }
  return best;
}

/** Deterministic planetary relief so terrain is not flat outside named HIGHLIGHTS. */
function proceduralReliefM(pt) {
  const a = Math.sin(rad(pt.lat) * 14) * Math.cos(rad(pt.lon) * 14);
  const b = Math.sin(rad(pt.lat + pt.lon) * 29);
  return a * 320 + b * 140;
}

function elevationGuess(pt, startElev, dest) {
  const base = (startElev || -2500) + proceduralReliefM(pt);
  const f = nearestFeature(pt);
  if (f?.category === 'volcano') return Math.round(base + 8000 * Math.exp(-((f.distKm / f.radiusKm) ** 2)));
  if (f?.category === 'canyon') return Math.round(base - 4000 * Math.exp(-((f.distKm / f.radiusKm) ** 2)));
  if (f?.category === 'crater' || f?.category === 'basin') {
    const rim = Math.exp(-(((f.distKm - f.radiusKm * 0.85) / (f.radiusKm * 0.25)) ** 2));
    return Math.round(base - 1200 * Math.exp(-((f.distKm / f.radiusKm) ** 2)) + 650 * rim);
  }
  if (f?.category === 'polar') return Math.round(base + 1200);
  const t = dest && haversineKm(pt, dest) < 1 ? 1 : 0;
  return Math.round(base * (1 - t * 0.05));
}

function featureCost(pt, mode, hazards = [], scienceTargets = [], elevAtPt = null, prevElev = null, stepKm = 1) {
  const severe = nearestFeature(pt, SEVERE);
  const any = nearestFeature(pt);
  let cost = 1.0;

  // Slope / relief penalty: Safest strongly avoids grade changes; Fastest prioritizes distance.
  if (elevAtPt != null && prevElev != null && stepKm > 0.05) {
    const grade = Math.abs(elevAtPt - prevElev) / (stepKm * 1000);
    if (mode === 'safe') cost += (grade * 18) ** 2;
    else if (mode === 'science') cost += (grade * 8) ** 2;
    else cost += (grade * 3) ** 2;
  }

  // Severe geological hazards (volcanoes, canyons, chaos terrain)
  if (severe) {
    const t = severe.distKm / Math.max(1, severe.radiusKm);
    if (mode === 'direct') {
      if (t < 0.45) cost += 12;
      else if (t < 0.85) cost += 2.5;
    } else if (mode === 'safe') {
      if (t < 1.25) cost += 140 * Math.max(0.15, 1.25 - t);
    } else {
      if (t < 0.5) cost += 90;
      else if (t < 1.1) cost *= 0.65;
    }
  }

  // Moderate feature roughness (craters, basins, ridges)
  if (any && !severe) {
    if (mode === 'safe') cost += 1.8;
    else if (mode === 'science' && SCIENCE.has(any.category)) cost *= 0.45;
  }

  // Active / reported hazards
  for (const h of hazards) {
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lon)) continue;
    const d = haversineKm(pt, h);
    const radius = Math.max(0.25, (h.radiusKm || 0.5) * (mode === 'safe' ? 1.6 : 1.0));
    const clearance = d / radius;
    if (clearance < 1) {
      const severity = Math.max(1, Math.min(5, Number(h.severity) || 3));
      cost += (mode === 'direct' ? 18 : 120) * severity * (1 - clearance) ** 2;
    }
  }

  // Science attraction field: curves Science routes toward targets and mapped science features
  if (mode === 'science') {
    let bestPull = 0;
    for (const target of scienceTargets) {
      if (!Number.isFinite(target.lat) || !Number.isFinite(target.lon)) continue;
      const d = haversineKm(pt, target);
      const influenceKm = Math.max(12, target.influenceKm || 60);
      if (d < influenceKm) bestPull = Math.max(bestPull, 0.65 * (1 - d / influenceKm));
    }
    for (const feat of nearbyFeatures(pt, 180)) {
      if (!SCIENCE.has(feat.category)) continue;
      const influenceKm = Math.max(40, feat.radiusKm * 2.2);
      if (feat.distKm < influenceKm) {
        bestPull = Math.max(bestPull, 0.58 * (1 - feat.distKm / influenceKm));
      }
    }
    cost *= 1 - bestPull;
  }

  return Math.max(0.12, cost);
}

/** Corridor A* so planetary routes diverge across Fastest, Safest, and Science modes. */
function corridorAStar(from, dest, mode, hazards = [], scienceTargets = [], startElev = -2500) {
  const total = Math.max(1, haversineKm(from, dest));
  const along = Math.min(64, Math.max(24, Math.round(total / 8)));

  const offs = mode === 'direct'
    ? [-0.3, -0.15, 0, 0.15, 0.3]
    : mode === 'science'
      ? [-1.0, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1.0]
      : [-1.2, -0.9, -0.6, -0.35, -0.15, 0, 0.15, 0.35, 0.6, 0.9, 1.2];

  const widthKm = mode === 'direct'
    ? Math.min(60, total * 0.05 + 6)
    : mode === 'science'
      ? Math.min(240, total * 0.22 + 18)
      : Math.min(300, total * 0.25 + 22);

  const brg = bearingDeg(from, dest);
  const cols = offs.length, rows = along + 1;
  const midCol = (cols / 2) | 0;

  const node = (i, j) => {
    if (i === 0 && j === midCol) return from;
    if (i === along && j === midCol) return dest;
    const t = i / along;
    const base = interpolate(from, dest, t);
    const taper = Math.sin(Math.PI * t);
    return offsetKm(base, brg + 90, offs[j] * widthKm * Math.max(0.25, taper));
  };

  const coords = Array.from({ length: rows * cols }, (_, idx) => {
    const i = (idx / cols) | 0, j = idx % cols;
    const pt = node(i, j);
    return { ...pt, elev: elevationGuess(pt, startElev, dest) };
  });

  const g = new Float64Array(rows * cols).fill(Infinity);
  const fromIdx = new Int32Array(rows * cols).fill(-1);
  const start = 0 * cols + midCol;
  const goal = along * cols + midCol;
  g[start] = 0;

  const hScale = mode === 'science' ? 0.12 : 1.0;
  const open = [[start, haversineKm(from, dest) * hScale]];

  while (open.length) {
    let best = 0;
    for (let k = 1; k < open.length; k++) if (open[k][1] < open[best][1]) best = k;
    const [n, fScore] = open.splice(best, 1)[0];
    if (n === goal) break;
    if (fScore - haversineKm(coords[n], dest) * hScale > g[n] + 1e-6) continue;

    const i = (n / cols) | 0, j = n % cols;
    const p = coords[n];

    for (let dj = -2; dj <= 2; dj++) {
      const i2 = i + 1, j2 = j + dj;
      if (i2 >= rows || j2 < 0 || j2 >= cols) continue;
      const m = i2 * cols + j2;
      const q = coords[m];
      const step = Math.max(0.1, haversineKm(p, q));
      const cP = featureCost(p, mode, hazards, scienceTargets, p.elev, null, step);
      const cQ = featureCost(q, mode, hazards, scienceTargets, q.elev, p.elev, step);
      const tentative = g[n] + step * ((cP + cQ) / 2);

      if (tentative < g[m]) {
        g[m] = tentative;
        fromIdx[m] = n;
        open.push([m, tentative + haversineKm(q, dest) * hScale]);
      }
    }
  }

  const cells = [];
  for (let n = goal; n !== -1; n = fromIdx[n]) {
    cells.push(coords[n]);
    if (n === start) break;
  }
  cells.reverse();
  if (cells.length < 2) return [from, dest];

  const dense = [];
  for (let i = 0; i < cells.length - 1; i++) {
    dense.push(...sampleGeodesic(cells[i], cells[i + 1], 6).slice(i ? 1 : 0));
  }
  return dense;
}

function waypointsForMode(from, dest, mode, hazards, scienceTargets, startElev) {
  return corridorAStar(from, dest, mode, hazards, scienceTargets, startElev);
}

function slopeGuess(a, b) {
  const km = Math.max(0.2, haversineKm(a, b));
  const ang = Math.atan(Math.abs((b.elevation - a.elevation) / (km * 1000))) * (180 / Math.PI);
  return Math.min(45, Math.round(ang * 10) / 10);
}

function bandOf(p) {
  if (p.isHazard) return 'hazard';
  if (p.zone) return 'caution';
  return 'safe';
}

/** Terrain-weighted corridor A* on the Mars ellipsoid. */
export function generatePlanetRoute(from, dest, mode = 'safe', startElev = -2500, options = {}) {
  const origin = { lat: from.lat, lon: from.lon, name: 'You' };
  const end = { lat: dest.lat, lon: dest.lon, name: dest.name };
  const hazards = Array.isArray(options.hazards) ? options.hazards : [];
  const scienceTargets = Array.isArray(options.scienceTargets) ? options.scienceTargets : [];
  const raw = waypointsForMode(origin, end, mode, hazards, scienceTargets, startElev);

  let cumM = 0;
  const points = raw.map((p, i) => {
    const elevation = p.elev ?? elevationGuess(p, startElev, end);
    const prev = raw[i - 1];
    const stepKm = prev ? haversineKm(prev, p) : 0;
    cumM += stepKm * 1000;
    const hit = nearestFeature(p, SEVERE);
    const zone = !!nearestFeature(p);
    const isHazard = !!(hit && (hit.category === 'canyon' || hit.category === 'volcano' || hit.distKm < hit.radiusKm * 0.55));
    return {
      ...p,
      elevation,
      slope: 0,
      isHazard,
      zone,
      reported: false,
      band: isHazard ? 'hazard' : zone ? 'caution' : 'safe',
      hazardName: hit?.name,
      hazardCategory: hit?.category,
      d: cumM / METERS_PER_PIXEL,
      x: 20 + (cumM / Math.max(1, haversineKm(origin, end) * 1000)) * 760,
      y: 300,
      planetary: true
    };
  });
  const total = points[points.length - 1]?.d || 1;
  points.forEach((p) => { p.t = p.d / total; p.band = bandOf(p); });
  for (let i = 1; i < points.length; i++) points[i].slope = slopeGuess(points[i - 1], points[i]);

  const km = haversineKm(origin, end);
  const metrics = calculateRouteMetrics(points);
  metrics.distanceKm = +((points[points.length - 1]?.d || 0) * METERS_PER_PIXEL / 1000).toFixed(1);
  if (!metrics.distanceKm) metrics.distanceKm = +km.toFixed(1);

  const previewSpeedKmh = { safe: 28, direct: 35, science: 24 }[mode] || 28;
  const slopePenalty = Math.max(0, Math.min(0.35, (metrics.avgSlope || 0) * 0.012));
  const roverKmh = metrics.distanceKm > EVA_RANGE_KM
    ? previewSpeedKmh * (1 - slopePenalty)
    : Math.max(1.2, 3.2 - (metrics.avgSlope || 0) * 0.12);
  const min = Math.round((metrics.distanceKm / roverKmh) * 60);
  metrics.estimatedTimeMin = min;
  metrics.estimatedTimeFormatted = min > 5999 ? `${Math.round(min / 1440)} sols` : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;

  const stations = [
    { index: 0, wp: { id: 'you', name: 'You', type: 'crew', ...origin } },
    { index: points.length - 1, wp: { id: dest.id || 'dest', name: dest.name, type: dest.type || 'place', ...end } }
  ];

  return { points, stations, metrics, planetary: true, alerts: planetAlerts({ points, metrics, dest, km: metrics.distanceKm }) };
}

export function hazardCopy(p) {
  const hot = !!(p.isHazard || p.band === 'hazard' || p.hazard);
  const kind = p.hazardCategory === 'canyon' ? 'canyon wall / chasma'
    : p.hazardCategory === 'volcano' ? 'volcanic escarpment'
    : p.hazardCategory === 'chaos' ? 'collapsed chaos terrain'
    : 'mapped hazard terrain';
  return {
    name: p.hazardName,
    category: p.hazardCategory,
    lat: p.lat,
    lon: p.lon,
    level: hot ? 'fail' : 'warn',
    label: hot ? `Hazard: ${p.hazardName}` : `Caution: ${p.hazardName}`,
    detail: hot
      ? `Route transits ${kind} at ${p.hazardName}. Slow the traverse, check slope, and keep a return margin.`
      : `${p.hazardName} lies near this traverse. Expect rough terrain.`
  };
}

export function hazardsAlong(points = []) {
  const seen = new Set();
  const out = [];
  for (const p of points) {
    if (!p.hazardName || seen.has(p.hazardName)) continue;
    if (!p.isHazard && p.band === 'safe' && !p.hazard) continue;
    seen.add(p.hazardName);
    out.push(hazardCopy(p));
  }
  return out;
}

export function planetAlerts({ points, metrics, dest, km }) {
  const alerts = [];
  if (km > EVA_RANGE_KM) alerts.push({ id: 'range', level: 'fail', label: 'Beyond EVA range', detail: `${km.toFixed(0)} km from your position. Suited walking is limited to ~${EVA_RANGE_KM} km. This is an orbital traverse preview, not a walk.` });
  const hits = [];
  const seen = new Set();
  points.forEach((p) => {
    if (p.hazardName && !seen.has(p.hazardName)) { seen.add(p.hazardName); hits.push(p); }
  });
  hits.filter((p) => p.isHazard).forEach((p) => {
    const kind = p.hazardCategory === 'canyon' ? 'canyon wall / chasma' : p.hazardCategory === 'volcano' ? 'volcanic escarpment' : 'collapsed chaos terrain';
    alerts.push({ id: `hz-${p.hazardName}`, level: 'fail', label: `Hazard: ${p.hazardName}`, detail: `Route transits ${kind}. Safest mode skirts the edifice; Fastest does not.` });
  });
  hits.filter((p) => !p.isHazard && p.zone).forEach((p) => {
    alerts.push({ id: `zn-${p.hazardName}`, level: 'warn', label: `Caution: ${p.hazardName}`, detail: 'Mapped planetary feature near the traverse. Expect rough terrain.' });
  });
  if (metrics.maxSlope > 15) alerts.push({ id: 'slope', level: 'fail', label: 'Slope exceeds 15°', detail: `Peak modelled slope ${metrics.maxSlope.toFixed(1)}° on this path.` });
  else if (metrics.maxSlope > 8) alerts.push({ id: 'slope', level: 'warn', label: 'Steep sections ahead', detail: `Peak modelled slope ${metrics.maxSlope.toFixed(1)}°.` });
  if (km > 500) alerts.push({ id: 'comms', level: 'warn', label: 'Habitat link will drop', detail: `A walk of this length leaves line-of-sight to ${dest?.name || 'the target'} only from orbit or a relay.` });
  if (!alerts.length) alerts.push({ id: 'ok', level: 'pass', label: 'Route clear of mapped mega-hazards', detail: 'Local EVA checks still apply once you are on site.' });
  return alerts;
}

export function isPlanetaryDest(from, dest) {
  if (!from || !dest || dest.lat == null || dest.lon == null) return false;
  return haversineKm(from, dest) > 8;
}
