from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Mission(Base):
    __tablename__ = "missions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mission_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    mission_name: Mapped[str] = mapped_column(String(160))
    astronaut_id: Mapped[str] = mapped_column(String(64), default="ASTRO-01")
    start_lat: Mapped[float] = mapped_column(Float)
    start_lon: Mapped[float] = mapped_column(Float)
    dest_lat: Mapped[float] = mapped_column(Float)
    dest_lon: Mapped[float] = mapped_column(Float)
    mission_type: Mapped[str] = mapped_column(String(16), default="SAFE")
    status: Mapped[str] = mapped_column(String(24), default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    hazards: Mapped[list["Hazard"]] = relationship(back_populates="mission", cascade="all, delete-orphan")
    analyses: Mapped[list["RouteAnalysis"]] = relationship(back_populates="mission", cascade="all, delete-orphan")
    telemetry: Mapped[list["TelemetrySample"]] = relationship(back_populates="mission", cascade="all, delete-orphan")


class Hazard(Base):
    __tablename__ = "hazards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mission_pk: Mapped[int] = mapped_column(ForeignKey("missions.id"), index=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    radius_m: Mapped[float] = mapped_column(Float, default=150)
    severity: Mapped[str] = mapped_column(String(16), default="HIGH")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    mission: Mapped[Mission] = relationship(back_populates="hazards")


class RouteAnalysis(Base):
    __tablename__ = "route_analysis"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mission_pk: Mapped[int] = mapped_column(ForeignKey("missions.id"), index=True)
    distance_km: Mapped[float] = mapped_column(Float, default=0)
    duration_min: Mapped[float] = mapped_column(Float, default=0)
    max_slope: Mapped[float] = mapped_column(Float, default=0)
    avg_slope: Mapped[float] = mapped_column(Float, default=0)
    hazard_count: Mapped[int] = mapped_column(Integer, default=0)
    risk_score: Mapped[float] = mapped_column(Float, default=0)
    safety_score: Mapped[float] = mapped_column(Float, default=100)
    decision: Mapped[str] = mapped_column(String(16), default="GO")
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    mission: Mapped[Mission] = relationship(back_populates="analyses")
