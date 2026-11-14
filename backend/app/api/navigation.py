from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.navigation import (
    AnalyzeRequest,
    AnalyzeResponse,
    CompareRequest,
    CompareResponse,
    ComparedRoute,
    HazardRequest,
    HazardResponse,
)
from app.services import mission_service as missions
from app.services import telemetry_service as live
from app.services.route_service import (
    fallback_route,
    recommend,
    score_candidate,
)

router = APIRouter(prefix="/navigation", tags=["navigation"])


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze_route(payload: AnalyzeRequest, db: Session = Depends(get_db)):
    mission = missions.get_mission(db, payload.mission_id)
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    return live.build_analysis(mission, payload, db)


@router.post("/compare", response_model=CompareResponse)
def compare_routes(payload: CompareRequest, db: Session = Depends(get_db)):
    resources = payload.resources.model_dump() if payload.resources else {}
    scored = []
    if payload.routes:
        for item in payload.routes:
            scored.append(score_candidate({
                "type": item.type,
                "distance_km": item.distance_km,
                "duration_minutes": item.duration_minutes,
                "estimated_duration_minutes": item.duration_minutes,
                "hazards": item.hazards,
                "hazard_count": item.hazards,
                "max_slope": item.max_slope or 0,
                "average_slope": item.average_slope or 0,
            }, resources))
    elif payload.start and payload.destination:
        start = {"latitude": payload.start.latitude, "longitude": payload.start.longitude}
        dest = {"latitude": payload.destination.latitude, "longitude": payload.destination.longitude}
        for kind in ("SAFE", "DIRECT", "SCIENCE"):
            fb = fallback_route(start, dest, kind)
            fb["type"] = kind
            fb["hazards"] = fb["hazard_count"]
            scored.append(score_candidate(fb, resources))
    else:
        raise HTTPException(status_code=400, detail="Provide routes[] or start and destination")

    return CompareResponse(
        recommended_route=recommend(scored),
        routes=[ComparedRoute(**{
            "type": s["type"],
            "distance_km": s["distance_km"],
            "duration_minutes": s["duration_minutes"],
            "hazards": s["hazards"],
            "safety_score": s["safety_score"],
            "decision": s["decision"],
        }) for s in scored],
    )


@router.post("/hazard", response_model=HazardResponse)
def report_hazard(payload: HazardRequest, db: Session = Depends(get_db)):
    mission = missions.get_mission(db, payload.mission_id)
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    return live.register_hazard(db, mission, payload.hazard)
