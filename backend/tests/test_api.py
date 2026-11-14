from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.main import app
from app.models import Hazard, Mission, RouteAnalysis, TelemetrySample  # noqa: F401

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base.metadata.create_all(bind=engine)


def override_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_db
client = TestClient(app)

START = {"latitude": 18.432, "longitude": 77.221}
DEST = {"latitude": 18.482, "longitude": 77.301}


def make_mission():
    res = client.post("/api/missions", json={
        "mission_name": "Jezero Science Traverse",
        "astronaut_id": "ASTRO-01",
        "start": START,
        "destination": DEST,
        "mission_type": "SAFE",
    })
    assert res.status_code == 200, res.text
    return res.json()


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "online"
    assert body["service"] == "ARES Mission Backend"


def test_create_mission():
    body = make_mission()
    assert body["mission_id"].startswith("mission_")
    assert body["status"] == "ACTIVE"
    assert "created_at" in body


def test_analyze_route():
    mission = make_mission()
    res = client.post("/api/navigation/analyze", json={
        "mission_id": mission["mission_id"],
        "start": START,
        "destination": DEST,
        "mode": "SAFE",
        "metrics": {
            "distance_km": 2.84,
            "estimated_duration_minutes": 72,
            "max_slope": 8.2,
            "average_slope": 4.1,
            "hazard_segments": 2,
            "zone_samples": 4,
        },
        "resources": {"oxygen_remaining": 92, "battery_remaining": 88, "elapsed_time_minutes": 0},
        "waypoints": [
            {"latitude": 18.432, "longitude": 77.221, "slope": 3.0},
            {"latitude": 18.45, "longitude": 77.26, "slope": 8.2},
            {"latitude": 18.482, "longitude": 77.301, "slope": 4.0},
        ],
    })
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["route"]["distance_km"] == 2.84
    assert body["terrain"]["max_slope"] == 8.2
    assert body["decision"]["status"] in {"GO", "CAUTION", "NO_GO"}
    assert body["decision"]["safety_score"] >= 0
    assert body["decision"]["reason"]


def test_telemetry_update():
    mission = make_mission()
    client.post("/api/navigation/analyze", json={
        "mission_id": mission["mission_id"],
        "start": START,
        "destination": DEST,
        "mode": "SAFE",
    })
    res = client.post("/api/telemetry/update", json={
        "mission_id": mission["mission_id"],
        "position": {"latitude": 18.45, "longitude": 77.25},
        "oxygen": 78,
        "battery": 71,
        "elapsed_time_minutes": 32,
    })
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["oxygen"] == 78
    assert body["battery"] == 71
    assert body["decision"] in {"GO", "CAUTION", "NO_GO"}
    assert "risk_score" in body


def test_hazard_reroute():
    mission = make_mission()
    client.post("/api/navigation/analyze", json={
        "mission_id": mission["mission_id"],
        "start": START,
        "destination": DEST,
        "mode": "SAFE",
        "waypoints": [
            {"latitude": 18.432, "longitude": 77.221},
            {"latitude": 18.46, "longitude": 77.27},
            {"latitude": 18.482, "longitude": 77.301},
        ],
    })
    res = client.post("/api/navigation/hazard", json={
        "mission_id": mission["mission_id"],
        "hazard": {"latitude": 18.46, "longitude": 77.27, "radius": 150, "severity": "HIGH"},
    })
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["route_affected"] is True
    assert body["decision"] == "REROUTE_REQUIRED"
    assert body["risk_after"] >= body["risk_before"]
    assert "message" in body


def test_compare_routes():
    res = client.post("/api/navigation/compare", json={
        "start": START,
        "destination": DEST,
        "routes": [
            {"type": "SAFE", "distance_km": 2.8, "duration_minutes": 72, "hazards": 2, "max_slope": 8.2},
            {"type": "DIRECT", "distance_km": 2.1, "duration_minutes": 54, "hazards": 6, "max_slope": 14.8},
            {"type": "SCIENCE", "distance_km": 3.4, "duration_minutes": 91, "hazards": 3, "max_slope": 10.1},
        ],
    })
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["recommended_route"] in {"SAFE", "DIRECT", "SCIENCE"}
    assert len(body["routes"]) == 3
    assert {r["type"] for r in body["routes"]} == {"SAFE", "DIRECT", "SCIENCE"}
