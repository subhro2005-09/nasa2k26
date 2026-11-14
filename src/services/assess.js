// Go / No-Go engine: every check is derived from the live route, never hard-coded.
import { getElevationAtPoint } from '../data/terrainElevationData.js';
import { SLOPE_LIMIT, inReported } from './pathSolver.js';

// Line-of-sight to the habitat relay mast (30 m), tested against terrain between the two points.
// 20 m clearance absorbs micro-relief (ripples, dunes) the terrain model cannot resolve.
export function losCoverage(points, hab, missionId) {
  if (!points.length) return 100;
  const h0 = getElevationAtPoint(missionId, hab.x, hab.y) + 30;
  let ok = 0, n = 0;
  for (let i = 0; i < points.length; i += 3, n++) {
    const p = points[i], h1 = getElevationAtPoint(missionId, p.x, p.y) + 2;
    let blocked = false;
    for (let s = 1; s < 14 && !blocked; s++) {
      const t = s / 14, x = hab.x + (p.x - hab.x) * t, y = hab.y + (p.y - hab.y) * t;
      blocked = getElevationAtPoint(missionId, x, y) > h0 + (h1 - h0) * t + 20;
    }
    if (!blocked) ok++;
  }
  return Math.round((ok / n) * 100);
}

export function assessRoute({ metrics, points, hazards, mission, endPlss, pois }) {
  const checks = [];
  const add = (id, level, label, detail) => checks.push({ id, level, label, detail });
  const m = metrics;

  if (!points.length) return { state: 'hold', headline: 'Add checkpoints', checks: [], advisories: 0, failures: 1, los: 0, scienceCount: 0 };

  add('slope', m.maxSlope > SLOPE_LIMIT ? 'fail' : m.maxSlope > 12 ? 'warn' : 'pass', 'Terrain slope',
    m.maxSlope > SLOPE_LIMIT ? `Peaks at ${m.maxSlope.toFixed(1)}°, over the ${SLOPE_LIMIT}° limit (${m.hazardSegmentsCount} samples)` : `Peaks at ${m.maxSlope.toFixed(1)}° against a ${SLOPE_LIMIT}° limit`);

  const hit = hazards.filter((h) => points.some((p) => Math.hypot(p.x - h.x, p.y - h.y) < h.r));
  add('reported', hit.length ? 'fail' : 'pass', 'Reported hazards',
    hit.length ? `Route crosses ${hit.length} reported hazard${hit.length > 1 ? 's' : ''}${hit.some((h) => !h.validated) ? ' (awaiting validation)' : ''}` : hazards.length ? `Clear of ${hazards.length} reported hazard${hazards.length > 1 ? 's' : ''}` : 'No active reports');

  add('zones', m.zoneSamples ? 'warn' : 'pass', 'Mapped hazard zones', m.zoneSamples ? `Transits ~${Math.round((m.zoneSamples * 8 * 5.875) / 10) * 10} m of advisory terrain` : 'Avoids boulder fields, scarps and dune traps');

  const los = losCoverage(points, mission.habSite, mission.id);
  add('comms', los < 40 ? 'fail' : los < 85 ? 'warn' : 'pass', 'Habitat link', `${los}% of the route in line of sight of the relay mast`);

  const o2 = endPlss.o2RemainingPercent;
  const o2kg = endPlss.o2Kg != null ? `${endPlss.o2Kg.toFixed(1)} kg remaining` : `${o2}% left at return`;
  const o2Level = endPlss.oxygenStatus?.code === 'RED' || endPlss.isPointOfNoReturnExceeded || o2 < 10
    ? 'fail'
    : endPlss.oxygenStatus?.code === 'YELLOW' || o2 < 25 ? 'warn' : 'pass';
  add('o2', o2Level, 'Oxygen reserve', `${o2kg}. 20% destination reserve ${endPlss.contingencyMet ? 'met' : 'not met'}`);

  add('time', m.estimatedTimeMin > 480 ? 'fail' : m.estimatedTimeMin > 360 ? 'warn' : 'pass', 'EVA duration', `${m.estimatedTimeFormatted} against an 8h suit limit`);

  add('dust', mission.dustTau > 0.6 ? 'warn' : 'pass', 'Dust opacity', `τ = ${mission.dustTau}${mission.dustTau > 0.6 ? ', reduced visibility on the traverse' : ', clear sky'}`);

  const scienceCount = pois.filter((p) => points.some((q) => Math.hypot(q.x - p.mapPos.x, q.y - p.mapPos.y) < 34)).length;
  const failures = checks.filter((c) => c.level === 'fail').length, advisories = checks.filter((c) => c.level === 'warn').length;
  const state = failures ? 'hold' : advisories ? 'caution' : 'go';
  const headline = { go: 'Go', caution: 'Go with advisories', hold: 'Hold' }[state];
  return { state, headline, checks, advisories, failures, los, scienceCount };
}
