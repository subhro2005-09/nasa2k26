/** Terrain classification, slope geometry, and EVA walking speed. */

export const BASE_WALK_MPS = 0.8;
export const SLOPE_AVOID_DEG = 20;

export const SURFACE = {
  flat: { id: 'flat', label: 'Flat terrain', factor: 1.00, activity: 1.0, difficulty: 0.05 },
  regolith: { id: 'regolith', label: 'Smooth regolith', factor: 0.90, activity: 1.05, difficulty: 0.18 },
  rocky: { id: 'rocky', label: 'Rocky terrain', factor: 0.70, activity: 1.2, difficulty: 0.45 },
  sand: { id: 'sand', label: 'Loose sand', factor: 0.60, activity: 1.25, difficulty: 0.62 },
  difficult: { id: 'difficult', label: 'Very difficult', factor: 0.40, activity: 1.6, difficulty: 0.88 }
};

export function classifySurface({ slope = 0, zone = false, reported = false, isHazard = false } = {}) {
  const a = Math.abs(slope);
  if (reported || isHazard) return SURFACE.difficult;
  if (zone && a > 10) return SURFACE.difficult;
  if (zone) return SURFACE.rocky;
  if (a > 14) return SURFACE.sand;
  if (a > 6) return SURFACE.regolith;
  return SURFACE.flat;
}

/** slope = Δh / horizontal distance; slopeAngle = atan(slope). */
export function slopeFromDelta(dh, dist) {
  const horiz = Math.max(0.01, Math.sqrt(Math.max(0, dist * dist - dh * dh)));
  const slope = dh / horiz;
  const slopeAngle = Math.atan(slope);
  return { slope, slopeAngle, slopeDeg: (slopeAngle * 180) / Math.PI, horiz };
}

export function slopeSpeedFactor(slopeDeg = 0, dh = 0) {
  const a = Math.abs(slopeDeg);
  let f = 1;
  if (a > 20) f = 0.32;
  else if (a > 15) f = 0.45;
  else if (a > 10) f = 0.65;
  else if (a > 5) f = 0.85;
  if (dh > 0.05) f *= 0.88;
  else if (dh < -0.05 && a > 8) f *= 0.9;
  return f;
}

export function fatigueSpeedFactor(fatigue = 0) {
  return Math.max(0.55, 1 - fatigue / 200);
}

export function environmentFactor(dustTau = 0.3) {
  return Math.max(0.82, 1 - Math.max(0, dustTau - 0.3) * 0.22);
}

export function roughness({ slope = 0, zone = false, reported = false, isHazard = false } = {}) {
  return Math.min(1, (zone ? 0.35 : 0) + (reported || isHazard ? 0.45 : 0) + Math.abs(slope) / 40);
}

export function effectiveSpeed(sample = {}, fatigue = 0, dustTau = 0.3) {
  const surface = classifySurface(sample);
  const slopeF = slopeSpeedFactor(sample.slope || 0, sample.dh || 0);
  const speed = BASE_WALK_MPS * surface.factor * slopeF * fatigueSpeedFactor(fatigue) * environmentFactor(dustTau);
  return Math.max(0.18, Math.min(BASE_WALK_MPS * 1.05, speed));
}

export function sampleRisk(sample = {}) {
  let r = 0;
  if (sample.reported || sample.isHazard) r += 0.85;
  if (sample.zone) r += 0.35;
  const a = Math.abs(sample.slope || 0);
  if (a > 20) r += 0.9;
  else if (a > 15) r += 0.55;
  else if (a > 10) r += 0.25;
  else if (a > 5) r += 0.08;
  return Math.min(1, r);
}

export function riskLabel(r = 0) {
  if (r >= 0.55) return 'HIGH';
  if (r >= 0.28) return 'MODERATE';
  return 'LOW';
}
