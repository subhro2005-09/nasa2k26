from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.mission import GeoPoint

Mode = Literal["SAFE", "DIRECT", "SCIENCE", "safe", "direct", "science", "FASTEST"]
Severity = Literal["LOW", "MEDIUM", "HIGH", "low", "medium", "high"]


class Waypoint(BaseModel):
    latitude: float
    longitude: float
    elevation: float | None = None
    slope: float | None = None


class RouteMetricsIn(BaseModel):
    distance_km: float | None = None
    estimated_duration_minutes: float | None = None
    max_slope: float | None = None
    average_slope: float | None = None
    elevation_gain: float | None = None
    elevation_loss: float | None = None
    hazard_segments: int | None = None
    zone_samples: int | None = None


class ResourceIn(BaseModel):
    oxygen_remaining: float = 100
    battery_remaining: float = 100
    elapsed_time_minutes: float = 0
    dust_tau: float = 0.42


class AnalyzeRequest(BaseModel):
    mission_id: str
    start: GeoPoint
    destination: GeoPoint
    mode: str = "SAFE"
    metrics: RouteMetricsIn | None = None
    resources: ResourceIn | None = None
    waypoints: list[Waypoint] = Field(default_factory=list)
    hazard_count: int | None = None


class RouteSummary(BaseModel):
    distance_km: float
    estimated_duration_minutes: float
    waypoints: list[Waypoint] = Field(default_factory=list)


class TerrainSummary(BaseModel):
    max_slope: float
    average_slope: float


class HazardSummary(BaseModel):
    count: int
    risk_score: float


class ResourceSummary(BaseModel):
    oxygen_required_percent: float
    battery_required_percent: float


class DecisionOut(BaseModel):
    status: str
    safety_score: float
    risk_score: float
    reason: list[str]
    recommended_action: str


class AnalyzeResponse(BaseModel):
    route: RouteSummary
    terrain: TerrainSummary
    hazards: HazardSummary
    resources: ResourceSummary
    decision: DecisionOut
    risk: dict


class CompareRouteIn(BaseModel):
    type: str
    distance_km: float
    duration_minutes: float
    hazards: int = 0
    max_slope: float | None = None
    average_slope: float | None = None


class CompareRequest(BaseModel):
    mission_id: str | None = None
    start: GeoPoint | None = None
    destination: GeoPoint | None = None
    routes: list[CompareRouteIn] = Field(default_factory=list)
    resources: ResourceIn | None = None


class ComparedRoute(BaseModel):
    type: str
    distance_km: float
    duration_minutes: float
    hazards: int
    safety_score: float
    decision: str


class CompareResponse(BaseModel):
    recommended_route: str
    routes: list[ComparedRoute]


class HazardIn(BaseModel):
    latitude: float
    longitude: float
    radius: float = 150
    severity: str = "HIGH"


class HazardRequest(BaseModel):
    mission_id: str
    hazard: HazardIn


class HazardResponse(BaseModel):
    route_affected: bool
    decision: str
    risk_before: float
    risk_after: float
    message: str
    recommended_action: str
    reasons: list[str]


class TelemetryUpdate(BaseModel):
    mission_id: str
    position: GeoPoint
    oxygen: float
    battery: float
    elapsed_time_minutes: float = 0


class TelemetryResponse(BaseModel):
    mission_status: str
    oxygen: float
    battery: float
    risk_score: float
    decision: str
    reasons: list[str] = Field(default_factory=list)
    recommended_action: str = "CONTINUE"
