import csv
import json
from urllib.parse import urlsplit, urlunsplit
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import DBAPIError, OperationalError, ProgrammingError
from sqlmodel import Session, select
from typing import List, Optional
from app.models.report import Report, ReportCreate, ReportRead, ReportUpdate, SeverityLevel
from app.models.hazard_map_layer import HazardLayerPublish, HazardMapLayer, HazardMapLayerRead
from app.core.security import get_current_user
from app.db.session import get_session
from app.api.websockets.telemetry import manager as telemetry_manager
from app.models.road_hazard import RoadHazardReport, RoadHazardType
from app.services.graphhopper_routing import exclusion_polygon
from app.services.road_hazard_expiration import calculate_road_hazard_expiration, expire_stale_road_hazards
from app.services.audit_logging import record_audit_log
from app.core.config import settings
from starlette.concurrency import run_in_threadpool
from supabase import create_client

router = APIRouter()
FEATURES_PATH = Path(__file__).resolve().parents[4] / "data-science" / "data" / "derived" / "south_caloocan_real_hazard_features.csv"
# Reuse the existing public SOS media bucket so road-hazard uploads use the
# same Supabase Storage configuration and policies.
ROAD_HAZARD_MEDIA_BUCKET = "sos_alert_media"
MAX_ROAD_HAZARD_IMAGES = 5
MAX_ROAD_HAZARD_IMAGE_BYTES = 25 * 1024 * 1024
ROAD_HAZARD_IMAGE_EXTENSIONS = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
    "image/gif": ".gif", "image/heic": ".heic", "image/heif": ".heif",
}


class RoadHazardSubmission(BaseModel):
    hazard_type: RoadHazardType
    description: str = Field(min_length=1)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    radius_meters: int = Field(default=75, ge=10, le=2000)
    severity: SeverityLevel = SeverityLevel.HIGH
    road_name: Optional[str] = None
    reporter_name: Optional[str] = None


def road_hazard_feature(hazard: RoadHazardReport) -> dict:
    ring = exclusion_polygon(hazard.latitude, hazard.longitude, hazard.radius_meters)
    ring.append(ring[0])
    return {
        "type": "Feature",
        "id": hazard.id,
        "geometry": {"type": "Polygon", "coordinates": [ring]},
        "properties": {
            "id": hazard.id,
            "hazard_type": hazard.hazard_type,
            "description": hazard.description,
            "latitude": hazard.latitude,
            "longitude": hazard.longitude,
            "radius_meters": hazard.radius_meters,
            "severity": hazard.severity,
            "road_name": hazard.road_name,
            "reporter_name": hazard.reporter_name,
            "reported_at": hazard.reported_at.isoformat(),
            "is_active": hazard.is_active,
            "is_resolved": hazard.is_resolved,
            "review_status": hazard.review_status,
            "image_url": hazard.image_url,
        },
    }


@router.get("/active")
async def active_road_hazards(session: AsyncSession = Depends(get_session)) -> dict:
    await expire_stale_road_hazards(session)
    result = await session.execute(select(RoadHazardReport).where(
        RoadHazardReport.is_active.is_(True),
        RoadHazardReport.is_resolved.is_(False),
        RoadHazardReport.review_status == "approved",
    ))
    return {"type": "FeatureCollection", "features": [road_hazard_feature(hazard) for hazard in result.scalars()]}


@router.post("", status_code=201)
async def report_road_hazard(
    payload: RoadHazardSubmission,
    session: AsyncSession = Depends(get_session),
) -> dict:
    hazard = RoadHazardReport(
        **payload.model_dump(),
        is_active=False,
        is_resolved=False,
        review_status="pending",
    )
    hazard.expires_at = calculate_road_hazard_expiration(hazard.hazard_type, hazard.reported_at)
    session.add(hazard)
    await session.commit()
    await session.refresh(hazard)
    feature = road_hazard_feature(hazard)
    await telemetry_manager.broadcast({"type": "road_hazard_submitted", "id": hazard.id})
    return feature


