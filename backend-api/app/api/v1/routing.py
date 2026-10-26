from typing import Any, Dict, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel, select

from app.db.session import get_session
from app.models.road_hazard import RoadHazardReport
from app.models.hazard_map_layer import HazardMapLayer
from app.services.road_hazard_expiration import expire_stale_road_hazards
from app.services.graphhopper_routing import route_citizen
from app.api.websockets.telemetry import manager as telemetry_manager

router = APIRouter()


class WalkingRouteRequest(SQLModel):
    origin_latitude: float
    origin_longitude: float
    destination_latitude: float
    destination_longitude: float
    request_id: Optional[str] = None


@router.post("/walk")
@router.post("/calculate")
async def create_walking_route(
    request: WalkingRouteRequest,
    session: AsyncSession = Depends(get_session),
) -> Dict[str, Any]:
    await expire_stale_road_hazards(session)
    result = await session.execute(
        select(RoadHazardReport).where(
            RoadHazardReport.is_active == True,  # noqa: E712
            RoadHazardReport.is_resolved == False,  # noqa: E712
            RoadHazardReport.review_status == "approved",
        )
    )
    hazards = result.scalars().all()
    noah_result = await session.execute(
        select(HazardMapLayer).where(HazardMapLayer.hazard_level == "high")
    )
    noah_layers = noah_result.scalars().all()

    try:
        request_id = request.request_id or str(uuid4())

        async def publish_status(message: str, data: Dict[str, Any]) -> None:
            await telemetry_manager.publish_routing_status(request_id, message, data)

        response = await route_citizen(
            origin_latitude=request.origin_latitude,
            origin_longitude=request.origin_longitude,
            destination_latitude=request.destination_latitude,
            destination_longitude=request.destination_longitude,
            hazards=hazards,
            noah_layers=noah_layers,
            status_callback=publish_status,
        )
        response["routing_request_id"] = request_id
        return response
    except TimeoutError as error:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail={"code": "ROUTING_TIMEOUT", "message": "Routing services timed out. Please try again."},
        ) from error
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "ROUTING_UNAVAILABLE", "message": "Walking directions are temporarily unavailable. Please try again."},
        ) from error
