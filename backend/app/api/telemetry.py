from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.navigation import TelemetryResponse, TelemetryUpdate
from app.services import mission_service as missions
from app.services import telemetry_service as live

router = APIRouter(prefix="/telemetry", tags=["telemetry"])


@router.post("/update", response_model=TelemetryResponse)
def update_telemetry(payload: TelemetryUpdate, db: Session = Depends(get_db)):
    mission = missions.get_mission(db, payload.mission_id)
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    return live.record_telemetry(db, mission, payload)
