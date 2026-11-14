from fastapi import APIRouter

from app.api.missions import router as missions_router
from app.api.navigation import router as navigation_router
from app.api.telemetry import router as telemetry_router

api_router = APIRouter()
api_router.include_router(missions_router)
api_router.include_router(navigation_router)
api_router.include_router(telemetry_router)
