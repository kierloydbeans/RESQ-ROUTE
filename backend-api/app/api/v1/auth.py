from datetime import datetime, timedelta, timezone
import json
import logging
from typing import Literal
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from starlette.concurrency import run_in_threadpool
from sqlmodel import select
from pydantic import BaseModel, EmailStr, Field as PydanticField, field_validator
from sqlalchemy import func, cast, String
from sqlalchemy.ext.asyncio import AsyncSession
from supabase import create_client

from app.core.security import (
    create_access_token, 
    verify_password, 
    get_password_hash,
    generate_reset_token,
    verify_reset_token,
    generate_otp_code,
    get_current_user,
)
from app.db.session import get_session
from app.models.user import User, UserRead, UserRole
from app.models.otp import OTPVerification
from app.models.rescuer import RescuerProfile, RescuerProfileRead, RescuerStatus
from app.models.emergency_alert import EmergencyAlert, EmergencyAlertRead, AlertStatus
from app.models.emergency_alert_status_report import (
    EmergencyAlertStatusReport,
    EmergencyAlertStatusReportRead,
)
from app.models.vehicle import Vehicle
from app.core.config import settings
from app.core.mail import send_reset_password_email, send_otp_email
from app.api.websockets.telemetry import manager as telemetry_manager

router = APIRouter()
logger = logging.getLogger(__name__)
SOS_ALERT_MEDIA_BUCKET = "sos_alert_media"
MAX_SOS_MEDIA_BYTES = 25 * 1024 * 1024
SOS_MEDIA_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
}
SOS_IMAGE_EXTENSIONS = frozenset(
    extension for content_type, extension in SOS_MEDIA_EXTENSIONS.items() if content_type.startswith("image/")
)
SOS_VIDEO_EXTENSIONS = frozenset(
    extension for content_type, extension in SOS_MEDIA_EXTENSIONS.items() if content_type.startswith("video/")
)


def _utc_isoformat(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat()


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class SendOTPRequest(BaseModel):
    email: EmailStr


class UserRegisterWithOTP(BaseModel):
    username: str
    email: EmailStr
    password: str
    otp_code: str
    full_name: str | None = None
    role: UserRole = UserRole.CITIZEN

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, v: str) -> str:
        if isinstance(v, str):
            return v.lower()
        return v

# --- ENDPOINTS ---

class LoginRequest(BaseModel):
    username: str
    password: str
    role: str


class EmergencyAlertCreated(EmergencyAlertRead):
    media_upload_token: str


class EmergencyAlertStatusReportCreate(BaseModel):
    report_type: Literal["resolving", "going_to_evacuation_center", "resolved", "need_backup", "other"]
    message: str = PydanticField(default="", max_length=1000)
    additional_notes: str | None = PydanticField(default=None, max_length=2000)


class RescuerPostAlertStatusUpdate(BaseModel):
    status: Literal["available", "recovering"]


RESCUER_RECOVERY_DURATION = timedelta(minutes=30)
RESCUER_PRESENCE_TIMEOUT = timedelta(minutes=2)


async def _get_or_create_rescuer_profile(session: AsyncSession, user: User) -> RescuerProfile:
    result = await session.execute(select(RescuerProfile).where(RescuerProfile.user_id == user.id))
    profile = result.scalar_one_or_none()
    if profile is None:
        profile = RescuerProfile(user_id=user.id, status=RescuerStatus.OFF_DUTY)
        session.add(profile)
        await session.flush()
    return profile


async def _mark_rescuer_online(session: AsyncSession, user: User) -> RescuerProfile:
    profile = await _get_or_create_rescuer_profile(session, user)
    now = datetime.utcnow()
    active_alert_result = await session.execute(
        select(EmergencyAlert.status)
        .where(
            EmergencyAlert.assigned_rescuer_id == user.id,
            EmergencyAlert.status != AlertStatus.CLOSED,
        )
        .order_by(EmergencyAlert.created_at.asc())
        .limit(1)
    )
    active_alert_status = active_alert_result.scalar_one_or_none()
    if active_alert_status is not None:
        profile.status = (
            RescuerStatus.IN_TRANSIT
            if active_alert_status in {AlertStatus.RESOLVING, AlertStatus.EVACUATING}
            else RescuerStatus.ASSIGNED
        )
    elif profile.recovering_until and profile.recovering_until > now:
        profile.status = RescuerStatus.RECOVERING
    else:
        profile.status = RescuerStatus.AVAILABLE
        profile.recovering_until = None
    profile.last_seen_at = now
    profile.updated_at = now
    await session.commit()
    await session.refresh(profile)
    await telemetry_manager.broadcast({
        "type": "rescuer_status_updated",
        "data": {
            "rescuer_id": user.id,
            "status": profile.status.value,
            "recovering_until": _utc_isoformat(profile.recovering_until),
        },
        "timestamp": now.timestamp(),
    })
    return profile


