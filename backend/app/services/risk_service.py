"""Transparent mission risk and GO / CAUTION / NO-GO decision engine.

Weights (must sum to 1.0):

    Terrain  30%
    Hazard   35%
    Resource 20%
    Mission  15%

safety_score = 100 - total_risk
"""

from __future__ import annotations

SLOPE_LIMIT_DEG = 15.0
OXYGEN_ABORT_PCT = 20.0
BATTERY_ABORT_PCT = 15.0
RISK_NO_GO = 70.0
RISK_CAUTION = 40.0

WEIGHTS = {
    "terrain": 0.30,
    "hazard": 0.35,
    "resource": 0.20,
    "mission": 0.15,
}


def clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def terrain_risk(
    max_slope: float,
    avg_slope: float,
    elevation_range_m: float = 0.0,
    rough_fraction: float = 0.0,
) -> float:
    """Slope, relief, and mapped roughness on a 0–100 scale."""
    slope_term = min(100.0, (max(0.0, max_slope) / SLOPE_LIMIT_DEG) * 70.0)
    if max_slope > SLOPE_LIMIT_DEG:
        slope_term = min(100.0, 70.0 + (max_slope - SLOPE_LIMIT_DEG) * 6.0)
    avg_term = min(40.0, max(0.0, avg_slope) * 2.4)
    elev_term = min(25.0, max(0.0, elevation_range_m) / 40.0)
    rough_term = min(30.0, max(0.0, rough_fraction) * 80.0)
    return clamp(0.55 * slope_term + 0.20 * avg_term + 0.15 * elev_term + 0.10 * rough_term)


def hazard_risk(
    count: int,
    min_distance_m: float | None = None,
    severity: str = "MEDIUM",
) -> float:
    """Count, proximity, and severity of reported / mapped hazards."""
    sev = {"LOW": 0.45, "MEDIUM": 0.70, "HIGH": 1.0}.get(str(severity).upper(), 0.70)
    count_term = min(85.0, max(0, count) * 16.0)
    prox = 10.0
    if min_distance_m is not None:
        if min_distance_m <= 40:
            prox = 95.0
        elif min_distance_m <= 120:
            prox = 62.0
        elif min_distance_m <= 250:
            prox = 34.0
        elif min_distance_m <= 500:
            prox = 16.0
        else:
            prox = 6.0
    elif count > 0:
        prox = 40.0
    return clamp((0.58 * count_term + 0.42 * prox) * (0.55 + 0.45 * sev))


def resource_risk(
    oxygen_remaining: float,
    battery_remaining: float,
    elapsed_min: float = 0.0,
    duration_min: float = 0.0,
) -> float:
    """Life-support remaining vs EVA effort so far."""
    o2 = oxygen_remaining
    if o2 < OXYGEN_ABORT_PCT:
        o2_term = 100.0
    elif o2 < 40:
        o2_term = 55.0 + (40.0 - o2) * 2.0
    else:
        o2_term = max(0.0, (100.0 - o2) * 0.35)

    bat = battery_remaining
    if bat < BATTERY_ABORT_PCT:
        bat_term = 100.0
    elif bat < 40:
        bat_term = 50.0 + (40.0 - bat) * 1.8
    else:
        bat_term = max(0.0, (100.0 - bat) * 0.30)

    denom = max(duration_min, elapsed_min, 1.0)
    time_term = min(70.0, (elapsed_min / denom) * 45.0)
    return clamp(0.50 * o2_term + 0.35 * bat_term + 0.15 * time_term)


def mission_risk(duration_min: float, dust_tau: float = 0.42) -> float:
    """Duration against an 8 h suit limit, plus dust opacity."""
    if duration_min <= 180:
        dur = duration_min / 18.0
    elif duration_min <= 360:
        dur = 10.0 + (duration_min - 180) / 6.0
    else:
        dur = min(90.0, 40.0 + (duration_min - 360) / 4.0)
    dust = min(35.0, max(0.0, (dust_tau - 0.35) * 90.0))
    return clamp(0.78 * dur + 0.22 * dust)


