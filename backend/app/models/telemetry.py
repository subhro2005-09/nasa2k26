from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mission import Mission


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TelemetrySample(Base):
    __tablename__ = "telemetry_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mission_pk: Mapped[int] = mapped_column(ForeignKey("missions.id"), index=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    oxygen: Mapped[float] = mapped_column(Float)
    battery: Mapped[float] = mapped_column(Float)
    elapsed_time_minutes: Mapped[float] = mapped_column(Float, default=0)
    risk_score: Mapped[float] = mapped_column(Float, default=0)
    decision: Mapped[str] = mapped_column(String(16), default="GO")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    mission: Mapped[Mission] = relationship(back_populates="telemetry")
