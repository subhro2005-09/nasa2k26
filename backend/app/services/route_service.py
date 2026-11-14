"""Route evaluation helpers. The frontend A* solver remains the path generator.

This module estimates geodesic distance on Mars, checks whether a reported
hazard intersects the active route, and scores SAFE / DIRECT / SCIENCE options.
"""

from __future__ import annotations

import math

from app.services import risk_service as risk

MARS_RADIUS_KM = 3389.5
WALK_MPS = 0.9  # suited EVA nominal used by the frontend follow loop


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    rlat1, rlon1, rlat2, rlon2 = map(math.radians, (lat1, lon1, lat2, lon2))
    dlat = rlat2 - rlat1
    dlon = rlon2 - rlon1
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2) ** 2
    return 2 * MARS_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    return haversine_km(lat1, lon1, lat2, lon2) * 1000.0


def duration_minutes(distance_km: float, avg_slope: float = 4.0) -> float:
    speed_kmh = max(1.2, 3.24 - avg_slope * 0.12)
    return round((distance_km / speed_kmh) * 60.0, 1)


def normalize_mode(mode: str | None) -> str:
    raw = (mode or "SAFE").upper()
    if raw in {"FASTEST", "DIRECT"}:
        return "DIRECT"
    if raw in {"SCIENCE", "SCIENCE_MAX"}:
        return "SCIENCE"
    return "SAFE"


def oxygen_required_percent(duration_min: float, avg_slope: float = 4.0) -> float:
    slope_factor = 1.0 + (max(0.0, avg_slope) / 10.0) ** 1.35 * 0.45
    liters = duration_min * 0.82 * slope_factor
    return round(min(100.0, (liters / 1200.0) * 100.0), 1)


def battery_required_percent(duration_min: float, avg_slope: float = 4.0) -> float:
    watts = 240.0 + (60.0 if avg_slope > 8 else 0.0)
    wh = (duration_min / 60.0) * watts
    return round(min(100.0, (wh / 1800.0) * 100.0), 1)


def fallback_route(start: dict, dest: dict, mode: str) -> dict:
    """Used when the frontend has not yet sent live A* metrics."""
    mode = normalize_mode(mode)
    base = haversine_km(start["latitude"], start["longitude"], dest["latitude"], dest["longitude"])
    stretch = {"SAFE": 1.18, "DIRECT": 1.0, "SCIENCE": 1.32}[mode]
    km = max(0.05, round(base * stretch, 2))
    max_slope = {"SAFE": 8.2, "DIRECT": 13.4, "SCIENCE": 10.1}[mode]
    avg_slope = {"SAFE": 4.1, "DIRECT": 6.8, "SCIENCE": 5.2}[mode]
    hazards = {"SAFE": 1, "DIRECT": 4, "SCIENCE": 2}[mode]
    return {
        "distance_km": km,
        "estimated_duration_minutes": duration_minutes(km, avg_slope),
        "max_slope": max_slope,
        "average_slope": avg_slope,
        "hazard_count": hazards,
        "elevation_range_m": 90.0 if mode != "DIRECT" else 140.0,
        "rough_fraction": 0.08 if mode == "SAFE" else 0.22 if mode == "SCIENCE" else 0.35,
    }


def densify_track(samples: list[tuple[float, float]], steps: int = 12) -> list[tuple[float, float]]:
    """Fill in great-circle-ish linear samples so a mid-leg hazard is not missed."""
    if len(samples) < 2:
        return samples
    out = [samples[0]]
    for a, b in zip(samples, samples[1:]):
        for i in range(1, steps + 1):
            t = i / steps
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def min_distance_to_route(
    hazard_lat: float,
    hazard_lon: float,
    waypoints: list[dict] | None,
    start: dict | None = None,
    dest: dict | None = None,
) -> float | None:
    samples: list[tuple[float, float]] = []
    for w in waypoints or []:
        lat = w.get("latitude", w.get("lat"))
        lon = w.get("longitude", w.get("lon"))
        if lat is not None and lon is not None:
            samples.append((float(lat), float(lon)))
    if len(samples) < 2 and start and dest:
        samples = [
            (start["latitude"], start["longitude"]),
            (dest["latitude"], dest["longitude"]),
        ]
    if not samples:
        return None
    track = densify_track(samples)
    return min(haversine_m(hazard_lat, hazard_lon, lat, lon) for lat, lon in track)


def route_intersects_hazard(
    hazard_lat: float,
    hazard_lon: float,
    radius_m: float,
    waypoints: list[dict] | None,
    start: dict | None = None,
    dest: dict | None = None,
) -> tuple[bool, float | None]:
    dist = min_distance_to_route(hazard_lat, hazard_lon, waypoints, start, dest)
    if dist is None:
        return False, None
    pad = max(radius_m, 40.0)
    return dist <= pad, dist


def score_candidate(route: dict, resources: dict | None = None) -> dict:
    res = resources or {}
    oxygen = res.get("oxygen_remaining", 100)
    battery = res.get("battery_remaining", 100)
    elapsed = res.get("elapsed_time_minutes", 0)
    dust = res.get("dust_tau", 0.42)
    risk_pack = risk.evaluate_risk(
        max_slope=route.get("max_slope") or 0,
        avg_slope=route.get("average_slope") or 0,
        elevation_range_m=route.get("elevation_range_m") or 0,
        rough_fraction=route.get("rough_fraction") or 0,
        hazard_count=int(route.get("hazard_count") or route.get("hazards") or 0),
        oxygen_remaining=oxygen,
        battery_remaining=battery,
        elapsed_min=elapsed,
        duration_min=route.get("estimated_duration_minutes") or route.get("duration_minutes") or 0,
        dust_tau=dust,
    )
    decision = risk.decide(
        risk_pack,
        oxygen_remaining=oxygen,
        battery_remaining=battery,
        max_slope=route.get("max_slope") or 0,
        hazard_count=int(route.get("hazard_count") or route.get("hazards") or 0),
    )
    kind = normalize_mode(route.get("type") or route.get("mode") or "SAFE")
    return {
        "type": kind,
        "distance_km": round(float(route.get("distance_km") or 0), 2),
        "duration_minutes": round(float(
            route.get("duration_minutes")
            or route.get("estimated_duration_minutes")
            or 0
        ), 1),
        "hazards": int(route.get("hazards") or route.get("hazard_count") or 0),
        "safety_score": decision["safety_score"],
        "decision": decision["status"],
        "risk": risk_pack,
        "reasons": decision["reasons"],
    }


def recommend(scored: list[dict]) -> str:
    """Prefer the highest safety score; tie-break shorter duration among GO/CAUTION."""
    if not scored:
        return "SAFE"
    ranked = sorted(
        scored,
        key=lambda r: (
            0 if r["decision"] == "NO_GO" else 1,
            r["safety_score"],
            -r["duration_minutes"],
        ),
        reverse=True,
    )
    return ranked[0]["type"]