def combine_risk(
    terrain: float,
    hazard: float,
    resource: float,
    mission: float,
) -> dict:
    total = (
        WEIGHTS["terrain"] * terrain
        + WEIGHTS["hazard"] * hazard
        + WEIGHTS["resource"] * resource
        + WEIGHTS["mission"] * mission
    )
    total = clamp(total)
    return {
        "terrain": round(terrain, 1),
        "hazard": round(hazard, 1),
        "resource": round(resource, 1),
        "mission": round(mission, 1),
        "total_risk": round(total, 1),
        "safety_score": round(100.0 - total, 1),
        "weights": WEIGHTS,
    }


def evaluate_risk(
    *,
    max_slope: float = 0.0,
    avg_slope: float = 0.0,
    elevation_range_m: float = 0.0,
    rough_fraction: float = 0.0,
    hazard_count: int = 0,
    min_distance_m: float | None = None,
    severity: str = "MEDIUM",
    oxygen_remaining: float = 100.0,
    battery_remaining: float = 100.0,
    elapsed_min: float = 0.0,
    duration_min: float = 0.0,
    dust_tau: float = 0.42,
) -> dict:
    t = terrain_risk(max_slope, avg_slope, elevation_range_m, rough_fraction)
    h = hazard_risk(hazard_count, min_distance_m, severity)
    r = resource_risk(oxygen_remaining, battery_remaining, elapsed_min, duration_min)
    m = mission_risk(duration_min, dust_tau)
    return combine_risk(t, h, r, m)


def decide(
    risk: dict,
    *,
    oxygen_remaining: float = 100.0,
    battery_remaining: float = 100.0,
    max_slope: float = 0.0,
    hazard_count: int = 0,
    min_distance_m: float | None = None,
) -> dict:
    """Explainable GO / CAUTION / NO_GO with recommended next action."""
    reasons: list[str] = []
    status = "GO"
    action = "PROCEED"
    total = risk["total_risk"]

    if oxygen_remaining < OXYGEN_ABORT_PCT:
        status = "NO_GO"
        action = "ABORT_TO_HABITAT"
        reasons.append(
            f"Oxygen remaining is {oxygen_remaining:.0f}%, below the {OXYGEN_ABORT_PCT:.0f}% abort threshold."
        )
    if battery_remaining < BATTERY_ABORT_PCT:
        status = "NO_GO"
        action = "ABORT_TO_HABITAT"
        reasons.append(
            f"Battery remaining is {battery_remaining:.0f}%, below the {BATTERY_ABORT_PCT:.0f}% abort threshold."
        )
    if total > RISK_NO_GO and status != "NO_GO":
        status = "NO_GO"
        action = "ABORT_OR_REROUTE"
        reasons.append(f"Combined mission risk is {total:.0f}/100, above the {RISK_NO_GO:.0f} abort line.")
    elif total > RISK_CAUTION and status != "NO_GO":
        status = "CAUTION"
        action = "REROUTE" if hazard_count else "PROCEED_WITH_ADVISORIES"
        reasons.append(f"Combined mission risk is {total:.0f}/100, above the {RISK_CAUTION:.0f} caution line.")

    if max_slope > SLOPE_LIMIT_DEG:
        reasons.append(
            f"Maximum slope {max_slope:.1f}° exceeds the {SLOPE_LIMIT_DEG:.0f}° EVA slip limit."
        )
        if status == "GO":
            status = "CAUTION"
            action = "REROUTE"
        elif status == "CAUTION":
            action = "REROUTE"

    if min_distance_m is not None and min_distance_m <= 150 and hazard_count:
        reasons.append(f"Hazard detected {min_distance_m:.0f} m from the planned route.")
        if status == "GO":
            status = "CAUTION"
            action = "GENERATE_SAFER_ROUTE"
        elif status == "CAUTION":
            action = "GENERATE_SAFER_ROUTE"

    if not reasons:
        reasons = [
            "Route avoids high-risk terrain",
            "Oxygen reserve is sufficient",
            "Maximum slope is within safety limits",
        ]

    return {
        "status": status,
        "risk_score": risk["total_risk"],
        "safety_score": risk["safety_score"],
        "reasons": reasons,
        "recommended_action": action,
    }
