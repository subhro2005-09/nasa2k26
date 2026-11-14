/** Weighted route cost. Hazard avoidance outranks shortest path. */

export const ROUTE_WEIGHTS = {
  distance: 0.2,
  slope: 0.2,
  terrain: 0.15,
  hazard: 0.25,
  oxygen: 0.1,
  battery: 0.1
};

const nrm = (v, max) => (max > 0 ? Math.min(1.5, v / max) : 0);

export function scoreRoute(pred = {}, maxes = {}) {
  const cost =
    ROUTE_WEIGHTS.distance * nrm(pred.remainingM || 0, maxes.dist) +
    ROUTE_WEIGHTS.slope * nrm((pred.climbM || 0) + Math.abs(pred.meanSlope || 0) * 8, maxes.slope) +
    ROUTE_WEIGHTS.terrain * nrm(pred.meanDifficulty || 0, maxes.terrain || 1) +
    ROUTE_WEIGHTS.hazard * nrm(pred.meanRisk || 0, maxes.risk) +
    ROUTE_WEIGHTS.oxygen * nrm(pred.oxygenKg || 0, maxes.o2) +
    ROUTE_WEIGHTS.battery * nrm(pred.batteryPct || 0, maxes.batt);
  return cost;
}

export function maxesFrom(preds = []) {
  return {
    dist: Math.max(1, ...preds.map((p) => p.remainingM || 0)),
    slope: Math.max(1, ...preds.map((p) => (p.climbM || 0) + Math.abs(p.meanSlope || 0) * 8)),
    terrain: 1,
    risk: Math.max(0.05, ...preds.map((p) => p.meanRisk || 0)),
    o2: Math.max(0.05, ...preds.map((p) => p.oxygenKg || 0)),
    batt: Math.max(0.05, ...preds.map((p) => p.batteryPct || 0))
  };
}

export function rankRoutes(tagged = {}) {
  const ids = Object.keys(tagged);
  const preds = ids.map((id) => tagged[id]?.eva).filter(Boolean);
  if (!preds.length) return { ranked: [], recommended: null, maxes: maxesFrom([]) };
  const maxes = maxesFrom(preds);
  const ranked = ids.map((id) => {
    const eva = tagged[id].eva;
    const cost = scoreRoute(eva, maxes);
    return { id, cost, eva, metrics: tagged[id].metrics };
  }).sort((a, b) => a.cost - b.cost);
  return { ranked, recommended: ranked[0]?.id || null, maxes };
}

export function scorePair(current, proposed) {
  const maxes = maxesFrom([current, proposed]);
  const currentCost = scoreRoute(current, maxes);
  const altCost = scoreRoute(proposed, maxes);
  return { currentCost, altCost, winner: altCost < currentCost ? 'alt' : 'current', maxes };
}
