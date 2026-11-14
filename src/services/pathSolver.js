// Slope- and hazard-weighted A* traverse solver (EVA walking model).
// Every mode uses A*. Fastest is not a straight line — it is a cheaper cost field.
import { getElevationAtPoint, getSlopeAtPoint, HAZARD_ZONES } from '../data/terrainElevationData.js';
import { SCIENCE_POIS } from '../data/sciencePoisData.js';
import { pixelsToKm } from './coordinates.js';

export const SLOPE_LIMIT = 15; // deg, EVA rollover / slip threshold
export const GRID = { W: 800, H: 600, CELL: 8 };
const W = GRID.W, H = GRID.H, CELL = GRID.CELL, NX = W / CELL, NY = Math.ceil(H / CELL);
const EXEMPT = 28;
const grids = {};

export const MODE_WEIGHTS = {
  safe: {
    slopeScale: 3.2,
    slopeOver: 110,
    zone: 1800,
    reported: 7000,
    elev: 0.22,
    uphill: 3.4,
    contour: 1.8,
    blockedSlope: SLOPE_LIMIT,
    scienceAttract: 1,
    smooth: 'road'
  },
  direct: {
    slopeScale: 7.5,
    slopeOver: 14,
    zone: 90,
    reported: 520,
    elev: 0.05,
    uphill: 0.9,
    contour: 0.55,
    blockedSlope: 32,
    scienceAttract: 1,
    smooth: 'road'
  },
  science: {
    slopeScale: 4.4,
    slopeOver: 48,
    zone: 280,
    reported: 1100,
    elev: 0.12,
    uphill: 1.6,
    contour: 1.1,
    blockedSlope: 22,
    scienceAttract: 0.42,
    smooth: 'road'
  }
};

const inPoly = (poly, x, y) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};
export const inMappedZone = (id, x, y) => (HAZARD_ZONES[id] || []).some((z) => inPoly(z.points, x, y));
export const inReported = (hz, x, y, pad = 0) => (hz || []).some((h) => Math.hypot(x - h.x, y - h.y) < h.r + pad);

export function gridFor(id) {
  if (grids[id]) return grids[id];
  const slope = new Float32Array(NX * NY), zone = new Uint8Array(NX * NY), elev = new Float32Array(NX * NY);
  const gx = new Float32Array(NX * NY), gy = new Float32Array(NX * NY);
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX; i++) {
      const x = Math.min(W - 1, i * CELL + CELL / 2), y = Math.min(H - 1, j * CELL + CELL / 2);
      const n = j * NX + i;
      slope[n] = getSlopeAtPoint(id, x, y);
      elev[n] = getElevationAtPoint(id, x, y);
      zone[n] = inMappedZone(id, x, y) ? 1 : 0;
    }
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX; i++) {
      const n = j * NX + i;
      const il = Math.max(0, i - 1), ir = Math.min(NX - 1, i + 1);
      const ju = Math.max(0, j - 1), jd = Math.min(NY - 1, j + 1);
      gx[n] = (elev[j * NX + ir] - elev[j * NX + il]) / Math.max(1, ir - il);
      gy[n] = (elev[jd * NX + i] - elev[ju * NX + i]) / Math.max(1, jd - ju);
    }
  return (grids[id] = { slope, zone, elev, gx, gy });
}
const cellOf = (x, y) => [Math.min(NX - 1, Math.max(0, (x / CELL) | 0)), Math.min(NY - 1, Math.max(0, (y / CELL) | 0))];

class Heap {
  constructor() { this.a = []; }
  push(n, f) { const a = this.a; a.push([n, f]); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][1] <= a[i][1]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < a.length && a[l][1] < a[m][1]) m = l; if (r < a.length && a[r][1] < a[m][1]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top[0]; }
  get size() { return this.a.length; }
}

export function traversabilityAt(slope, zone, reported) {
  let t = 100 - slope * 3.6;
  if (zone) t -= 32;
  if (reported) t -= 48;
  if (slope > SLOPE_LIMIT) t -= 20;
  return Math.max(0, Math.min(100, Math.round(t)));
}

function densifyCanvas(A, B, step = 6) {
  const d = Math.hypot(B.x - A.x, B.y - A.y);
  const n = Math.max(2, Math.round(d / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t });
  }
  return out;
}

