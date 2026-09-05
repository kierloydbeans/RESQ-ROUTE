from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db.session import get_session
from app.models.road_hazard import (
    RoadHazardReport,
    RoadHazardReportCreate,
    RoadHazardReportRead,
    RoadHazardReportUpdate,
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
    query = select(RoadHazardReport).offset(skip).limit(limit)
    if is_active is not None:
        query = query.where(RoadHazardReport.is_active == is_active)
    if is_resolved is not None:
        query = query.where(RoadHazardReport.is_resolved == is_resolved)
    result = await session.execute(query)
    return result.scalars().all()


@router.get("/{hazard_id}", response_model=RoadHazardReportRead)
async def get_road_hazard(hazard_id: int, session: Session = Depends(get_session)):
    result = await session.execute(select(RoadHazardReport).where(RoadHazardReport.id == hazard_id))
    hazard = result.scalar_one_or_none()
    if not hazard:
        raise HTTPException(status_code=404, detail="Road hazard report not found")
    return hazard


@router.post("/", response_model=RoadHazardReportRead)
async def create_road_hazard(
    hazard: RoadHazardReportCreate,
    session: Session = Depends(get_session),
):
    db_hazard = RoadHazardReport.from_orm(hazard)
    session.add(db_hazard)
    await session.commit()
    await session.refresh(db_hazard)
    return db_hazard


@router.put("/{hazard_id}", response_model=RoadHazardReportRead)
async def update_road_hazard(
    hazard_id: int,
    hazard_update: RoadHazardReportUpdate,
    session: Session = Depends(get_session),
):
    result = await session.execute(select(RoadHazardReport).where(RoadHazardReport.id == hazard_id))
    db_hazard = result.scalar_one_or_none()
    if not db_hazard:
        raise HTTPException(status_code=404, detail="Road hazard report not found")

    hazard_data = hazard_update.dict(exclude_unset=True)
    if hazard_data.get("is_resolved") is True and db_hazard.resolved_at is None:
        hazard_data["resolved_at"] = datetime.utcnow()
    if hazard_data.get("is_resolved") is False:
        hazard_data["resolved_at"] = None

    for key, value in hazard_data.items():
        setattr(db_hazard, key, value)

    await session.commit()
    await session.refresh(db_hazard)
    return db_hazard
