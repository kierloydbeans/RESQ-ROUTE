from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.v1 import auth, shelters, inventory, hazards, road_hazards, routing
from .api.websockets import telemetry
from .core.config import settings
from .db.base import init_db
from .models import center, evacuee, vehicle, report, user, rescuer, emergency_alert, road_hazard

app = FastAPI(title="RESQ-Route API", version="1.0.0")

origins = [
    "http://localhost:3000",  # React frontend
    "http://localhost:8000",   # FastAPI backend
    "https://resq-route-frontend.onrender.com",  # Production frontend
    "https://resq-route-test.onrender.com",  # Develop deployed frontend
]

configured_origins = getattr(settings, "CORS_ORIGINS", [])
if isinstance(configured_origins, str):
    configured_origins = [origin.strip() for origin in configured_origins.split(",") if origin.strip()]
origins.extend(origin for origin in configured_origins if origin != "*")

# CORS middlewares
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://([a-z0-9-]+\.)?onrender\.com|https://([a-z0-9-]+\.)?ngrok-free\.(dev|app)|https://([a-z0-9-]+\.)?loca\.lt",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(shelters.router, prefix="/api/v1/shelters", tags=["shelters"])
app.include_router(inventory.router, prefix="/api/v1/inventory", tags=["inventory"])
app.include_router(hazards.router, prefix="/api/v1/hazards", tags=["hazards"])
app.include_router(road_hazards.router, prefix="/api/v1/road-hazards", tags=["road-hazards"])
app.include_router(routing.router, prefix="/api/v1/routing", tags=["routing"])
app.include_router(telemetry.router, tags=["websockets"])
# app.include_router(auth.router, prefix="/api/v1/auth", tags=["rescuers"])

@app.on_event("startup")
async def startup_event():
    await init_db()

@app.get("/")
async def root():
    return {"message": "RESQ-Route API", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
