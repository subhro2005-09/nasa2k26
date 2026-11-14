// NASA Portable Life Support System (PLSS) Consumable Calculator
import { forecastPath, snapshotFromTanks } from '../lib/evaSimulation.js';
import { O2_CAPACITY_KG, packTanks } from '../lib/resourceCalculator.js';

export const PLSS_SPECS = {
  tankCapacityO2Liters: 1200,      // Max usable O2 at 3,000 psi
  batteryCapacityWh: 1800,         // 48V High-density Li-ion
  feedwaterCapacityLiters: 4.8,    // Sublimator cooling loop
  suitPressurePsi: 4.3,            // Pure O2 atmosphere (29.6 kPa)
  nominalO2RateLMin: 0.82,         // Resting / flat walk rate (Liters / min)
  nominalPowerWatts: 240,          // Base avionics, fans, thermal heaters
  nominalCoolingLMin: 0.009,       // Water sublimator evaporation rate
  contingencyMarginMin: 45         // NASA standard emergency walk-back margin
};

export function calculatePlssConsumption(routeMetrics, currentProgress = 0, points, dustTau = 0.3) {
  if (points?.length > 1) {
    const full = forecastPath(points, 0, { fatigue: 0, dustTau });
    const maxD = points[points.length - 1].d || 1;
    const at = forecastPath(points, currentProgress * maxD, { fatigue: 0, dustTau });
    const consumedO2 = Math.max(0, (full.oxygenKg || 0) - (at.oxygenKg || 0));
    const consumedBatt = Math.max(0, (full.batteryPct || 0) - (at.batteryPct || 0));
    const tanks = packTanks(
      Math.max(0, O2_CAPACITY_KG - consumedO2),
      Math.max(0, 100 - consumedBatt),
      4.8
    );
    return snapshotFromTanks(tanks, { o2Rate: at.avgOxygenRate, battRate: at.avgBatteryRate, forecast: at });
  }
  const { estimatedTimeMin, avgSlope, distanceKm } = routeMetrics;

  if (estimatedTimeMin <= 0) {
    return {
      o2RemainingPercent: 100,
      o2RemainingLiters: PLSS_SPECS.tankCapacityO2Liters,
      o2BurnRateLMin: PLSS_SPECS.nominalO2RateLMin,
      o2EnduranceFormatted: '8h 20m',
      batteryRemainingPercent: 100,
      batteryRemainingWh: PLSS_SPECS.batteryCapacityWh,
      coolingWaterPercent: 100,
      safeReturnRadiusKm: 6.8,
      isPointOfNoReturnExceeded: false,
      contingencyMet: true
    };
  }

  // Metabolic scaling based on slope grade
  // Walking uphill requires exponentially more muscular work
  const slopeExertionFactor = 1 + Math.pow(Math.max(0, avgSlope) / 10, 1.35) * 0.45;
  const o2BurnRateLMin = Number((PLSS_SPECS.nominalO2RateLMin * slopeExertionFactor).toFixed(2));

  // Elapsed vs remaining time
  const elapsedMinutes = estimatedTimeMin * currentProgress;
  const remainingMinutes = estimatedTimeMin * (1 - currentProgress);

  // Liters burned so far
  const o2Burned = elapsedMinutes * o2BurnRateLMin;
  const o2RemainingLiters = Math.max(0, PLSS_SPECS.tankCapacityO2Liters - o2Burned);
  const o2RemainingPercent = Math.max(0, Math.round((o2RemainingLiters / PLSS_SPECS.tankCapacityO2Liters) * 100));

  // O2 Endurance at current burn rate
  const enduranceMin = o2BurnRateLMin > 0 ? Math.round(o2RemainingLiters / o2BurnRateLMin) : 500;
  const endHours = Math.floor(enduranceMin / 60);
  const endMins = enduranceMin % 60;
  const o2EnduranceFormatted = `${endHours}h ${endMins.toString().padStart(2, '0')}m`;

  // Battery consumption
  const powerWatts = PLSS_SPECS.nominalPowerWatts + (avgSlope > 8 ? 60 : 0);
  const batteryBurnedWh = (elapsedMinutes / 60) * powerWatts;
  const batteryRemainingWh = Math.max(0, PLSS_SPECS.batteryCapacityWh - batteryBurnedWh);
  const batteryRemainingPercent = Math.max(0, Math.round((batteryRemainingWh / PLSS_SPECS.batteryCapacityWh) * 100));

  // Feedwater cooling
  const waterBurned = elapsedMinutes * PLSS_SPECS.nominalCoolingLMin * slopeExertionFactor;
  const waterRemaining = Math.max(0, PLSS_SPECS.feedwaterCapacityLiters - waterBurned);
  const coolingWaterPercent = Math.max(0, Math.round((waterRemaining / PLSS_SPECS.feedwaterCapacityLiters) * 100));

  // NASA Point of No Return verification:
  // Can astronaut return to Hab from current position with mandatory 45 min margin?
  const returnTimeMin = Math.round((estimatedTimeMin / 2) * 1.1); // approx return
  const requiredReturnO2 = (returnTimeMin + PLSS_SPECS.contingencyMarginMin) * o2BurnRateLMin;
  const isPointOfNoReturnExceeded = o2RemainingLiters < requiredReturnO2;

  // Maximum safe distance radius from Hab based on endurance
  const safeReturnRadiusKm = Number(((o2RemainingLiters / o2BurnRateLMin / 60) * 1.5).toFixed(1));

  return {
    o2RemainingPercent,
    o2RemainingLiters: Math.round(o2RemainingLiters),
    o2BurnRateLMin,
    o2EnduranceFormatted,
    batteryRemainingPercent,
    batteryRemainingWh: Math.round(batteryRemainingWh),
    coolingWaterPercent,
    safeReturnRadiusKm,
    isPointOfNoReturnExceeded,
    contingencyMet: !isPointOfNoReturnExceeded
  };
}

