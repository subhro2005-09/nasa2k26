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

function nearestFeature(pt, cats) {
  let best = null, bestD = Infinity;
  for (const f of HIGHLIGHTS) {
    if (cats && !cats.has(f.category)) continue;
    const d = haversineKm(pt, f);
    const r = Math.max(40, (f.diameter || 80) * 0.45);
    if (d < r && d < bestD) { best = { ...f, distKm: d, radiusKm: r }; bestD = d; }
  }
  return best;
}

function featureCost(pt, mode) {
  const severe = nearestFeature(pt, SEVERE);
  const any = nearestFeature(pt);
  let c = 1;
  if (severe) {
    const t = severe.distKm / Math.max(1, severe.radiusKm);
    if (t < 0.55) c += mode === 'direct' ? 18 : 80;
    else if (t < 1) c += mode === 'direct' ? 4 : 22;
  }
  if (any && SCIENCE.has(any.category) && mode === 'science') c *= 0.45;
  return c;
}

/** Corridor A* so planetary routes bend around volcanoes/chasma instead of a geodesic. */
function corridorAStar(from, dest, mode) {
  const along = 32;
  const offs = mode === 'direct'
    ? [-0.4, -0.18, 0, 0.18, 0.4]
    : mode === 'science'
      ? [-0.85, -0.45, 0, 0.45, 0.85]
      : [-1.25, -0.85, -0.45, 0, 0.45, 0.85, 1.25];
  const total = Math.max(1, haversineKm(from, dest));
  const widthKm = mode === 'direct'
    ? Math.min(90, total * 0.07 + 14)
    : mode === 'science'
      ? Math.min(200, total * 0.16 + 28)
      : Math.min(320, total * 0.26 + 48);
  const brg = bearingDeg(from, dest);
  const cols = offs.length, rows = along + 1;
  const node = (i, j) => {
    const t = i / along;
    const base = interpolate(from, dest, t);
    return offsetKm(base, brg + 90, offs[j] * widthKm);
  };
  const g = new Float32Array(rows * cols).fill(Infinity);
  const fromIdx = new Int32Array(rows * cols).fill(-1);
  const start = 0 * cols + ((cols / 2) | 0);
  const goal = along * cols + ((cols / 2) | 0);
  g[start] = 0;
  const heap = [[start, 0]];
  const pop = () => {
    let b = 0;
    for (let i = 1; i < heap.length; i++) if (heap[i][1] < heap[b][1]) b = i;
    return heap.splice(b, 1)[0][0];
  };
  while (heap.length) {
    const n = pop();
    if (n === goal) break;
    const i = (n / cols) | 0, j = n % cols;
    const p = i === 0 && j === ((cols / 2) | 0) ? from : node(i, j);
    for (let di = 0; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const i2 = i + di, j2 = j + dj;
        if (i2 < 0 || i2 >= rows || j2 < 0 || j2 >= cols) continue;
        const m = i2 * cols + j2;
        const q = i2 === along && j2 === ((cols / 2) | 0) ? dest : node(i2, j2);
        const step = Math.max(0.2, haversineKm(p, q));
        const cost = g[n] + step * ((featureCost(p, mode) + featureCost(q, mode)) / 2);
        if (cost < g[m]) {
          g[m] = cost;
          fromIdx[m] = n;
          heap.push([m, cost + haversineKm(q, dest)]);
        }
      }
  }
  const cells = [];
  for (let n = goal; n !== -1; n = fromIdx[n]) {
    const i = (n / cols) | 0, j = n % cols;
    cells.push(i === 0 && j === ((cols / 2) | 0) ? from : i === along && j === ((cols / 2) | 0) ? dest : node(i, j));
    if (n === start) break;
  }
  cells.reverse();
  if (cells.length < 2) return [from, dest];
  const dense = [];
  for (let i = 0; i < cells.length - 1; i++) dense.push(...sampleGeodesic(cells[i], cells[i + 1], 8).slice(i ? 1 : 0));
  return dense;
}

function waypointsForMode(from, dest, mode) {
  return corridorAStar(from, dest, mode);
}

function elevationGuess(pt, startElev, dest) {
  const f = nearestFeature(pt);
  if (f?.category === 'volcano') return Math.round((startElev || -2000) + 8000 * Math.exp(-((f.distKm / f.radiusKm) ** 2)));
  if (f?.category === 'canyon') return Math.round((startElev || -2000) - 4000 * Math.exp(-((f.distKm / f.radiusKm) ** 2)));
  if (f?.category === 'polar') return Math.round((startElev || -2000) + 1200);
  const t = dest && haversineKm(pt, dest) < 1 ? 1 : 0;
  return Math.round((startElev || -2500) * (1 - t * 0.1));
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
export function generatePlanetRoute(from, dest, mode = 'safe', startElev = -2500) {
  const origin = { lat: from.lat, lon: from.lon, name: 'You' };
  const end = { lat: dest.lat, lon: dest.lon, name: dest.name };
  const raw = waypointsForMode(origin, end, mode);

  let cumM = 0;
  const points = raw.map((p, i) => {
    const elevation = elevationGuess(p, startElev, end);
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
  const roverKmh = metrics.distanceKm > EVA_RANGE_KM ? 35 : Math.max(1.2, 3.2 - (metrics.avgSlope || 0) * 0.12);
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
