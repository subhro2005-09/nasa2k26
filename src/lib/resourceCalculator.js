/** Oxygen, battery, and fatigue from movement, slope work, and terrain. */
import { classifySurface, slopeSpeedFactor } from './terrainEngine.js';

export const CREW_MASS_KG = 180;
export const MARS_G = 3.721;
export const O2_CAPACITY_KG = 25.6;
export const BASE_O2_KG_H = 0.84;
export const BASE_BATT_PCT_H = 8;
export const O2_SAFETY_RESERVE = 0.2;
export const BATT_SAFETY_RESERVE = 0.15;
export const BATTERY_WH = 1800;
export const O2_LITERS_CAPACITY = 1200;

/** Extra mechanical work on Mars: W = m · g_mars · Δh. */
export function uphillWorkJ(elevationGainM = 0) {
  return CREW_MASS_KG * MARS_G * Math.max(0, elevationGainM);
}

export function exertionFromWork(dh = 0, dist = 1) {
  const perMeter = uphillWorkJ(dh) / Math.max(1, dist);
  return Math.min(0.55, perMeter / 400);
}

export function oxygenRateKgPerHour(sample = {}, fatigue = 0) {
  const surface = classifySurface(sample);
  const slopeF = slopeSpeedFactor(sample.slope || 0, sample.dh || 0);
  const terrainDifficultyFactor = 1 / Math.max(0.35, surface.factor);
  const slopeEffort = 1 / Math.max(0.32, slopeF);
  const activity = surface.activity * (1 + fatigue / 400);
  const extra = 1 + exertionFromWork(sample.dh || 0, sample.dist || 1);
  return BASE_O2_KG_H * activity * terrainDifficultyFactor * slopeEffort * extra;
}

export function batteryDrainPctPerHour(sample = {}, { moving = true, fatigue = 0, dustTau = 0.3 } = {}) {
  const surface = classifySurface(sample);
  const nav = moving ? 0.4 : 0.15;
  const comms = 0.3;
  const eclss = Math.max(0, dustTau - 0.25) * 8;
  const terrain = (1 - surface.factor) * 4.5;
  const slope = Math.abs(sample.slope || 0) * ((sample.dh || 0) > 0 ? 0.28 : 0.12);
  const fat = fatigue * 0.02;
  return Math.max(5.5, Math.min(18, BASE_BATT_PCT_H + nav + comms + eclss + terrain + slope + fat));
}

export function fatigueIncrease({ distM = 0, slopeDeg = 0, surface, dh = 0, moving = false } = {}) {
  if (!moving) return 0.00035;
  const s = surface || classifySurface({ slope: slopeDeg });
  const climb = Math.min(Math.max(0, dh), distM * 0.4);
  return distM * 0.0035 + Math.abs(slopeDeg) * distM * 0.00025 + s.difficulty * distM * 0.005 + climb * 0.12;
}

export function consumeStep({ tanks, fatigue = 0, dtHour = 0, distM = 0, sample = {}, moving = false, dustTau = 0.3 }) {
  const o2r = moving ? oxygenRateKgPerHour(sample, fatigue) : BASE_O2_KG_H * 0.42;
  const br = batteryDrainPctPerHour(sample, { moving, fatigue, dustTau });
  const o2Kg = Math.max(0, (tanks.o2Kg ?? kgFromLiters(tanks.o2RemainingLiters)) - o2r * dtHour);
  const batteryPct = Math.max(0, (tanks.batteryPct ?? pctFromWh(tanks.batteryRemainingWh)) - br * dtHour);
  const waterL = Math.max(0, (tanks.waterL ?? tanks.waterRemainingLiters ?? 4.8) - (moving ? 0.009 : 0.004) * dtHour * 60);
  const nextFatigue = Math.min(100, Math.max(0, fatigue + fatigueIncrease({
    distM,
    slopeDeg: sample.slope || 0,
    surface: classifySurface(sample),
    dh: sample.dh || 0,
    moving
  })));
  return {
    tanks: packTanks(o2Kg, batteryPct, waterL),
    fatigue: nextFatigue,
    o2Rate: o2r,
    battRate: br
  };
}

export function kgFromLiters(liters = O2_LITERS_CAPACITY) {
  return (liters / O2_LITERS_CAPACITY) * O2_CAPACITY_KG;
}

export function pctFromWh(wh = BATTERY_WH) {
  return (wh / BATTERY_WH) * 100;
}

export function packTanks(o2Kg, batteryPct, waterL) {
  return {
    o2Kg,
    batteryPct,
    waterL,
    o2RemainingLiters: (o2Kg / O2_CAPACITY_KG) * O2_LITERS_CAPACITY,
    batteryRemainingWh: (batteryPct / 100) * BATTERY_WH,
    waterRemainingLiters: waterL
  };
}

export function oxygenStatus(remainingKg, needKg) {
  const safe = needKg * (1 + O2_SAFETY_RESERVE);
  if (remainingKg <= needKg) return { code: 'RED', label: 'CRITICAL', tone: 'hold' };
  if (remainingKg < safe) return { code: 'YELLOW', label: 'CAUTION', tone: 'caution' };
  return { code: 'GREEN', label: 'SAFE', tone: 'go' };
}

export function batteryStatus(remainingPct, needPct) {
  const safe = needPct * (1 + BATT_SAFETY_RESERVE);
  if (remainingPct <= needPct) return { code: 'RED', label: 'CRITICAL', tone: 'hold' };
  if (remainingPct < safe) return { code: 'YELLOW', label: 'CAUTION', tone: 'caution' };
  return { code: 'GREEN', label: 'SAFE', tone: 'go' };
}

export function heartRateFrom({ slope = 0, fatigue = 0, speedMps = 0, moving = false } = {}) {
  const walk = moving ? 12 + (speedMps / 0.8) * 8 : 0;
  return Math.round(Math.min(165, 68 + Math.abs(slope) * 2.15 + fatigue * 0.32 + walk));
}
