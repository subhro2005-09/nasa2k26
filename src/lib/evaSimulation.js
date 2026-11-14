/** Live EVA clock: move along the polyline, then consume from that movement. */
import { classifySurface, effectiveSpeed, riskLabel, sampleRisk } from './terrainEngine.js';
import { alongMeters, buildTimeline, formatHMS, splitAtAlong } from './routeEngine.js';
import {
  BASE_O2_KG_H,
  BATTERY_WH,
  O2_CAPACITY_KG,
  O2_LITERS_CAPACITY,
  O2_SAFETY_RESERVE,
  BATT_SAFETY_RESERVE,
  batteryDrainPctPerHour,
  batteryStatus,
  fatigueIncrease,
  heartRateFrom,
  kgFromLiters,
  oxygenRateKgPerHour,
  oxygenStatus,
  packTanks
} from './resourceCalculator.js';

export function forecastSegments(segs = [], { fatigue = 0, dustTau = 0.3 } = {}) {
  let timeS = 0;
  let o2Kg = 0;
  let battPct = 0;
  let f = fatigue;
  let climb = 0;
  let riskAcc = 0;
  let diffAcc = 0;
  let slopeAcc = 0;
  for (const g of segs) {
    const sample = { ...g.sample, dist: g.dist, dh: g.dh };
    const surface = classifySurface(sample);
    const speed = effectiveSpeed(sample, f, dustTau);
    const dtS = g.dist / Math.max(0.12, speed);
    const dtH = dtS / 3600;
    o2Kg += oxygenRateKgPerHour(sample, f) * dtH;
    battPct += batteryDrainPctPerHour(sample, { moving: true, fatigue: f, dustTau }) * dtH;
    timeS += dtS;
    climb += Math.max(0, g.dh || 0);
    f = Math.min(100, f + fatigueIncrease({
      distM: g.dist,
      slopeDeg: sample.slope,
      surface,
      dh: g.dh || 0,
      moving: true
    }));
    riskAcc += sampleRisk(sample) * g.dist;
    diffAcc += surface.difficulty * g.dist;
    slopeAcc += Math.abs(sample.slope || 0) * g.dist;
  }
  const remainingM = segs.reduce((sum, g) => sum + g.dist, 0);
  return {
    remainingM,
    remainingS: timeS,
    remainingMin: timeS / 60,
    oxygenKg: o2Kg,
    batteryPct: battPct,
    climbM: climb,
    fatigueEnd: f,
    avgOxygenRate: timeS > 0 ? o2Kg / (timeS / 3600) : BASE_O2_KG_H,
    avgBatteryRate: timeS > 0 ? battPct / (timeS / 3600) : 8,
    meanRisk: remainingM > 0 ? riskAcc / remainingM : 0,
    meanDifficulty: remainingM > 0 ? diffAcc / remainingM : 0,
    meanSlope: remainingM > 0 ? slopeAcc / remainingM : 0,
    meanSpeed: remainingM > 0 && timeS > 0 ? remainingM / timeS : 0.8
  };
}

export function forecastPath(points = [], alongPx = 0, opts = {}) {
  const split = splitAtAlong(points, alongPx);
  const rem = forecastSegments(split.remaining, opts);
  return { ...split, ...rem, timeline: buildTimeline(points) };
}

