import { generateDensePath, calculateRouteMetrics, gridFor, inReported, SLOPE_LIMIT, GRID } from '../services/pathSolver.js';
import { METERS_PER_PIXEL } from '../services/coordinates.js';
import { PLSS_SPECS } from '../services/plssCalculator.js';

const { W, H, CELL } = GRID;
const NX = W / CELL, NY = Math.ceil(H / CELL);

export function crewStop(p, name = 'You') {
  return { id: 'crew', name, x: p.x, y: p.y, type: 'crew' };
}

export function habStop(hab) {
  return { id: 'home', name: hab.name || 'Habitat', x: hab.x, y: hab.y, type: 'hab' };
}

export function generateReturnRoute(from, hab, missionId, hazards = []) {
  if (!from || !hab) return { points: [], stations: [], metrics: calculateRouteMetrics([]) };
  const path = generateDensePath([crewStop(from), habStop(hab)], missionId, 'safe', hazards);
  return { ...path, metrics: calculateRouteMetrics(path.points) };
}

export function generateNavRoute(from, dest, missionId, mode, hazards = []) {
  if (!from || !dest) return { points: [], stations: [], metrics: calculateRouteMetrics([]) };
  const path = generateDensePath([crewStop(from), { id: dest.id || 'dest', name: dest.name, x: dest.x, y: dest.y, type: dest.type || 'waypoint' }], missionId, mode, hazards);
  return { ...path, metrics: calculateRouteMetrics(path.points) };
}

export function compareNavRoutes(from, dest, missionId, hazards = []) {
  return {
    safe: generateNavRoute(from, dest, missionId, 'safe', hazards),
    direct: generateNavRoute(from, dest, missionId, 'direct', hazards),
    science: generateNavRoute(from, dest, missionId, 'science', hazards)
  };
}

/**
 * Walk-back budget converted into a reachable tactical polygon.
 * Uses the same slope/hazard grid as A*, not a circular radius.
 */
export function reachableEnvelope(missionId, start, budgetMeters, hazards = []) {
  if (!start || budgetMeters <= 80) return [];
  const { slope, zone } = gridFor(missionId);
  const budgetPx = budgetMeters / METERS_PER_PIXEL;
  const si = Math.min(NX - 1, Math.max(0, (start.x / CELL) | 0));
  const sj = Math.min(NY - 1, Math.max(0, (start.y / CELL) | 0));
  const startN = sj * NX + si;
  const g = new Float32Array(NX * NY).fill(Infinity);
  const heap = [[startN, 0]];
  g[startN] = 0;
  const costAt = (n) => {
    const x = (n % NX) * CELL + CELL / 2, y = ((n / NX) | 0) * CELL + CELL / 2;
    const s = slope[n];
    let c = 1 + (s / 7) ** 2 + (s > SLOPE_LIMIT ? (s - SLOPE_LIMIT) * 40 : 0);
    if (zone[n]) c += 80;
    if (inReported(hazards, x, y, 14)) c += 220;
    return c;
  };
  while (heap.length) {
    let best = 0;
    for (let i = 1; i < heap.length; i++) if (heap[i][1] < heap[best][1]) best = i;
    const [n, gn] = heap.splice(best, 1)[0];
    if (gn !== g[n] || gn > budgetPx) continue;
    const ni = n % NX, nj = (n / NX) | 0;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ni + di, j = nj + dj;
        if (i < 0 || j < 0 || i >= NX || j >= NY) continue;
        const m = j * NX + i, step = di && dj ? 1.414 : 1;
        const cost = gn + step * CELL * (costAt(n) + costAt(m)) / 2;
        if (cost < g[m] && cost <= budgetPx) { g[m] = cost; heap.push([m, cost]); }
      }
  }
  const pts = [];
  for (let n = 0; n < g.length; n++) {
    if (g[n] > budgetPx) continue;
    const i = n % NX, j = (n / NX) | 0;
    let edge = false;
    for (let dj = -1; dj <= 1 && !edge; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i2 = i + di, j2 = j + dj;
        if (i2 < 0 || j2 < 0 || i2 >= NX || j2 >= NY || g[j2 * NX + i2] > budgetPx) { edge = true; break; }
      }
    if (edge) pts.push({ x: i * CELL + CELL / 2, y: j * CELL + CELL / 2 });
  }
  return hull(pts);
}

function hull(points) {
  if (points.length < 3) return points;
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

export function evaluateSafeReturn(plss, returnMetrics) {
  const burn = plss.o2BurnRateLMin || PLSS_SPECS.nominalO2RateLMin;
  const need = (returnMetrics.estimatedTimeMin + PLSS_SPECS.contingencyMarginMin) * burn;
  const remainingMin = burn > 0 ? plss.o2RemainingLiters / burn : 0;
  const marginMin = remainingMin - returnMetrics.estimatedTimeMin;
  let status = 'nominal';
  if (plss.o2RemainingLiters < need || marginMin < 0) status = 'ponr';
  else if (marginMin < PLSS_SPECS.contingencyMarginMin + 20) status = 'low';
  const budgetMeters = Math.max(0, (remainingMin - PLSS_SPECS.contingencyMarginMin) / 60) * 1.6 * 1000;
  return {
    status,
    marginMin: Math.round(marginMin),
    needLiters: Math.round(need),
    returnKm: returnMetrics.distanceKm,
    returnMin: returnMetrics.estimatedTimeMin,
    budgetMeters
  };
}
