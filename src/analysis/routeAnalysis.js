import { SLOPE_LIMIT, safetyFromMetrics } from '../services/pathSolver.js';
import { pixelsToKm, pixelsToMeters } from '../services/coordinates.js';
import { cardinal, geoBearing } from '../navigation/heading.js';

const band = (slope, zone, reported) => {
  if (reported || slope > SLOPE_LIMIT) return 'hazard';
  if (zone || slope > 8) return 'caution';
  return 'safe';
};

/** Remaining path samples for the "terrain ahead" chart. */
export function terrainAhead(points, idx, lookPx = 160) {
  if (!points.length) return [];
  const start = Math.max(0, Math.min(idx, points.length - 1));
  const origin = points[start].d || 0;
  const out = [];
  for (let i = start; i < points.length; i++) {
    const dd = (points[i].d || 0) - origin;
    if (dd > lookPx) break;
    out.push({
      i,
      km: pixelsToKm(dd),
      m: pixelsToMeters(dd),
      elevation: points[i].elevation,
      slope: points[i].slope,
      zone: !!points[i].zone,
      reported: !!points[i].reported,
      isHazard: !!points[i].isHazard,
      band: band(points[i].slope, points[i].zone, points[i].reported)
    });
  }
  return out;
}

export function nextInstruction(points, idx, heading) {
  if (!points.length) return { text: 'Hold position at habitat', remainingKm: 0, etaMin: 0, caution: null, bearing: heading || 0 };
  const i = Math.max(0, Math.min(idx, points.length - 1));
  const here = points[i];
  const look = points[Math.min(points.length - 1, i + 8)];
  const end = points[points.length - 1];
  const remainingPx = Math.max(0, (end.d || 0) - (here.d || 0));
  const remainingKm = pixelsToKm(remainingPx);
  const bearing = look ? geoBearing(here, look) : heading || 0;
  let nextTurn = 0;
  for (let k = i + 4; k < Math.min(points.length, i + 40); k++) {
    const h = geoBearing(points[k - 1], points[k]);
    let delta = ((h - bearing + 540) % 360) - 180;
    if (Math.abs(delta) > 28) { nextTurn = pixelsToMeters((points[k].d || 0) - (here.d || 0)); break; }
  }
  const distM = Math.max(20, nextTurn || pixelsToMeters(Math.min(remainingPx, 80)));
  const caution = here.isHazard ? 'Hazard underfoot' : here.zone ? 'Mapped hazard zone' : here.slope > 12 ? 'Steep slope ahead' : look?.slope > SLOPE_LIMIT ? 'Terrain caution ahead' : null;
  const text = remainingPx < 12
    ? 'Arriving at destination'
    : `Continue ${Math.round(distM)} m ${cardinal(bearing)}`;
  return { text, remainingKm, remainingM: pixelsToMeters(remainingPx), bearing, caution };
}

export function classifyPoint(p) {
  return band(p?.slope || 0, p?.zone, p?.reported);
}

/** First hazard or steep section still ahead of the crew. */
export function upcomingHazard(points, idx, lookM = 480) {
  if (!points.length) return null;
  const i0 = Math.max(0, Math.min(idx, points.length - 1));
  const origin = points[i0].d || 0;
  let caution = null;
  for (let i = i0; i < points.length; i++) {
    const meters = pixelsToMeters((points[i].d || 0) - origin);
    if (meters > lookM) break;
    const p = points[i];
    const kind = p.hazardName
      || (p.reported ? 'Reported hazard' : p.slope > SLOPE_LIMIT ? `Slope ${p.slope.toFixed(0)}°` : p.zone ? 'Mapped hazard zone' : null);
    if (!kind) continue;
    const hot = !!(p.isHazard || p.reported || p.slope > SLOPE_LIMIT || p.band === 'hazard');
    const hit = {
      kind,
      meters: Math.max(20, Math.round(meters)),
      slope: p.slope || 0,
      band: hot ? 'hazard' : 'caution',
      name: p.hazardName || kind,
      lat: p.lat,
      lon: p.lon
    };
    if (hot) return hit;
    if (!caution) caution = hit;
  }
  return caution;
}