function astar(id, A, B, ctx) {
  const w = MODE_WEIGHTS[ctx.mode] || MODE_WEIGHTS.safe;
  const near = (x, y) => Math.hypot(x - A.x, y - A.y) < EXEMPT || Math.hypot(x - B.x, y - B.y) < EXEMPT;
  const found = searchGrid(id, A, B, ctx, w, near, false) || searchGrid(id, A, B, ctx, w, near, true);
  if (!found) return densifyCanvas(A, B);
  if (w.smooth === 'los') return losSmooth(id, found, ctx, near);
  return roadSmooth(found);
}

function searchGrid(id, A, B, ctx, w, near, relaxed) {
  const { slope, zone, elev, gx, gy } = gridFor(id);
  const [ai, aj] = cellOf(A.x, A.y), [bi, bj] = cellOf(B.x, B.y);
  const start = aj * NX + ai, goal = bj * NX + bi;
  const xy = (n) => ({ x: (n % NX) * CELL + CELL / 2, y: ((n / NX) | 0) * CELL + CELL / 2 });
  if (start === goal) return densifyCanvas(A, B);

  const g = new Float32Array(NX * NY).fill(Infinity);
  const from = new Int32Array(NX * NY).fill(-1);
  const closed = new Uint8Array(NX * NY);
  const open = new Heap();
  g[start] = 0;
  open.push(start, Math.hypot(ai - bi, aj - bj) * CELL);

  const cellCost = (n) => {
    const p = xy(n), s = slope[n];
    const reported = inReported(ctx.hazards, p.x, p.y, 16);
    if (!relaxed && !near(p.x, p.y)) {
      if (s > w.blockedSlope) return Infinity;
      if (reported && w.reported > 2000) return Infinity;
    }
    let c = 1 + (s / Math.max(1.2, w.slopeScale)) ** 2;
    if (s > SLOPE_LIMIT) c += (s - SLOPE_LIMIT) * (relaxed ? Math.max(4, w.slopeOver * 0.35) : w.slopeOver);
    if (zone[n] && !near(p.x, p.y)) c += relaxed ? Math.min(80, w.zone) : w.zone;
    if (reported && !near(p.x, p.y)) c += relaxed ? Math.min(220, w.reported) : w.reported;
    if (ctx.science && ctx.pois.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 40)) c *= w.scienceAttract;
    return c;
  };

  while (open.size) {
    const n = open.pop();
    if (closed[n]) continue;
    closed[n] = 1;
    if (n === goal) break;
    if (!isFinite(g[n])) continue;
    const ni = n % NX, nj = (n / NX) | 0;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ni + di, j = nj + dj;
        if (i < 0 || j < 0 || i >= NX || j >= NY) continue;
        const m = j * NX + i;
        if (closed[m]) continue;
        const cn = cellCost(n), cm = cellCost(m);
        if (!isFinite(cn) || !isFinite(cm)) continue;
        const step = di && dj ? 1.414 : 1;
        const dz = elev[m] - elev[n];
        const climb = (dz > 0 ? dz * w.elev * (1 + (w.uphill || 0)) : Math.abs(dz) * w.elev * 0.35);
        const glen = Math.hypot(gx[n], gy[n]) || 1e-6;
        const uphill = (gx[n] * di + gy[n] * dj) / (glen * step);
        const sAvg = (slope[n] + slope[m]) / 2;
        const contour = Math.abs(uphill) * sAvg * (w.contour || 0);
        const grade = Math.max(0, uphill) * sAvg * (w.uphill || 0);
        const cost = g[n] + step * CELL * ((cn + cm) / 2 + contour + grade) + climb;
        if (cost < g[m]) {
          g[m] = cost;
          from[m] = n;
          open.push(m, cost + Math.hypot(i - bi, j - bj) * CELL);
        }
      }
  }

  if (from[goal] === -1) return null;
  const cells = [];
  for (let n = goal; n !== -1; n = from[n]) {
    cells.push(xy(n));
    if (n === start) break;
  }
  cells.reverse();
  if (cells.length < 2) return densifyCanvas(A, B);
  return [{ x: A.x, y: A.y }, ...cells.slice(1, -1), { x: B.x, y: B.y }];
}

