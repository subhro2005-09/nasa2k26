from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.mission import GeoPoint, MissionCreate, MissionCreated, MissionOut
from app.services import mission_service as missions

router = APIRouter(prefix="/missions", tags=["missions"])


def _out(row) -> MissionOut:
    return MissionOut(
        mission_id=row.mission_id,
        status=row.status,
        created_at=row.created_at,
        mission_name=row.mission_name,
        astronaut_id=row.astronaut_id,
        start=GeoPoint(latitude=row.start_lat, longitude=row.start_lon),
        destination=GeoPoint(latitude=row.dest_lat, longitude=row.dest_lon),
        mission_type=row.mission_type,
    )


@router.post("", response_model=MissionCreated)
def create_mission(payload: MissionCreate, db: Session = Depends(get_db)):
    row = missions.create_mission(db, payload)
    return MissionCreated(mission_id=row.mission_id, status=row.status, created_at=row.created_at)


@router.get("", response_model=list[MissionOut])
def list_missions(db: Session = Depends(get_db)):
    return [_out(row) for row in missions.list_missions(db)]


@router.get("/{mission_id}", response_model=MissionOut)
def get_mission(mission_id: str, db: Session = Depends(get_db)):
    row = missions.get_mission(db, mission_id)
    if not row:
        raise HTTPException(status_code=404, detail="Mission not found")
    return _out(row)
