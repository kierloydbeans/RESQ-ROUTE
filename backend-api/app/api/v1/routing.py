from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, SQLModel, select

from app.db.session import get_session
from app.models.road_hazard import RoadHazardReport
from app.services.graphhopper_routing import route_citizen

router = APIRouter()


class WalkingRouteRequest(SQLModel):
    origin_latitude: float
    origin_longitude: float
    destination_latitude: float
    destination_longitude: float


@router.post("/walk")
async def create_walking_route(
    request: WalkingRouteRequest,
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    result = await session.execute(
        select(RoadHazardReport).where(
            RoadHazardReport.is_active == True,  # noqa: E712
            RoadHazardReport.is_resolved == False,  # noqa: E712
        )
    )
    hazards = result.scalars().all()

    try:
        return await route_citizen(
            origin_latitude=request.origin_latitude,
            origin_longitude=request.origin_longitude,
            destination_latitude=request.destination_latitude,
            destination_longitude=request.destination_longitude,
            hazards=hazards,
        )
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Unable to calculate walking route: {error}") from error