function formatEndurance(min) {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export function fullTanks() {
  return {
    o2RemainingLiters: PLSS_SPECS.tankCapacityO2Liters,
    batteryRemainingWh: PLSS_SPECS.batteryCapacityWh,
    waterRemainingLiters: PLSS_SPECS.feedwaterCapacityLiters,
    o2Kg: 25.6,
    batteryPct: 100,
    waterL: 4.8
  };
}

/**
 * Live PLSS burn from actual movement, not a scrubber along a planned duration.
 * Idle life support still consumes a fraction of the walking rate.
 */
export function tickPlss(tanks, { dtMin, slope = 0, zone = false, moving = false }) {
  const slopeFactor = 1 + Math.pow(Math.max(0, slope) / 10, 1.35) * 0.45;
  const terrainFactor = zone ? 1.18 : 1;
  const load = (moving ? 1 : 0.42) * slopeFactor * terrainFactor;
  const o2BurnRateLMin = Number((PLSS_SPECS.nominalO2RateLMin * load).toFixed(3));
  const powerWatts = PLSS_SPECS.nominalPowerWatts * (moving ? 1 : 0.7) + (slope > 8 ? 60 : 0);
  const o2RemainingLiters = Math.max(0, tanks.o2RemainingLiters - dtMin * o2BurnRateLMin);
  const batteryRemainingWh = Math.max(0, tanks.batteryRemainingWh - (dtMin / 60) * powerWatts);
  const waterRemainingLiters = Math.max(0, tanks.waterRemainingLiters - dtMin * PLSS_SPECS.nominalCoolingLMin * load);
  return snapshotPlss({ o2RemainingLiters, batteryRemainingWh, waterRemainingLiters, o2BurnRateLMin, powerWatts });
}

export function snapshotPlss({ o2RemainingLiters, batteryRemainingWh, waterRemainingLiters, o2BurnRateLMin, powerWatts }) {
  const o2RemainingPercent = Math.max(0, Math.round((o2RemainingLiters / PLSS_SPECS.tankCapacityO2Liters) * 100));
  const batteryRemainingPercent = Math.max(0, Math.round((batteryRemainingWh / PLSS_SPECS.batteryCapacityWh) * 100));
  const coolingWaterPercent = Math.max(0, Math.round((waterRemainingLiters / PLSS_SPECS.feedwaterCapacityLiters) * 100));
  const enduranceMin = o2BurnRateLMin > 0 ? o2RemainingLiters / o2BurnRateLMin : 500;
  const walkMps = Math.max(0.4, 0.9);
  const safeReturnRadiusKm = Number(((enduranceMin / 60) * walkMps * 3.6 * 0.45).toFixed(2));
  return {
    o2RemainingPercent,
    o2RemainingLiters: Math.round(o2RemainingLiters * 10) / 10,
    o2BurnRateLMin,
    o2EnduranceFormatted: formatEndurance(enduranceMin),
    enduranceMin: Math.round(enduranceMin),
    batteryRemainingPercent,
    batteryRemainingWh: Math.round(batteryRemainingWh),
    coolingWaterPercent,
    waterRemainingLiters,
    powerWatts,
    safeReturnRadiusKm,
    tanks: { o2RemainingLiters, batteryRemainingWh, waterRemainingLiters }
  };
}

