from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.models.mission import Hazard, Mission, RouteAnalysis
from app.models.telemetry import TelemetrySample
from app.services import risk_service as risk
from app.services.route_service import (
    battery_required_percent,
    fallback_route,
    min_distance_to_route,
    oxygen_required_percent,
    route_intersects_hazard,
)


def latest_analysis(db: Session, mission: Mission) -> RouteAnalysis | None:
    return (
        db.query(RouteAnalysis)
        .filter(RouteAnalysis.mission_pk == mission.id)
        .order_by(RouteAnalysis.id.desc())
        .first()
    )


def payload_of(row: RouteAnalysis | None) -> dict:
    if not row:
        return {}
    try:
        return json.loads(row.payload_json or "{}")
    except json.JSONDecodeError:
        return {}


def persist_analysis(db: Session, mission: Mission, body: dict) -> RouteAnalysis:
    decision = body["decision"]
    row = RouteAnalysis(
        mission_pk=mission.id,
        distance_km=body["route"]["distance_km"],
        duration_min=body["route"]["estimated_duration_minutes"],
        max_slope=body["terrain"]["max_slope"],
        avg_slope=body["terrain"]["average_slope"],
        hazard_count=body["hazards"]["count"],
        risk_score=decision["risk_score"],
        safety_score=decision["safety_score"],
        decision=decision["status"],
        payload_json=json.dumps(body),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def build_analysis(
    mission: Mission,
    req,
    db: Session,
) -> dict:
    start = {"latitude": req.start.latitude, "longitude": req.start.longitude}
    dest = {"latitude": req.destination.latitude, "longitude": req.destination.longitude}
    metrics = req.metrics
    fb = fallback_route(start, dest, req.mode)

    distance = (metrics.distance_km if metrics and metrics.distance_km is not None else fb["distance_km"])
    duration = (
        metrics.estimated_duration_minutes
        if metrics and metrics.estimated_duration_minutes is not None
        else fb["estimated_duration_minutes"]
    )
    max_slope = metrics.max_slope if metrics and metrics.max_slope is not None else fb["max_slope"]
    avg_slope = metrics.average_slope if metrics and metrics.average_slope is not None else fb["average_slope"]
    elev = 0.0
    if metrics and metrics.elevation_gain is not None and metrics.elevation_loss is not None:
        elev = float(metrics.elevation_gain) + float(metrics.elevation_loss)
    else:
        elev = fb["elevation_range_m"]

    stored = db.query(Hazard).filter(Hazard.mission_pk == mission.id).all()
    hz_count = req.hazard_count
    if hz_count is None:
        segs = metrics.hazard_segments if metrics and metrics.hazard_segments is not None else 0
        zones = metrics.zone_samples if metrics and metrics.zone_samples is not None else 0
        hz_count = max(len(stored), segs, 1 if zones else 0)

    waypoints = [w.model_dump() for w in (req.waypoints or [])]
    min_dist = None
    worst_sev = "MEDIUM"
    if stored:
        dists = []
        for h in stored:
            d = min_distance_to_route(h.latitude, h.longitude, waypoints, start, dest)
            if d is not None:
                dists.append(d)
            if h.severity.upper() == "HIGH":
                worst_sev = "HIGH"
        min_dist = min(dists) if dists else None

    res = req.resources
    oxygen = res.oxygen_remaining if res else 100.0
    battery = res.battery_remaining if res else 100.0
    elapsed = res.elapsed_time_minutes if res else 0.0
    dust = res.dust_tau if res else 0.42
    rough = 0.0
    if metrics and metrics.zone_samples:
        rough = min(1.0, metrics.zone_samples / 40.0)
    elif fb:
        rough = fb["rough_fraction"]

    risk_pack = risk.evaluate_risk(
        max_slope=max_slope or 0,
        avg_slope=avg_slope or 0,
        elevation_range_m=elev,
        rough_fraction=rough,
        hazard_count=int(hz_count or 0),
        min_distance_m=min_dist,
        severity=worst_sev,
        oxygen_remaining=oxygen,
        battery_remaining=battery,
        elapsed_min=elapsed,
        duration_min=duration or 0,
        dust_tau=dust,
    )
    decision = risk.decide(
        risk_pack,
        oxygen_remaining=oxygen,
        battery_remaining=battery,
        max_slope=max_slope or 0,
        hazard_count=int(hz_count or 0),
        min_distance_m=min_dist,
    )

    body = {
        "route": {
            "distance_km": round(float(distance or 0), 2),
            "estimated_duration_minutes": round(float(duration or 0), 1),
            "waypoints": waypoints,
        },
        "terrain": {
            "max_slope": round(float(max_slope or 0), 1),
            "average_slope": round(float(avg_slope or 0), 1),
        },
        "hazards": {
            "count": int(hz_count or 0),
            "risk_score": risk_pack["hazard"],
        },
        "resources": {
            "oxygen_required_percent": oxygen_required_percent(duration or 0, avg_slope or 0),
            "battery_required_percent": battery_required_percent(duration or 0, avg_slope or 0),
        },
        "decision": {
            "status": decision["status"],
            "safety_score": decision["safety_score"],
            "risk_score": decision["risk_score"],
            "reason": decision["reasons"],
            "recommended_action": decision["recommended_action"],
        },
        "risk": risk_pack,
    }
    persist_analysis(db, mission, body)
    return body


def record_telemetry(db: Session, mission: Mission, req) -> dict:
    prior = latest_analysis(db, mission)
    payload = payload_of(prior)
    duration = payload.get("route", {}).get("estimated_duration_minutes") or (prior.duration_min if prior else 0)
    max_slope = payload.get("terrain", {}).get("max_slope") or (prior.max_slope if prior else 8.0)
    avg_slope = payload.get("terrain", {}).get("average_slope") or (prior.avg_slope if prior else 4.0)
    hz_count = payload.get("hazards", {}).get("count") or (prior.hazard_count if prior else 0)

    risk_pack = risk.evaluate_risk(
        max_slope=max_slope,
        avg_slope=avg_slope,
        hazard_count=int(hz_count or 0),
        oxygen_remaining=req.oxygen,
        battery_remaining=req.battery,
        elapsed_min=req.elapsed_time_minutes,
        duration_min=duration or 0,
    )
    decision = risk.decide(
        risk_pack,
        oxygen_remaining=req.oxygen,
        battery_remaining=req.battery,
        max_slope=max_slope,
        hazard_count=int(hz_count or 0),
    )
    if decision["status"] == "NO_GO":
        mission.status = "HOLD"
    elif mission.status == "HOLD" and decision["status"] == "GO":
        mission.status = "ACTIVE"

    sample = TelemetrySample(
        mission_pk=mission.id,
        latitude=req.position.latitude,
        longitude=req.position.longitude,
        oxygen=req.oxygen,
        battery=req.battery,
        elapsed_time_minutes=req.elapsed_time_minutes,
        risk_score=decision["risk_score"],
        decision=decision["status"],
    )
    db.add(sample)
    db.commit()
    return {
        "mission_status": mission.status,
        "oxygen": req.oxygen,
        "battery": req.battery,
        "risk_score": decision["risk_score"],
        "decision": decision["status"],
        "reasons": decision["reasons"],
        "recommended_action": decision["recommended_action"],
    }


def register_hazard(db: Session, mission: Mission, hazard) -> dict:
    prior = latest_analysis(db, mission)
    risk_before = prior.risk_score if prior else 0.0
    payload = payload_of(prior)
    waypoints = payload.get("route", {}).get("waypoints") or []
    start = {"latitude": mission.start_lat, "longitude": mission.start_lon}
    dest = {"latitude": mission.dest_lat, "longitude": mission.dest_lon}

    row = Hazard(
        mission_pk=mission.id,
        latitude=hazard.latitude,
        longitude=hazard.longitude,
        radius_m=hazard.radius,
        severity=str(hazard.severity).upper(),
    )
    db.add(row)
    db.commit()

    affected, dist = route_intersects_hazard(
        hazard.latitude, hazard.longitude, hazard.radius, waypoints, start, dest
    )
    all_h = db.query(Hazard).filter(Hazard.mission_pk == mission.id).all()
    duration = payload.get("route", {}).get("estimated_duration_minutes") or (prior.duration_min if prior else 60)
    max_slope = payload.get("terrain", {}).get("max_slope") or (prior.max_slope if prior else 8.0)
    avg_slope = payload.get("terrain", {}).get("average_slope") or (prior.avg_slope if prior else 4.0)

    risk_pack = risk.evaluate_risk(
        max_slope=max_slope,
        avg_slope=avg_slope,
        hazard_count=len(all_h),
        min_distance_m=dist,
        severity=str(hazard.severity).upper(),
        duration_min=duration or 0,
        oxygen_remaining=100.0 if not prior else 100.0,
    )
    decision = risk.decide(
        risk_pack,
        max_slope=max_slope,
        hazard_count=len(all_h),
        min_distance_m=dist,
    )

    close_high = str(hazard.severity).upper() == "HIGH" and dist is not None and dist <= max(hazard.radius, 180)
    if affected or close_high:
        affected = True

    if affected:
        msg = "New high-risk terrain intersects the active route."
        if dist is not None:
            msg = f"Hazard detected {dist:.0f} m from the planned route. Generate a safer path."
        decision_code = "REROUTE_REQUIRED"
        action = "GENERATE_SAFER_ROUTE"
        mission.status = "REROUTE"
    else:
        msg = "Hazard logged. Current route remains clear of the reported radius."
        decision_code = decision["status"]
        action = "CONTINUE"
    db.commit()

    return {
        "route_affected": bool(affected),
        "decision": decision_code,
        "risk_before": round(float(risk_before), 1),
        "risk_after": round(float(risk_pack["total_risk"]), 1),
        "message": msg,
        "recommended_action": action,
        "reasons": decision["reasons"] if affected else [
            "Hazard stored for the mission log",
            "Active path stays outside the reported radius",
        ],
    }