async def _mark_stale_rescuers_off_duty(session: AsyncSession) -> None:
    cutoff = datetime.utcnow() - RESCUER_PRESENCE_TIMEOUT
    result = await session.execute(
        select(RescuerProfile).where(
            RescuerProfile.last_seen_at.is_not(None),
            RescuerProfile.last_seen_at < cutoff,
            RescuerProfile.status != RescuerStatus.OFF_DUTY,
        )
    )
    stale_profiles = result.scalars().all()
    if not stale_profiles:
        return
    for profile in stale_profiles:
        profile.status = RescuerStatus.OFF_DUTY
        profile.updated_at = datetime.utcnow()
    await session.commit()
    for profile in stale_profiles:
        await telemetry_manager.broadcast({
            "type": "rescuer_status_updated",
            "data": {"rescuer_id": profile.user_id, "status": RescuerStatus.OFF_DUTY.value},
            "timestamp": datetime.utcnow().timestamp(),
        })


@router.post("/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_session)
):
    statement = select(User).where(User.username == form_data.username)
    result = await session.execute(statement)
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    if user.role == UserRole.RESCUER:
        await _mark_rescuer_online(session, user)

    access_token = create_access_token(data={"sub": user.username, "role": user.role})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role)
        }
    }


@router.post("/login-role")
async def login_role(
    payload: LoginRequest,
    session: AsyncSession = Depends(get_session)
):
    statement = select(User).where(User.username == payload.username)
    result = await session.execute(statement)
    user = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive")

    requested_role = payload.role.lower()
    if user.role.value != requested_role:
        raise HTTPException(status_code=403, detail=f"This account is not registered as a {requested_role}")

    if user.role == UserRole.RESCUER:
        await _mark_rescuer_online(session, user)

    access_token = create_access_token(data={"sub": user.username, "role": user.role})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role)
        }
    }