/** Suggest Safest (or abort) when the active route still hits ground that another mode avoids. */
export function alternateAdvice({ comparisons, routeMode, obstacle, planetary }) {
  if (!obstacle) return null;
  if (planetary && routeMode !== 'safe' && comparisons?.safe) {
    const cur = comparisons[routeMode]?.metrics;
    const safe = comparisons.safe.metrics;
    const extraKm = Math.max(0, (safe?.distanceKm || 0) - (cur?.distanceKm || 0));
    const extraMin = Math.round(Math.max(0, (safe?.estimatedTimeMin || 0) - (cur?.estimatedTimeMin || 0)));
    return {
      action: 'safe',
      label: 'Switch to Safest route',
      title: `${obstacle.name} in ${obstacle.meters} m`,
      text: extraKm > 0.05
        ? `Safest skirts this obstacle. Extra ${extraKm.toFixed(1)} km · +${extraMin} min.`
        : 'Safest skirts the mapped hazard with little extra distance.'
    };
  }
  if (routeMode !== 'safe' && comparisons?.safe) {
    const cur = comparisons[routeMode]?.metrics;
    const safe = comparisons.safe.metrics;
    const extraMin = Math.round(Math.max(0, (safe?.estimatedTimeMin || 0) - (cur?.estimatedTimeMin || 0)));
    return {
      action: 'safe',
      label: 'Take alternate (Safest)',
      title: `${obstacle.name} ahead · ${obstacle.meters} m`,
      text: extraMin
        ? `Safest avoids the worst slope and hazard cells. +${extraMin} min vs this path.`
        : 'Safest avoids the upcoming obstacle with a similar duration.'
    };
  }
  return {
    action: 'return',
    label: 'Return to base',
    title: `${obstacle.name} in ${obstacle.meters} m`,
    text: 'You are already on the safest solved path. Slow down, or abort to habitat if the slope keeps climbing.'
  };
}

export { safetyFromMetrics };

/** Explain why the A* path is not the geodesic, using live metrics. */
export function explainTerrainRoute(comparisons, routeMode) {
  const cur = comparisons?.[routeMode];
  const fastest = comparisons?.direct;
  const safest = comparisons?.safe;
  if (!cur || !fastest) return null;
  const ds = fastest.metrics?.maxSlope || 0;
  const extraM = Math.round(((safest?.metrics?.distanceKm || 0) - (fastest.metrics?.distanceKm || 0)) * 1000);
  const extraMin = Math.round((safest?.metrics?.estimatedTimeMin || 0) - (fastest.metrics?.estimatedTimeMin || 0));
  const extraO2 = (safest?.eva?.oxygenKg || 0) - (fastest?.eva?.oxygenKg || 0);
  const oldS = safetyFromMetrics(fastest.metrics);
  const newS = safetyFromMetrics(safest?.metrics || cur.metrics);
  const zones = fastest.metrics?.zoneSamples || 0;
  const o2bit = fastest?.eva ? ` Predicted O₂ ${fastest.eva.oxygenKg.toFixed(1)} kg on the fast line vs ${safest?.eva?.oxygenKg.toFixed(1) ?? '—'} kg on the safe line (${extraO2 >= 0 ? '+' : ''}${extraO2.toFixed(1)} kg).` : '';
  const text = `The direct path is not recommended because it crosses a ${ds.toFixed(0)}° slope${zones ? ' and a high-risk terrain zone' : ''}. ARES generated an alternative route that ${extraM >= 0 ? 'increases' : 'changes'} travel distance by ${Math.abs(extraM)} m while improving predicted route safety from ${oldS}% to ${newS}%.${o2bit}`;
  return { text, extraM, extraMin, oldSafety: oldS, newSafety: newS, maxSlopeDirect: ds, currentSafety: safetyFromMetrics(cur.metrics) };
}