export function snapshotFromTanks(tanks, { o2Rate = BASE_O2_KG_H, battRate = 8, forecast } = {}) {
  const o2Kg = tanks.o2Kg ?? kgFromLiters(tanks.o2RemainingLiters);
  const batteryPct = tanks.batteryPct ?? ((tanks.batteryRemainingWh || BATTERY_WH) / BATTERY_WH) * 100;
  const waterL = tanks.waterL ?? tanks.waterRemainingLiters ?? 4.8;
  const o2Pct = (o2Kg / O2_CAPACITY_KG) * 100;
  const need = forecast?.oxygenKg || 0;
  const battNeed = forecast?.batteryPct || 0;
  const o2Stat = oxygenStatus(o2Kg, need);
  const battStat = batteryStatus(batteryPct, battNeed);
  const enduranceMin = o2Rate > 0 ? (o2Kg / o2Rate) * 60 : 500;
  return {
    o2Kg,
    o2RemainingPercent: Math.max(0, Math.round(o2Pct)),
    o2RemainingLiters: Math.round((o2Kg / O2_CAPACITY_KG) * O2_LITERS_CAPACITY * 10) / 10,
    o2BurnRateKgH: Number(o2Rate.toFixed(3)),
    o2BurnRateLMin: Number((((o2Rate / O2_CAPACITY_KG) * O2_LITERS_CAPACITY) / 60).toFixed(3)),
    o2EnduranceFormatted: formatHMS(enduranceMin * 60),
    enduranceMin: Math.round(enduranceMin),
    batteryRemainingPercent: Math.max(0, Math.round(batteryPct)),
    batteryPct,
    batteryRemainingWh: Math.round((batteryPct / 100) * BATTERY_WH),
    batteryDrainPctH: Number(battRate.toFixed(2)),
    coolingWaterPercent: Math.max(0, Math.round((waterL / 4.8) * 100)),
    waterRemainingLiters: waterL,
    oxygenStatus: o2Stat,
    batteryStatus: battStat,
    isPointOfNoReturnExceeded: o2Stat.code === 'RED',
    contingencyMet: o2Stat.code !== 'RED',
    tanks: packTanks(o2Kg, batteryPct, waterL)
  };
}

export function composeEva({
  tanks,
  fatigue = 0,
  forecast,
  elapsedMin = 0,
  traveledM = 0,
  sample = {},
  following = false,
  moving = false,
  speedMps = 0,
  dustTau = 0.3,
  followSpeed = 1
}) {
  const surface = classifySurface(sample);
  const speed = effectiveSpeed(sample, fatigue, dustTau);
  const o2Rate = moving ? oxygenRateKgPerHour(sample, fatigue) : BASE_O2_KG_H * 0.42;
  const battRate = batteryDrainPctPerHour(sample, { moving, fatigue, dustTau });
  const plss = snapshotFromTanks(tanks, { o2Rate, battRate, forecast });
  const need = forecast?.oxygenKg || 0;
  const battNeed = forecast?.batteryPct || 0;
  const elapsedS = elapsedMin * 60;
  const remainS = (forecast?.remainingS || 0);
  const totalS = elapsedS + remainS;
  const o2NeedSafe = need * (1 + O2_SAFETY_RESERVE);
  const battNeedSafe = battNeed * (1 + BATT_SAFETY_RESERVE);
  const status = following || moving ? 'MOVING' : (forecast?.frac >= 0.999 ? 'ARRIVED' : 'HOLD');
  const risk = sampleRisk(sample);
  return {
    currentPosition: sample,
    distanceTravelled: traveledM || forecast?.travelledM || 0,
    distanceRemaining: forecast?.remainingM || 0,
    totalDistance: forecast?.totalM || 0,
    elapsedTime: elapsedS,
    remainingTime: remainS,
    totalTime: totalS,
    elapsedHMS: formatHMS(elapsedS),
    remainingHMS: formatHMS(remainS),
    totalHMS: formatHMS(totalS),
    oxygenRemaining: plss.o2Kg,
    oxygenPercent: plss.o2RemainingPercent,
    oxygenNeeded: need,
    oxygenReserve: need * O2_SAFETY_RESERVE,
    oxygenSafe: o2NeedSafe,
    oxygenRate: o2Rate,
    batteryRemaining: plss.batteryPct,
    batteryNeeded: battNeed,
    batteryReserve: battNeed * BATT_SAFETY_RESERVE,
    batterySafe: battNeedSafe,
    batteryRate: battRate,
    astronautStatus: status,
    terrainSlope: sample.slope || 0,
    terrainDifficulty: surface.label,
    surface,
    walkingSpeed: speed,
    hazardRisk: risk,
    hazardLabel: riskLabel(risk),
    fatigue,
    climbRemaining: forecast?.climbM || 0,
    meanRisk: forecast?.meanRisk || risk,
    meanRiskLabel: riskLabel(forecast?.meanRisk || risk),
    timeline: forecast?.timeline || [],
    progress: forecast?.frac || 0,
    simRate: followSpeed,
    heartRate: heartRateFrom({ slope: sample.slope, fatigue, speedMps: speed, moving }),
    plss,
    forecast
  };
}

export { formatHMS };
