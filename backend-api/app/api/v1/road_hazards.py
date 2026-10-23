from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db.session import get_session
from app.api.v1.hazards import _require_dispatcher, road_hazard_feature
from app.api.websockets.telemetry import manager as telemetry_manager
from app.core.security import get_current_user
from app.models.road_hazard import (
    RoadHazardReport,
    RoadHazardReportCreate,
    RoadHazardReportRead,
    RoadHazardReportUpdate,
)
from app.services.road_hazard_expiration import (
    calculate_road_hazard_expiration,
    expire_stale_road_hazards,
)

router = APIRouter()


@router.get("/", response_model=List[RoadHazardReportRead])
async def list_road_hazards(
    skip: int = 0,
    limit: int = 100,
    is_active: Optional[bool] = True,
    is_resolved: Optional[bool] = False,
    session: Session = Depends(get_session),
):
    await expire_stale_road_hazards(session)
    query = select(RoadHazardReport).where(RoadHazardReport.review_status == "approved").offset(skip).limit(limit)
    if is_active is not None:
        query = query.where(RoadHazardReport.is_active == is_active)
    if is_resolved is not None:
        query = query.where(RoadHazardReport.is_resolved == is_resolved)
    result = await session.execute(query)
    return result.scalars().all()


@router.get("/{hazard_id}", response_model=RoadHazardReportRead)
async def get_road_hazard(hazard_id: int, session: Session = Depends(get_session)):
    await expire_stale_road_hazards(session)
    result = await session.execute(select(RoadHazardReport).where(RoadHazardReport.id == hazard_id))
    hazard = result.scalar_one_or_none()
    if not hazard or hazard.review_status != "approved":
        raise HTTPException(status_code=404, detail="Road hazard report not found")
    return hazard


@router.post("/", response_model=RoadHazardReportRead)
async def create_road_hazard(
    hazard: RoadHazardReportCreate,
    session: Session = Depends(get_session),
):
    db_hazard = RoadHazardReport.from_orm(hazard)
    db_hazard.is_active = False
    db_hazard.is_resolved = False
    db_hazard.review_status = "pending"
    db_hazard.expires_at = calculate_road_hazard_expiration(db_hazard.hazard_type, db_hazard.reported_at)
    session.add(db_hazard)
    await session.commit()
    await session.refresh(db_hazard)
    await telemetry_manager.broadcast({"type": "road_hazard_submitted", "id": db_hazard.id})
    return db_hazard


@router.put("/{hazard_id}", response_model=RoadHazardReportRead)
async def update_road_hazard(
    hazard_id: int,
    hazard_update: RoadHazardReportUpdate,
    credentials: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_dispatcher(credentials)
    await expire_stale_road_hazards(session)
    result = await session.execute(select(RoadHazardReport).where(RoadHazardReport.id == hazard_id))
    db_hazard = result.scalar_one_or_none()
    if not db_hazard:
        raise HTTPException(status_code=404, detail="Road hazard report not found")
    if db_hazard.review_status != "approved":
        raise HTTPException(status_code=409, detail="Review this road hazard before updating it")

    hazard_data = hazard_update.dict(exclude_unset=True)
    hazard_type = hazard_data.get("hazard_type", db_hazard.hazard_type)
    expires_at = calculate_road_hazard_expiration(hazard_type, db_hazard.reported_at)
    if hazard_data.get("is_active") is True and expires_at <= datetime.utcnow():
        raise HTTPException(status_code=409, detail="This road hazard has expired; create a new report to reactivate it")
    if "hazard_type" in hazard_data:
        db_hazard.expires_at = expires_at
    if hazard_data.get("is_resolved") is True and db_hazard.resolved_at is None:
        hazard_data["resolved_at"] = datetime.utcnow()
    if hazard_data.get("is_resolved") is False:
        hazard_data["resolved_at"] = None

    for key, value in hazard_data.items():
        setattr(db_hazard, key, value)

    await session.commit()
    await session.refresh(db_hazard)
    await telemetry_manager.broadcast({"type": "road_hazard_updated", "data": road_hazard_feature(db_hazard)})
    return db_hazard
