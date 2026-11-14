from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.mission import Mission
from app.services.route_service import normalize_mode


def next_mission_id(db: Session) -> str:
    n = db.query(Mission).count() + 1
    return f"mission_{n:03d}"


def create_mission(db: Session, payload) -> Mission:
    row = Mission(
        mission_id=next_mission_id(db),
        mission_name=payload.mission_name,
        astronaut_id=payload.astronaut_id or "ASTRO-01",
        start_lat=payload.start.latitude,
        start_lon=payload.start.longitude,
        dest_lat=payload.destination.latitude,
        dest_lon=payload.destination.longitude,
        mission_type=normalize_mode(payload.mission_type),
        status="ACTIVE",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_mission(db: Session, mission_id: str) -> Mission | None:
    return db.query(Mission).filter(Mission.mission_id == mission_id).first()


def list_missions(db: Session) -> list[Mission]:
    return db.query(Mission).order_by(Mission.id.desc()).limit(50).all()


def set_status(db: Session, mission: Mission, status: str) -> Mission:
    mission.status = status
    db.commit()
    db.refresh(mission)
    return mission