function losSmooth(id, pts, ctx, near) {
  const { slope: sl, zone: zn } = gridFor(id);
  const free = (p, q) => {
    const d = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    for (let s = 0; s <= d; s += 5) {
      const x = p.x + ((q.x - p.x) * s) / d, y = p.y + ((q.y - p.y) * s) / d;
      const [ci, cj] = cellOf(x, y), n = cj * NX + ci;
      if (sl[n] > 32 || inReported(ctx.hazards, x, y, 14) || (zn[n] && !near(x, y))) return false;
    }
    return true;
  };
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !free(pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  let idx = 0, max = 0;
  const a = pts[0], b = pts[pts.length - 1];
  const span = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const d = Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / span;
    if (d > max) { max = d; idx = i; }
  }
  if (max < eps) return [a, b];
  const left = rdp(pts.slice(0, idx + 1), eps);
  const right = rdp(pts.slice(idx), eps);
  return left.slice(0, -1).concat(right);
}

function chaikin(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
    out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Keep real terrain bends, drop 8-connected stair noise, then round into a road. */
function roadSmooth(pts) {
  const kept = rdp(pts, CELL * 0.85);
  return kept.length > 3 ? chaikin(kept) : kept;
}

function centroid(poly) {
  let x = 0, y = 0;
  poly.forEach((p) => { x += p.x; y += p.y; });
  return { x: x / poly.length, y: y / poly.length };
}

function chordHits(A, B, poly) {
  const d = Math.hypot(B.x - A.x, B.y - A.y) || 1;
  for (let s = 0; s <= d; s += 8) {
    const x = A.x + ((B.x - A.x) * s) / d, y = A.y + ((B.y - A.y) * s) / d;
    if (inPoly(poly, x, y)) return true;
  }
  return false;
}

function aroundZone(id, A, B, z) {
  const c = centroid(z.points);
  const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const pad = 42;
  const clamp = (p) => ({ ...p, x: Math.min(W - 12, Math.max(12, p.x)), y: Math.min(H - 12, Math.max(12, p.y)) });
  const left = clamp({ x: c.x + nx * pad, y: c.y + ny * pad, via: true, name: z.name });
  const right = clamp({ x: c.x - nx * pad, y: c.y - ny * pad, via: true, name: z.name });
  const lIn = inPoly(z.points, left.x, left.y);
  const rIn = inPoly(z.points, right.x, right.y);
  if (lIn && !rIn) return right;
  if (rIn && !lIn) return left;
  return getSlopeAtPoint(id, left.x, left.y) <= getSlopeAtPoint(id, right.x, right.y) ? left : right;
}

function withTerrainVias(id, wps) {
  const zones = HAZARD_ZONES[id] || [];
  if (!zones.length) return wps;
  const out = [];
  wps.forEach((a, k) => {
    out.push(a);
    const b = wps[k + 1];
    if (!b) return;
    zones.forEach((z) => {
      if (!chordHits(a, b, z.points)) return;
      const via = aroundZone(id, a, b, z);
      if (out.some((p) => Math.hypot(p.x - via.x, p.y - via.y) < 24)) return;
      out.push(via);
    });
  });
  return out;
}

function withScienceVias(wps, pois) {
  const out = [];
  wps.forEach((a, k) => {
    out.push(a);
    const b = wps[k + 1]; if (!b) return;
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    pois.map((p) => {
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
      return { p, t, off: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) };
    })
      .filter((c) => c.t > 0.1 && c.t < 0.9 && c.off < 110 && !wps.some((w) => Math.hypot(w.x - c.p.x, w.y - c.p.y) < 30))
      .sort((m, n) => m.t - n.t).slice(0, 2)
      .forEach((c) => out.push({ x: c.p.x, y: c.p.y, via: true, name: c.p.name }));
  });
  return out;
}

function bandOf(p) {
  if (p.reported || p.slope > SLOPE_LIMIT) return 'hazard';
  if (p.zone || p.slope > 8) return 'caution';
  return 'safe';
}

function markTurns(points) {
  if (points.length < 3) return points;
  const head = (a, b) => Math.atan2(b.x - a.x, a.y - b.y);
  for (let i = 1; i < points.length - 1; i++) {
    let dh = Math.abs(head(points[i], points[i + 1]) - head(points[i - 1], points[i]));
    if (dh > Math.PI) dh = 2 * Math.PI - dh;
    if (dh > (18 * Math.PI) / 180) points[i].turn = true;
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    a.heading = ((Math.atan2(b.x - a.x, a.y - b.y) * 180) / Math.PI + 360) % 360;
  }
  points[points.length - 1].heading = points[points.length - 2]?.heading || 0;
  return points;
}

