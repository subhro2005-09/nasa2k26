from datetime import datetime

from pydantic import BaseModel, Field


class GeoPoint(BaseModel):
    latitude: float
    longitude: float


class MissionCreate(BaseModel):
    mission_name: str = Field(min_length=1, max_length=160)
    astronaut_id: str = "ASTRO-01"
    start: GeoPoint
    destination: GeoPoint
    mission_type: str = "SAFE"


class MissionCreated(BaseModel):
    mission_id: str
    status: str
    created_at: datetime


class MissionOut(MissionCreated):
    mission_name: str
    astronaut_id: str
    start: GeoPoint
    destination: GeoPoint
    mission_type: str