@router.post("/logout")
async def logout_rescuer(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    user_result = await session.execute(select(User).where(User.username == current_user.get("sub")))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User account not found")
    if user.role == UserRole.RESCUER:
        profile = await _get_or_create_rescuer_profile(session, user)
        profile.status = RescuerStatus.OFF_DUTY
        profile.last_seen_at = datetime.utcnow()
        profile.updated_at = datetime.utcnow()
        await session.commit()
        await telemetry_manager.broadcast({
            "type": "rescuer_status_updated",
            "data": {"rescuer_id": user.id, "status": RescuerStatus.OFF_DUTY.value},
            "timestamp": datetime.utcnow().timestamp(),
        })
    return {"success": True}


@router.get("/me")
async def get_me(
    credentials: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    result = await session.execute(
        select(User).where(User.username == credentials.get("sub"))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User account not found")
    return {"user": UserRead.model_validate(user)}


@router.post("/rescuers", response_model=RescuerProfileRead, status_code=status.HTTP_201_CREATED)
async def create_rescuer_profile(
    payload: dict,
    session: AsyncSession = Depends(get_session)
):
    statement = select(User).where(User.id == payload.get("user_id"))
    result = await session.execute(statement)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role != UserRole.RESCUER:
        raise HTTPException(status_code=400, detail="Only rescuer accounts can have a rescue profile")

    existing_statement = select(RescuerProfile).where(RescuerProfile.user_id == payload.get("user_id"))
    existing_result = await session.execute(existing_statement)
    if existing_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Rescuer profile already exists")

    rescuer_profile = RescuerProfile(
        user_id=payload.get("user_id"),
        status=RescuerStatus.OFF_DUTY,
        station_name=payload.get("station_name"),
        phone=payload.get("phone"),
        current_latitude=payload.get("current_latitude"),
        current_longitude=payload.get("current_longitude")
    )
    session.add(rescuer_profile)
    await session.commit()
    await session.refresh(rescuer_profile)
    return rescuer_profile


@router.get("/rescuers")
async def list_rescuers(session: AsyncSession = Depends(get_session)):
    await _mark_stale_rescuers_off_duty(session)
    statement = select(User, RescuerProfile).outerjoin(
        RescuerProfile, RescuerProfile.user_id == User.id
    ).where(
        func.lower(cast(User.role, String)) == "rescuer"
    )

    result = await session.execute(statement)
    rescuer_users = result.all()

    return [
        {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "display_name": user.full_name or user.username,
            "email": user.email,
            "role": user.role.value if hasattr(user.role, 'value') else str(user.role),
            "status": profile.status.value if profile and hasattr(profile.status, 'value') else (str(profile.status) if profile else RescuerStatus.OFF_DUTY.value),
            "current_latitude": profile.current_latitude if profile else None,
            "current_longitude": profile.current_longitude if profile else None,
        }
        for user, profile in rescuer_users
    ]


@router.get("/rescuers/me/status")
async def get_my_rescuer_status(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    user_result = await session.execute(select(User).where(User.username == current_user.get("sub")))
    user = user_result.scalar_one_or_none()
    if not user or user.role != UserRole.RESCUER:
        raise HTTPException(status_code=403, detail="Rescuer account required")

    profile_result = await session.execute(select(RescuerProfile).where(RescuerProfile.user_id == user.id))
    profile = profile_result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Rescuer profile not found")

    now = datetime.utcnow()
    if profile.status == RescuerStatus.RECOVERING and profile.recovering_until and profile.recovering_until <= now:
        profile.status = RescuerStatus.AVAILABLE
        profile.recovering_until = None
        profile.updated_at = now
        await session.commit()
        await telemetry_manager.broadcast({
            "type": "rescuer_status_updated",
            "data": {
                "rescuer_id": user.id,
                "status": RescuerStatus.AVAILABLE.value,
                "recovering_until": None,
            },
            "timestamp": now.timestamp(),
        })

    latest_closed_result = await session.execute(
        select(EmergencyAlert)
        .where(
            EmergencyAlert.assigned_rescuer_id == user.id,
            EmergencyAlert.status == AlertStatus.CLOSED,
        )
        .order_by(EmergencyAlert.updated_at.desc(), EmergencyAlert.id.desc())
        .limit(1)
    )
    latest_closed_alert = latest_closed_result.scalar_one_or_none()
    active_alert_result = await session.execute(
        select(EmergencyAlert.status)
        .where(
            EmergencyAlert.assigned_rescuer_id == user.id,
            EmergencyAlert.status != AlertStatus.CLOSED,
        )
        .limit(1)
    )
    has_active_alert = active_alert_result.scalar_one_or_none() is not None
    pending_status_choice = (
        latest_closed_alert
        if latest_closed_alert
        and not has_active_alert
        and profile.status in {RescuerStatus.ASSIGNED, RescuerStatus.IN_TRANSIT}
        else None
    )
    return {
        "status": profile.status.value if hasattr(profile.status, "value") else str(profile.status),
        "recovering_until": _utc_isoformat(profile.recovering_until),
        "pending_alert": EmergencyAlertRead.model_validate(pending_status_choice).model_dump(mode="json")
        if pending_status_choice
        else None,
    }


@router.post("/rescuers/me/presence")
async def update_my_rescuer_presence(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    user_result = await session.execute(select(User).where(User.username == current_user.get("sub")))
    user = user_result.scalar_one_or_none()
    if not user or user.role != UserRole.RESCUER:
        raise HTTPException(status_code=403, detail="Rescuer account required")

    profile = await _get_or_create_rescuer_profile(session, user)
    now = datetime.utcnow()
    status_changed = False
    active_alert_result = await session.execute(
        select(EmergencyAlert.status)
        .where(
            EmergencyAlert.assigned_rescuer_id == user.id,
            EmergencyAlert.status != AlertStatus.CLOSED,
        )
        .order_by(EmergencyAlert.created_at.asc())
        .limit(1)
    )
    active_alert_status = active_alert_result.scalar_one_or_none()
    if active_alert_status is not None:
        next_status = (
            RescuerStatus.IN_TRANSIT
            if active_alert_status in {AlertStatus.RESOLVING, AlertStatus.EVACUATING}
            else RescuerStatus.ASSIGNED
        )
        status_changed = profile.status != next_status
        profile.status = next_status
    elif profile.recovering_until and profile.recovering_until <= now:
        profile.recovering_until = None
        if profile.status in {RescuerStatus.RECOVERING, RescuerStatus.OFF_DUTY}:
            profile.status = RescuerStatus.AVAILABLE
            status_changed = True
    elif profile.status == RescuerStatus.OFF_DUTY:
        profile.status = (
            RescuerStatus.RECOVERING
            if profile.recovering_until and profile.recovering_until > now
            else RescuerStatus.AVAILABLE
        )
        if profile.status == RescuerStatus.AVAILABLE:
            profile.recovering_until = None
        status_changed = True
    profile.last_seen_at = now
    profile.updated_at = now
    await session.commit()
    if status_changed:
        await telemetry_manager.broadcast({
            "type": "rescuer_status_updated",
            "data": {
                "rescuer_id": user.id,
                "status": profile.status.value,
                "recovering_until": _utc_isoformat(profile.recovering_until),
            },
            "timestamp": now.timestamp(),
        })
    return {
        "status": profile.status.value,
        "recovering_until": _utc_isoformat(profile.recovering_until),
    }


@router.patch("/rescuers/me/status")
async def update_my_rescuer_status(
    payload: RescuerPostAlertStatusUpdate,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    user_result = await session.execute(select(User).where(User.username == current_user.get("sub")))
    user = user_result.scalar_one_or_none()
    if not user or user.role != UserRole.RESCUER:
        raise HTTPException(status_code=403, detail="Rescuer account required")

    profile_result = await session.execute(select(RescuerProfile).where(RescuerProfile.user_id == user.id))
    profile = profile_result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Rescuer profile not found")

    active_alert_result = await session.execute(
        select(EmergencyAlert.id)
        .where(
            EmergencyAlert.assigned_rescuer_id == user.id,
            EmergencyAlert.status != AlertStatus.CLOSED,
        )
        .limit(1)
    )
    if active_alert_result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Finish the active assignment before changing availability")
    now = datetime.utcnow()
    if payload.status == RescuerStatus.RECOVERING.value:
        if profile.status not in {RescuerStatus.ASSIGNED, RescuerStatus.IN_TRANSIT}:
            raise HTTPException(status_code=409, detail="There is no completed assignment awaiting an availability choice")
        latest_closed_result = await session.execute(
            select(EmergencyAlert.id)
            .where(
                EmergencyAlert.assigned_rescuer_id == user.id,
                EmergencyAlert.status == AlertStatus.CLOSED,
            )
            .order_by(EmergencyAlert.updated_at.desc(), EmergencyAlert.id.desc())
            .limit(1)
        )
        if latest_closed_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=409, detail="There is no completed assignment awaiting an availability choice")
        profile.status = RescuerStatus.RECOVERING
        profile.recovering_until = now + RESCUER_RECOVERY_DURATION
    elif profile.status == RescuerStatus.RECOVERING:
        profile.status = RescuerStatus.AVAILABLE
        profile.recovering_until = None
    elif profile.status in {RescuerStatus.ASSIGNED, RescuerStatus.IN_TRANSIT}:
        latest_closed_result = await session.execute(
            select(EmergencyAlert.id)
            .where(
                EmergencyAlert.assigned_rescuer_id == user.id,
                EmergencyAlert.status == AlertStatus.CLOSED,
            )
            .order_by(EmergencyAlert.updated_at.desc(), EmergencyAlert.id.desc())
            .limit(1)
        )
        if latest_closed_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=409, detail="There is no completed assignment awaiting an availability choice")
        profile.status = RescuerStatus.AVAILABLE
        profile.recovering_until = None
    else:
        raise HTTPException(status_code=409, detail="Rescuer availability cannot be changed at this time")
    profile.last_seen_at = now
    profile.updated_at = now
    await session.commit()
    await session.refresh(profile)

    await telemetry_manager.broadcast({
        "type": "rescuer_status_updated",
        "data": {
            "rescuer_id": user.id,
            "status": profile.status.value,
            "recovering_until": _utc_isoformat(profile.recovering_until),
        },
        "timestamp": datetime.utcnow().timestamp(),
    })
    return {
        "status": profile.status.value,
        "recovering_until": _utc_isoformat(profile.recovering_until),
    }


@router.get("/rescue-units")
async def list_rescue_units(session: AsyncSession = Depends(get_session)):
    await _mark_stale_rescuers_off_duty(session)
    profile_result = await session.execute(
        select(RescuerProfile, User)
        .join(User, RescuerProfile.user_id == User.id)
        .where(User.role == UserRole.RESCUER)
    )
    vehicle_result = await session.execute(select(Vehicle))
    alert_result = await session.execute(select(EmergencyAlert))
    rescuer_profiles = profile_result.all()
    alerts = alert_result.scalars().all()
    dispatched_count = sum(
        1 for profile, _user in rescuer_profiles
        if (profile.status.value if hasattr(profile.status, "value") else str(profile.status)).lower() == "in_transit"
    )

    return {
        "rescuer_count": len(rescuer_profiles),
        "dispatched_count": dispatched_count,
        "closed_alert_count": sum(
            1 for alert in alerts
            if (alert.status.value if hasattr(alert.status, "value") else str(alert.status)).lower() == "closed"
        ),
        "rescuers": [
            {
                "id": profile.id,
                "user_id": profile.user_id,
                    "status": profile.status.value if hasattr(profile.status, "value") else str(profile.status),
                    "username": user.username,
                    "full_name": user.full_name,
                    "email": user.email,
                "station_name": profile.station_name,
                "phone": profile.phone,
                "current_latitude": profile.current_latitude,
                "current_longitude": profile.current_longitude,
            }
            for profile, user in rescuer_profiles
        ],
        "vehicles": [
            {
                "id": vehicle.id,
                "plate_number": vehicle.plate_number,
                "vehicle_type": vehicle.vehicle_type,
                "driver_name": vehicle.driver_name,
                "capacity": vehicle.capacity,
                "status": vehicle.status,
                "rescuer_onboard": vehicle.rescuer_onboard,
                "center_id": vehicle.center_id,
                "current_location_lat": vehicle.current_location_lat,
                "current_location_lng": vehicle.current_location_lng,
            }
            for vehicle in vehicle_result.scalars().all()
        ],
    }

@router.post("/alerts", response_model=EmergencyAlertCreated, status_code=status.HTTP_201_CREATED)
async def create_alert(
    payload: dict,
    session: AsyncSession = Depends(get_session)
):
    statement = select(User).where(User.id == payload.get("sender_id"))
    result = await session.execute(statement)
    sender = result.scalar_one_or_none()
    if not sender:
        raise HTTPException(status_code=404, detail="Sender not found")

    alert_data = {
        "sender_id": sender.id,
        "sender_name": payload.get("sender_name", sender.full_name or sender.username),
        "sender_role": payload.get("sender_role", sender.role.value if hasattr(sender.role, 'value') else str(sender.role)),
        "latitude": payload.get("latitude"),
        "longitude": payload.get("longitude"),
        "disaster_type": payload.get("disaster_type", "other"),
        "severity": payload.get("severity", "high"),
        "message": payload.get("message", "Emergency alert"),
        "status": payload.get("status", AlertStatus.PENDING),
        "assigned_rescuer_id": payload.get("assigned_rescuer_id"),
        "assigned_rescuer_name": payload.get("assigned_rescuer_name"),
        "assigned_vehicle_ids": payload.get("assigned_vehicle_ids")
    }
    alert = EmergencyAlert.model_validate(alert_data)

    session.add(alert)
    await session.commit()
    await session.refresh(alert)
    await telemetry_manager.broadcast({
        "type": "alert_created",
        "data": EmergencyAlertRead.model_validate(alert).model_dump(mode="json"),
        "timestamp": datetime.utcnow().timestamp(),
    })
    alert_data = EmergencyAlertRead.model_validate(alert).model_dump()
    return {
        **alert_data,
        "media_upload_token": create_access_token(
            {
                "sub": sender.username,
                "token_use": "sos_alert_media",
                "alert_id": alert.id,
                "sender_id": alert.sender_id,
            },
            expires_delta=timedelta(hours=2),
        ),
    }


@router.post("/alerts/{alert_id}/media", status_code=status.HTTP_201_CREATED)
async def upload_alert_media(
    alert_id: int,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    content_type = (file.content_type or "").lower()
    extension = SOS_MEDIA_EXTENSIONS.get(content_type)
    if not extension:
        raise HTTPException(status_code=415, detail="Upload a supported image or video file")

    contents = await file.read(MAX_SOS_MEDIA_BYTES + 1)
    if len(contents) > MAX_SOS_MEDIA_BYTES:
        raise HTTPException(status_code=413, detail="Media files must be 25 MB or smaller")
    if not contents:
        raise HTTPException(status_code=400, detail="The selected media file is empty")

    alert_result = await session.execute(select(EmergencyAlert).where(EmergencyAlert.id == alert_id))
    alert = alert_result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="SOS alert not found")
    if current_user.get("token_use") == "sos_alert_media":
        if current_user.get("alert_id") != alert_id or current_user.get("sender_id") != alert.sender_id:
            raise HTTPException(status_code=403, detail="This upload token is not valid for this SOS alert")
    else:
        user_result = await session.execute(select(User).where(User.username == current_user.get("sub")))
        user = user_result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="User account not found")
        if alert.sender_id != user.id:
            raise HTTPException(status_code=403, detail="You can only upload media to your own SOS alert")

    storage_path = f"{alert_id}/{uuid4().hex}{extension}"
    supabase_url_parts = urlsplit(settings.SUPABASE_URL)
    supabase_url_path = supabase_url_parts.path.rstrip("/")
    if supabase_url_path == "/rest/v1":
        supabase_url_parts = supabase_url_parts._replace(path="")
    client = create_client(urlunsplit(supabase_url_parts), settings.SUPABASE_KEY)
    storage_stage = "listing existing media"
    try:
        storage = client.storage.from_(SOS_ALERT_MEDIA_BUCKET)
        stored_objects = await run_in_threadpool(lambda: storage.list(str(alert_id)))
        stored_names = [
            str(item.get("name", "")) if isinstance(item, dict) else str(getattr(item, "name", ""))
            for item in stored_objects
        ]
        stored_image_count = sum(any(name.lower().endswith(ext) for ext in SOS_IMAGE_EXTENSIONS) for name in stored_names)
        stored_video_count = sum(any(name.lower().endswith(ext) for ext in SOS_VIDEO_EXTENSIONS) for name in stored_names)
        if content_type.startswith("image/") and stored_image_count >= 5:
            raise HTTPException(status_code=409, detail="An SOS alert can have at most 5 photos")
        if content_type.startswith("video/") and stored_video_count >= 1:
            raise HTTPException(status_code=409, detail="An SOS alert can have at most 1 video")
        storage_stage = "uploading media"
        await run_in_threadpool(
            lambda: storage.upload(
                storage_path,
                contents,
                file_options={"content-type": content_type, "upsert": "false"},
            )
        )
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Supabase Storage %s failed for SOS alert %s", storage_stage, alert_id)
        raise HTTPException(status_code=502, detail="Unable to upload media to Supabase Storage") from error
    finally:
        await file.close()

    return {"bucket": SOS_ALERT_MEDIA_BUCKET, "path": storage_path, "content_type": content_type}


@router.get("/alerts", response_model=list[EmergencyAlertRead])
async def list_alerts(session: AsyncSession = Depends(get_session)):
    statement = select(EmergencyAlert).order_by(EmergencyAlert.created_at.desc())
    result = await session.execute(statement)
    return result.scalars().all()


@router.get("/alerts/assigned-to-me", response_model=list[EmergencyAlertRead])
async def list_assigned_alerts(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    user_result = await session.execute(
        select(User).where(User.username == current_user.get("sub"))
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User account not found")
    if user.role != UserRole.RESCUER:
        raise HTTPException(status_code=403, detail="Rescuer account required")

    statement = (
        select(EmergencyAlert)
        .where(
            EmergencyAlert.assigned_rescuer_id == user.id,
            EmergencyAlert.status != AlertStatus.CLOSED,
        )
        .order_by(
            (EmergencyAlert.severity == "critical").desc(),
            EmergencyAlert.created_at.asc(),
            EmergencyAlert.id.asc(),
        )
    )
    result = await session.execute(statement)
    return result.scalars().all()


@router.patch("/alerts/{alert_id}")
async def update_alert(
    alert_id: int, 
    payload: dict, 
    session: AsyncSession = Depends(get_session)
):
    statement = select(EmergencyAlert).where(EmergencyAlert.id == alert_id)
    result = await session.execute(statement)
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    assigned_user_id = payload.get("assigned_rescuer_id")
    assigned_vehicle_ids = payload.get("assigned_vehicle_ids")
    rescuer_user = None

    if assigned_user_id:
        # Verify the user exists and has role rescuer
        user_stmt = select(User).where(User.id == assigned_user_id)
        user_res = await session.execute(user_stmt)
        rescuer_user = user_res.scalar_one_or_none()
        if not rescuer_user:
            raise HTTPException(status_code=404, detail="Rescuer user not found")
        if rescuer_user.role != UserRole.RESCUER:
            raise HTTPException(status_code=400, detail="Assignments must target a rescuer")

        # Ensure a RescuerProfile exists for this user (create if missing).
        profile_stmt = select(RescuerProfile).where(RescuerProfile.user_id == assigned_user_id)
        profile_res = await session.execute(profile_stmt)
        rescuer_profile = profile_res.scalar_one_or_none()
        if not rescuer_profile:
            rescuer_profile = RescuerProfile(
                user_id=assigned_user_id,
                status=RescuerStatus.AVAILABLE,
                station_name="Default Station"
            )
            session.add(rescuer_profile)
            await session.commit()
            await session.refresh(rescuer_profile)
        effective_severity = str(payload.get("severity", alert.severity) or "").lower()
        if rescuer_profile.status == RescuerStatus.RECOVERING and effective_severity != "critical":
            raise HTTPException(status_code=409, detail="This rescuer is recovering; only a critical alert can override this status")
        if rescuer_profile.status == RescuerStatus.OFF_DUTY:
            raise HTTPException(status_code=409, detail="This rescuer is off duty")
        rescuer_profile.status = RescuerStatus.ASSIGNED
        rescuer_profile.recovering_until = None

        # The alert field references user.id, so acknowledgement can resolve the profile later.
        payload["assigned_rescuer_id"] = assigned_user_id
        # set a friendly name if not provided
        payload.setdefault("assigned_rescuer_name", rescuer_user.full_name or rescuer_user.username)
        # default status to assigned if caller didn't set it
        payload.setdefault("status", AlertStatus.ASSIGNED)

    try:
        vehicle_ids = [int(vehicle_id) for vehicle_id in json.loads(assigned_vehicle_ids or "[]")]
    except (TypeError, ValueError, json.JSONDecodeError):
        vehicle_ids = []
    if vehicle_ids:
        vehicle_result = await session.execute(select(Vehicle).where(Vehicle.id.in_(vehicle_ids)))
        for vehicle in vehicle_result.scalars().all():
            vehicle.status = "assigned"
            vehicle.rescuer_onboard = rescuer_user.full_name or rescuer_user.username if rescuer_user else None

    for field, value in payload.items():
        if hasattr(alert, field):
            setattr(alert, field, value)

    requested_status = payload.get("status")
    if requested_status is not None:
        normalized_status = requested_status.value if isinstance(requested_status, AlertStatus) else str(requested_status)
        if normalized_status.lower() == AlertStatus.CLOSED.value:
            alert.updated_at = datetime.utcnow()

    await session.commit()
    await session.refresh(alert)
    await telemetry_manager.broadcast({
        "type": "alert_updated",
        "data": EmergencyAlertRead.model_validate(alert).model_dump(mode="json"),
        "timestamp": datetime.utcnow().timestamp(),
    })
    return alert


@router.post(
    "/alerts/{alert_id}/status-reports",
    response_model=EmergencyAlertStatusReportRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_alert_status_report(
    alert_id: int,
    payload: EmergencyAlertStatusReportCreate,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    user_result = await session.execute(select(User).where(User.username == current_user.get("sub")))
    user = user_result.scalar_one_or_none()
    if not user or user.role != UserRole.RESCUER:
        raise HTTPException(status_code=403, detail="Rescuer account required")

    alert_result = await session.execute(select(EmergencyAlert).where(EmergencyAlert.id == alert_id))
    alert = alert_result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.assigned_rescuer_id != user.id:
        raise HTTPException(status_code=403, detail="This alert is not assigned to you")
    if alert.status == AlertStatus.CLOSED:
        raise HTTPException(status_code=409, detail="This alert is already closed")

    report_type = payload.report_type.strip().lower()
    message = payload.message.strip()
    if report_type == "resolving":
        message = message or "Rescuer marked the alert as resolving."
        alert.status = AlertStatus.RESOLVING
        alert.updated_at = datetime.utcnow()
    elif report_type == "going_to_evacuation_center":
        if alert.status != AlertStatus.RESOLVING:
            raise HTTPException(status_code=409, detail="Mark the alert as resolving before going to an evacuation center")
        message = message or "Rescuer is going to the evacuation center."
        alert.status = AlertStatus.EVACUATING
        alert.updated_at = datetime.utcnow()
    elif report_type == "resolved":
        if alert.status != AlertStatus.EVACUATING:
            raise HTTPException(status_code=409, detail="Mark the alert as going to an evacuation center before resolving it")
        message = message or "Rescuer marked the alert as resolved."
        alert.status = AlertStatus.CLOSED
        alert.updated_at = datetime.utcnow()
    elif report_type == "need_backup":
        message = message or "Rescuer requested backup."
    elif not message:
        raise HTTPException(status_code=422, detail="A description is required for an other report")

    report = EmergencyAlertStatusReport(
        alert_id=alert.id,
        reporter_id=user.id,
        reporter_name=user.full_name or user.username,
        report_type=report_type,
        message=message,
        additional_notes=payload.additional_notes.strip() if payload.additional_notes else None,
        created_at=datetime.utcnow(),
    )
    session.add(report)
    await session.commit()
    await session.refresh(report)

    await telemetry_manager.broadcast({
        "type": "alert_status_report_updated",
        "data": {"report_id": report.id},
        "timestamp": datetime.utcnow().timestamp(),
    })

    if report_type in {"resolving", "going_to_evacuation_center", "resolved"}:
        await session.refresh(alert)
        await telemetry_manager.broadcast({
            "type": "alert_updated",
            "data": EmergencyAlertRead.model_validate(alert).model_dump(mode="json"),
            "timestamp": datetime.utcnow().timestamp(),
        })
    return report


@router.get(
    "/alerts/status-reports/recent",
    response_model=list[EmergencyAlertStatusReportRead],
)
async def get_recent_alert_status_reports(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    user_result = await session.execute(select(User).where(User.username == current_user.get("sub")))
    user = user_result.scalar_one_or_none()
    if not user or user.role not in {UserRole.DISPATCHER, UserRole.ADMIN}:
        raise HTTPException(status_code=403, detail="Dispatcher account required")

    result = await session.execute(
        select(EmergencyAlertStatusReport)
        .order_by(EmergencyAlertStatusReport.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()


@router.get(
    "/alerts/status-reports/{report_id}",
    response_model=EmergencyAlertStatusReportRead,
)
async def get_alert_status_report(
    report_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    user_result = await session.execute(select(User).where(User.username == current_user.get("sub")))
    user = user_result.scalar_one_or_none()
    if not user or user.role not in {UserRole.DISPATCHER, UserRole.ADMIN}:
        raise HTTPException(status_code=403, detail="Dispatcher account required")

    report_result = await session.execute(
        select(EmergencyAlertStatusReport).where(EmergencyAlertStatusReport.id == report_id)
    )
    report = report_result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Status report not found")
    return report


@router.get(
    "/alerts/{alert_id}/status-reports",
    response_model=list[EmergencyAlertStatusReportRead],
)
async def list_alert_status_reports(
    alert_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    user_result = await session.execute(select(User).where(User.username == current_user.get("sub")))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User account not found")

    alert_result = await session.execute(select(EmergencyAlert).where(EmergencyAlert.id == alert_id))
    alert = alert_result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    is_dispatcher = user.role in {UserRole.DISPATCHER, UserRole.ADMIN}
    is_assigned_rescuer = user.role == UserRole.RESCUER and alert.assigned_rescuer_id == user.id
    if not is_dispatcher and not is_assigned_rescuer:
        raise HTTPException(status_code=403, detail="You cannot view reports for this alert")

    result = await session.execute(
        select(EmergencyAlertStatusReport)
        .where(EmergencyAlertStatusReport.alert_id == alert_id)
        .order_by(EmergencyAlertStatusReport.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: int,
    payload: dict,
    session: AsyncSession = Depends(get_session)
):
    statement = select(EmergencyAlert).where(EmergencyAlert.id == alert_id)
    result = await session.execute(statement)
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    rescuer_user_id = payload.get("user_id")
    if alert.assigned_rescuer_id != rescuer_user_id:
        raise HTTPException(status_code=403, detail="This alert is assigned to another rescuer")

    profile_statement = select(RescuerProfile).where(RescuerProfile.user_id == rescuer_user_id)
    profile_result = await session.execute(profile_statement)
    profile = profile_result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Rescuer profile not found")

    profile.status = RescuerStatus.IN_TRANSIT
    try:
        vehicle_ids = [int(vehicle_id) for vehicle_id in json.loads(alert.assigned_vehicle_ids or "[]")]
    except (TypeError, ValueError, json.JSONDecodeError):
        vehicle_ids = []
    if vehicle_ids:
        vehicle_result = await session.execute(select(Vehicle).where(Vehicle.id.in_(vehicle_ids)))
        for vehicle in vehicle_result.scalars().all():
            vehicle.status = "in_transit"
    alert.status = AlertStatus.RESOLVING
    await session.commit()
    await session.refresh(alert)
    await telemetry_manager.broadcast({
        "type": "alert_updated",
        "data": EmergencyAlertRead.model_validate(alert).model_dump(mode="json"),
        "timestamp": datetime.utcnow().timestamp(),
    })
    return alert

@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserRegisterWithOTP,
    session: AsyncSession = Depends(get_session)
):
    # 1. Fetch OTP record
    statement = select(OTPVerification).where(OTPVerification.email == user_data.email)
    result = await session.execute(statement)
    otp_record = result.scalar_one_or_none()

    if not otp_record or otp_record.otp_code != user_data.otp_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code."
        )

    # Timezone-safe UTC check
    now = datetime.utcnow()
    record_expiry = otp_record.expires_at
    if record_expiry.tzinfo is not None:
        record_expiry = record_expiry.replace(tzinfo=None)

    if now > record_expiry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired. Please request a new one."
        )

    # 2. Check for username uniqueness
    statement = select(User).where(User.username == user_data.username)
    result = await session.execute(statement)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered."
        )

    # 3. Check for email uniqueness
    statement = select(User).where(User.email == user_data.email)
    result = await session.execute(statement)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered."
        )

    # 4. Save user and cleanup consumed OTP record
    db_user = User(
        username=user_data.username,
        email=user_data.email,
        full_name=user_data.full_name,
        role=user_data.role,
        hashed_password=get_password_hash(user_data.password),
        is_active=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )
    
    session.add(db_user)
    await session.delete(otp_record)
    
    await session.commit()
    await session.refresh(db_user)
    
    return db_user


@router.post("/send-otp", status_code=status.HTTP_200_OK)
async def send_otp(
    payload: SendOTPRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session)
):
    # 1. Prevent duplicate registrations upfront
    statement = select(User).where(User.email == payload.email)
    result = await session.execute(statement)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already registered."
        )

    # 2. Generate 6-digit OTP code valid for 10 minutes
    otp_code = generate_otp_code()
    now = datetime.utcnow()
    expires_at = now + timedelta(minutes=10)

    # 3. Create or update the pending OTP record
    statement = select(OTPVerification).where(OTPVerification.email == payload.email)
    result = await session.execute(statement)
    existing_otp = result.scalar_one_or_none()

    if existing_otp:
        existing_otp.otp_code = otp_code
        existing_otp.expires_at = expires_at
        existing_otp.created_at = now
        existing_otp.is_verified = False
        session.add(existing_otp)
    else:
        new_otp = OTPVerification(
            email=payload.email,
            otp_code=otp_code,
            expires_at=expires_at,
            created_at=now,
            is_verified=False
        )
        session.add(new_otp)

    await session.commit()

    # 4. Dispatch email asynchronously
    background_tasks.add_task(send_otp_email, email_to=payload.email, otp_code=otp_code)

    return {"message": "Verification code sent to your email."}


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
async def forgot_password(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session)
):
    # 1. Check if user exists
    statement = select(User).where(User.email == payload.email)
    result = await session.execute(statement)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No user found with this email address."
        )

    # 2. Generate password reset token
    token = generate_reset_token(user.email)

    # 3. Dispatch reset email asynchronously
    background_tasks.add_task(send_reset_password_email, email_to=user.email, token=token)

    return {"message": "Password reset instructions sent to your email."}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def reset_password(
    payload: ResetPasswordRequest,
    session: AsyncSession = Depends(get_session)
):
    # 1. Verify reset token and retrieve email
    email = verify_reset_token(payload.token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token."
        )

    # 2. Fetch user
    statement = select(User).where(User.email == email)
    result = await session.execute(statement)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )

    # 3. Update user password
    user.hashed_password = get_password_hash(payload.new_password)
    session.add(user)
    await session.commit()

    return {"message": "Password successfully updated."}