/** @returns {{points: object[], stations: {index:number,wp:object}[]}} */
export function generateDensePath(waypoints, missionId, mode = 'safe', hazards = []) {
  if (!waypoints || waypoints.length < 2) return { points: [], stations: [] };
  const pois = SCIENCE_POIS.filter((p) => p.missionId === missionId).map((p) => ({ ...p.mapPos, name: p.name }));
  const ctx = { hazards, science: mode === 'science', pois, mode };
  let stops = withTerrainVias(missionId, waypoints);
  if (mode === 'science') stops = withScienceVias(stops, pois);
  let poly = [stops[0]]; const stationAt = [0];
  for (let k = 0; k < stops.length - 1; k++) {
    const leg = astar(missionId, stops[k], stops[k + 1], ctx);
    poly.push(...leg.slice(1)); stationAt.push(poly.length - 1);
  }
  const points = [], stations = []; let cum = 0;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k - 1], b = poly[k];
    if (a) {
      const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.round(d / 5));
      for (let s = 1; s <= n; s++) push(a.x + ((b.x - a.x) * s) / n, a.y + ((b.y - a.y) * s) / n, d / n);
    } else push(b.x, b.y, 0);
    const si = stationAt.indexOf(k);
    if (si !== -1 && stops[si] && !stops[si].via) stations.push({ index: points.length - 1, wp: stops[si] });
  }
  function push(x, y, step) {
    cum += step;
    const elevation = getElevationAtPoint(missionId, x, y), slope = getSlopeAtPoint(missionId, x, y);
    const nearStation = stops.some((w) => Math.hypot(w.x - x, w.y - y) < EXEMPT);
    const zone = !nearStation && inMappedZone(missionId, x, y);
    const reported = inReported(hazards, x, y, 10);
    const p = {
      x, y, elevation, slope,
      isHazard: slope > SLOPE_LIMIT || reported,
      zone, reported, d: cum,
      traversability: traversabilityAt(slope, zone, reported)
    };
    p.band = bandOf(p);
    points.push(p);
  }
  const total = cum || 1; points.forEach((p) => (p.t = p.d / total));
  return { points: markTurns(points), stations };
}

export function calculateRouteMetrics(pts) {
  if (!pts || pts.length < 2) return { distanceKm: 0, elevationGain: 0, elevationLoss: 0, peakElevation: 0, minElevation: 0, avgSlope: 0, maxSlope: 0, estimatedTimeMin: 0, estimatedTimeFormatted: '0h 00m', hazardSegmentsCount: 0, zoneSamples: 0, avgTraversability: 100 };
  let gain = 0, loss = 0, sum = 0, max = 0, haz = 0, zone = 0, peak = -Infinity, low = Infinity, trav = 0;
  pts.forEach((p, i) => {
    peak = Math.max(peak, p.elevation); low = Math.min(low, p.elevation); sum += p.slope; max = Math.max(max, p.slope);
    if (p.isHazard) haz++; if (p.zone) zone++;
    trav += p.traversability ?? traversabilityAt(p.slope, p.zone, p.reported);
    if (i) { const dz = p.elevation - pts[i - 1].elevation; dz > 0 ? (gain += dz) : (loss -= dz); }
  });
  const km = pixelsToKm(pts[pts.length - 1].d), avg = +(sum / pts.length).toFixed(1);
  const speed = Math.max(1.2, 3.2 - avg * 0.12), min = Math.round((km / speed) * 60);
  return {
    distanceKm: +km.toFixed(2), elevationGain: Math.round(gain), elevationLoss: Math.round(loss), peakElevation: Math.round(peak), minElevation: Math.round(low),
    avgSlope: avg, maxSlope: max, estimatedTimeMin: min, estimatedTimeFormatted: `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`,
    hazardSegmentsCount: haz, zoneSamples: zone, avgTraversability: Math.round(trav / pts.length)
  };
}

export function safetyFromMetrics(m) {
  if (!m) return 50;
  let s = 100;
  s -= Math.max(0, (m.maxSlope || 0) - 5) * 2.4;
  s -= (m.hazardSegmentsCount || 0) * 2.2;
  s -= Math.min(28, (m.zoneSamples || 0) * 0.045);
  if (m.avgTraversability != null) s -= Math.max(0, 80 - m.avgTraversability) * 0.25;
  return Math.max(8, Math.min(99, Math.round(s)));
}
