/** Hazard intersection and reroute comparison from EVA forecasts. */
import { forecastPath } from './evaSimulation.js';
import { riskLabel } from './terrainEngine.js';
import { scorePair } from './routeScoring.js';

export function hazardHitsRoute(points = [], hazard) {
  if (!hazard || !points.length) return [];
  const r = (hazard.r || 40) + 18;
  return points.filter((p) => Math.hypot((p.x || 0) - hazard.x, (p.y || 0) - hazard.y) < r);
}

export function metersAheadOfHazard(points = [], hazard, alongPx = 0) {
  if (!hazard || !points.length) return 0;
  let best = points[0];
  for (const p of points) {
    if (Math.hypot((p.x || 0) - hazard.x, (p.y || 0) - hazard.y) < Math.hypot((best.x || 0) - hazard.x, (best.y || 0) - hazard.y)) {
      best = p;
    }
  }
  return Math.max(40, Math.round(((best.d || 0) - alongPx) * 5.875));
}

export function compareReroute(previousPoints, proposedPoints, alongPx, opts = {}) {
  const current = forecastPath(previousPoints || [], alongPx, opts);
  const suggested = forecastPath(proposedPoints || [], 0, opts);
  const scores = scorePair(current, suggested);
  const extraM = Math.round((suggested.remainingM || 0) - (current.remainingM || 0));
  const extraMin = Math.round((suggested.remainingMin || 0) - (current.remainingMin || 0));
  const extraO2 = (suggested.oxygenKg || 0) - (current.oxygenKg || 0);
  const slopeNow = Math.abs(current.meanSlope || 0);
  const why = extraM >= 0
    ? `The alternate route is ${Math.abs(extraM)} m longer but avoids a ${slopeNow.toFixed(0)}° unstable slope and hazardous terrain. Predicted O₂ ${extraO2 >= 0 ? '+' : ''}${extraO2.toFixed(2)} kg · risk ${riskLabel(current.meanRisk)} → ${riskLabel(suggested.meanRisk)}.`
    : `The alternate corridor is ${Math.abs(extraM)} m shorter and drops predicted risk from ${riskLabel(current.meanRisk)} to ${riskLabel(suggested.meanRisk)}.`;
  return {
    current: {
      distanceKm: Number(((current.remainingM || 0) / 1000).toFixed(2)),
      o2Kg: Number((current.oxygenKg || 0).toFixed(2)),
      batteryPct: Number((current.batteryPct || 0).toFixed(1)),
      timeMin: Math.round(current.remainingMin || 0),
      risk: riskLabel(current.meanRisk),
      riskValue: current.meanRisk,
      climbM: Math.round(current.climbM || 0)
    },
    suggested: {
      distanceKm: Number(((suggested.remainingM || 0) / 1000).toFixed(2)),
      o2Kg: Number((suggested.oxygenKg || 0).toFixed(2)),
      batteryPct: Number((suggested.batteryPct || 0).toFixed(1)),
      timeMin: Math.round(suggested.remainingMin || 0),
      risk: riskLabel(suggested.meanRisk),
      riskValue: suggested.meanRisk,
      climbM: Math.round(suggested.climbM || 0)
    },
    extraM,
    extraMin,
    extraO2,
    why,
    winner: scores.winner,
    currentCost: scores.currentCost,
    altCost: scores.altCost
  };
}