@router.post("/{hazard_id}/media", status_code=201)
async def upload_road_hazard_media(
    hazard_id: int,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    content_type = (file.content_type or "").lower()
    extension = ROAD_HAZARD_IMAGE_EXTENSIONS.get(content_type)
    if not extension:
        raise HTTPException(status_code=415, detail="Upload a supported image file")

    contents = await file.read(MAX_ROAD_HAZARD_IMAGE_BYTES + 1)
    if len(contents) > MAX_ROAD_HAZARD_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Images must be 25 MB or smaller")
    if not contents:
        raise HTTPException(status_code=400, detail="The selected image is empty")

    result = await session.execute(select(RoadHazardReport).where(RoadHazardReport.id == hazard_id))
    hazard = result.scalar_one_or_none()
    if not hazard:
        raise HTTPException(status_code=404, detail="Road hazard report not found")

    existing_urls = []
    if hazard.image_url:
        try:
            decoded = json.loads(hazard.image_url)
        except (TypeError, json.JSONDecodeError):
            decoded = hazard.image_url
        existing_urls = decoded if isinstance(decoded, list) else [decoded]
        existing_urls = [url for url in existing_urls if isinstance(url, str) and url.strip()]
    if len(existing_urls) >= MAX_ROAD_HAZARD_IMAGES:
        raise HTTPException(status_code=409, detail="A road hazard can have at most 5 photos")

    storage_path = f"road_hazards/{hazard_id}/{uuid4().hex}{extension}"
    supabase_url_parts = urlsplit(settings.SUPABASE_URL)
    if supabase_url_parts.path.rstrip("/") == "/rest/v1":
        supabase_url_parts = supabase_url_parts._replace(path="")
    client = create_client(urlunsplit(supabase_url_parts), settings.SUPABASE_KEY)
    try:
        storage = client.storage.from_(ROAD_HAZARD_MEDIA_BUCKET)
        await run_in_threadpool(lambda: storage.upload(
            storage_path,
            contents,
            file_options={"content-type": content_type, "upsert": "false"},
        ))
        public_url_response = await run_in_threadpool(lambda: storage.get_public_url(storage_path))
        public_url = public_url_response if isinstance(public_url_response, str) else (
            public_url_response.get("publicUrl") or public_url_response.get("public_url")
            if isinstance(public_url_response, dict) else None
        )
        if not public_url:
            raise RuntimeError("Supabase Storage did not return a public URL")
        urls = [*existing_urls, public_url]
        serialized_urls = json.dumps(urls, separators=(",", ":"))
        if len(serialized_urls) > 2048:
            raise RuntimeError("Image URL list exceeds the database column limit")
        hazard.image_url = serialized_urls
        await session.commit()
        await session.refresh(hazard)
    except HTTPException:
        raise
    except Exception as error:
        await session.rollback()
        raise HTTPException(status_code=502, detail="Unable to upload road hazard image") from error
    finally:
        await file.close()

    feature = road_hazard_feature(hazard)
    await telemetry_manager.broadcast({"type": "road_hazard_updated", "data": feature})
    return {"bucket": ROAD_HAZARD_MEDIA_BUCKET, "path": storage_path, "public_url": public_url, "image_url": hazard.image_url}


def _require_dispatcher(credentials: dict) -> None:
    role = str(credentials.get("role", "")).lower().split(".")[-1]
    if role not in {"dispatcher", "admin"}:
        raise HTTPException(status_code=403, detail="Dispatcher account required")


@router.get("/pending")
async def pending_road_hazards(
    credentials: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    _require_dispatcher(credentials)
    result = await session.execute(select(RoadHazardReport).where(
        RoadHazardReport.review_status == "pending",
        RoadHazardReport.is_resolved.is_(False),
    ).order_by(RoadHazardReport.reported_at.desc()))
    return {"type": "FeatureCollection", "features": [road_hazard_feature(hazard) for hazard in result.scalars()]}


class RoadHazardReview(BaseModel):
    approved: bool
    remarks: Optional[str] = Field(default=None, max_length=1000)


@router.patch("/road-reports/{hazard_id}/review")
async def review_road_hazard(
    hazard_id: int,
    payload: RoadHazardReview,
    request: Request,
    credentials: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    _require_dispatcher(credentials)
    result = await session.execute(select(RoadHazardReport).where(RoadHazardReport.id == hazard_id))
    hazard = result.scalar_one_or_none()
    if hazard is None:
        raise HTTPException(status_code=404, detail="Road hazard report not found")
    if hazard.review_status != "pending":
        raise HTTPException(status_code=409, detail="This road hazard has already been reviewed")
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    hazard.review_status = "approved" if payload.approved else "rejected"
    hazard.is_active = payload.approved
    hazard.reviewed_by = str(credentials.get("sub") or "dispatcher")
    hazard.reviewed_at = now
    remarks = (payload.remarks or "").strip()
    if not payload.approved and not remarks:
        raise HTTPException(status_code=422, detail="Rejection remarks are required")
    if payload.approved:
        hazard.expires_at = calculate_road_hazard_expiration(hazard.hazard_type, now)
    record_audit_log(
        session,
        credentials,
        request,
        f"Road hazard {hazard_id} {'approved' if payload.approved else 'rejected'}"
        + (f": {remarks}" if remarks else ""),
    )
    try:
        await session.commit()
    except DBAPIError as error:
        await session.rollback()
        if "statement timeout" in str(error).lower() or "querycanceled" in str(error).lower():
            raise HTTPException(
                status_code=503,
                detail="Hazard review is temporarily busy. Please retry in a few seconds.",
            ) from error
        raise
    await session.refresh(hazard)
    feature = road_hazard_feature(hazard)
    await telemetry_manager.broadcast({"type": "road_hazard_updated", "data": feature})
    return feature


async def _sync_feature_layers(session: Session) -> None:
    if not FEATURES_PATH.exists():
        raise HTTPException(status_code=503, detail="Hazard feature artifact is unavailable")
    with FEATURES_PATH.open(newline="", encoding="utf-8") as file:
        rows = list(csv.DictReader(file))
    # The existing Supabase table was created with TIMESTAMP WITHOUT TIME ZONE.
    updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    values = []
    for row in rows:
        score = float(row["flood_susceptibility_score"])
        level = "high" if score >= 2 / 3 else "medium" if score >= 1 / 3 else "low"
        geometry = {
            "type": "Polygon",
            "coordinates": [[
                [float(row["min_lon"]), float(row["min_lat"])],
                [float(row["max_lon"]), float(row["min_lat"])],
                [float(row["max_lon"]), float(row["max_lat"])],
                [float(row["min_lon"]), float(row["max_lat"])],
                [float(row["min_lon"]), float(row["min_lat"])],
            ]],
        }
        values.append({
            "source_grid_id": row["grid_id"],
            "hazard_type": "flood",
            "hazard_level": level,
            "hazard_score": score,
            "geometry": geometry,
            "is_published": False,
            "source": "UP NOAH",
            "updated_at": updated_at,
        })

    try:
        statement = pg_insert(HazardMapLayer).values(values)
        statement = statement.on_conflict_do_update(
            index_elements=[HazardMapLayer.source_grid_id],
            set_={
                "hazard_level": statement.excluded.hazard_level,
                "hazard_score": statement.excluded.hazard_score,
                "geometry": statement.excluded.geometry,
                "source": statement.excluded.source,
                "updated_at": statement.excluded.updated_at,
            },
        )
        await session.execute(statement)
        await session.commit()
    except (OperationalError, ProgrammingError) as exc:
        await session.rollback()
        raise HTTPException(
            status_code=503,
            detail="Hazard map layers table is not initialized; apply database/migrations/023_create_hazard_map_layers.sql",
        ) from exc


@router.get("/map-layers", response_model=List[HazardMapLayerRead])
async def list_hazard_map_layers(
    status: str = Query(default="published", pattern="^(all|published|unpublished)$"),
    session: Session = Depends(get_session),
):
    await _sync_feature_layers(session)
    query = select(HazardMapLayer).order_by(HazardMapLayer.hazard_score.desc())
    if status == "published":
        query = query.where(HazardMapLayer.is_published.is_(True))
    elif status == "unpublished":
        query = query.where(HazardMapLayer.is_published.is_(False))
    result = await session.execute(query)
    return result.scalars().all()


@router.patch("/{hazard_id}/publish", response_model=HazardMapLayerRead)
async def publish_hazard_map_layer(
    hazard_id: int,
    payload: HazardLayerPublish,
    request: Request,
    credentials: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _require_dispatcher(credentials)
    result = await session.execute(select(HazardMapLayer).where(HazardMapLayer.id == hazard_id))
    layer = result.scalar_one_or_none()
    if not layer:
        raise HTTPException(status_code=404, detail="Hazard map layer not found")
    layer.is_published = payload.is_published
    layer.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    record_audit_log(
        session,
        credentials,
        request,
        f"UP NOAH hazard layer {hazard_id} {'published' if payload.is_published else 'unpublished'}",
    )
    await session.commit()
    await session.refresh(layer)
    return layer

@router.get("/", response_model=List[ReportRead])
async def list_hazards(
    skip: int = 0,
    limit: int = 100,
    severity: Optional[SeverityLevel] = None,
    is_resolved: Optional[bool] = None,
    session: Session = Depends(get_session)
):
    query = select(Report).offset(skip).limit(limit)
    
    if severity:
        query = query.where(Report.severity == severity)
    if is_resolved is not None:
        query = query.where(Report.is_resolved == is_resolved)
    
    result = await session.execute(query)
    reports = result.scalars().all()
    return reports

@router.get("/{report_id}", response_model=ReportRead)
async def get_hazard(report_id: int, session: Session = Depends(get_session)):
    result = await session.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Hazard report not found")
    return report

@router.post("/", response_model=ReportRead)
async def create_hazard(
    report: ReportCreate,
    session: Session = Depends(get_session)
):
    db_report = Report.from_orm(report)
    session.add(db_report)
    await session.commit()
    await session.refresh(db_report)
    return db_report

@router.put("/{report_id}", response_model=ReportRead)
async def update_hazard(
    report_id: int,
    report_update: ReportUpdate,
    session: Session = Depends(get_session)
):
    result = await session.execute(select(Report).where(Report.id == report_id))
    db_report = result.scalar_one_or_none()
    if not db_report:
        raise HTTPException(status_code=404, detail="Hazard report not found")
    
    report_data = report_update.dict(exclude_unset=True)
    for key, value in report_data.items():
        setattr(db_report, key, value)
    
    await session.commit()
    await session.refresh(db_report)
    return db_report

@router.get("/filter/by-severity")
async def filter_by_severity(
    min_severity: SeverityLevel = Query(...),
    session: Session = Depends(get_session)
):
    severity_order = {
        SeverityLevel.LOW: 0,
        SeverityLevel.MEDIUM: 1,
        SeverityLevel.HIGH: 2,
        SeverityLevel.CRITICAL: 3
    }
    
    min_level = severity_order[min_severity]
    result = await session.execute(select(Report))
    reports = result.scalars().all()
    
    filtered = [
        report for report in reports 
        if severity_order.get(report.severity, 0) >= min_level
    ]
    
    return filtered
