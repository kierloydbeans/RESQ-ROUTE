from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.v1 import auth, shelters, inventory, hazards
from .api.websockets import telemetry
from .core.config import settings
from .db.base import init_db
from .models import center, evacuee, vehicle, report, user

app = FastAPI(title="RESQ-Route API", version="1.0.0")

origins = [
    "http://localhost:3000",  # React frontend
    "http://localhost:8000"   # FastAPI backend
    "https://resq-route.vercel.app/"  # Production frontend
]

# CORS middlewares
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(shelters.router, prefix="/api/v1/shelters", tags=["shelters"])
app.include_router(inventory.router, prefix="/api/v1/inventory", tags=["inventory"])
app.include_router(hazards.router, prefix="/api/v1/hazards", tags=["hazards"])
app.include_router(telemetry.router, tags=["websockets"])

@app.on_event("startup")
async def startup_event():
    await init_db()

@app.get("/")
async def root():
    return {"message": "RESQ-Route API", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
