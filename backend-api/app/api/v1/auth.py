from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import select
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import func, cast, String
from sqlalchemy.ext.asyncio import AsyncSession

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
from app.models.vehicle import Vehicle
from app.core.mail import send_reset_password_email, send_otp_email
from app.api.websockets.telemetry import manager as telemetry_manager

router = APIRouter()


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


@router.get("/me")
async def get_me(
    credentials: str = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    return {"user": credentials}


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
        status=payload.get("status", RescuerStatus.AVAILABLE),
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
            "status": profile.status.value if profile and hasattr(profile.status, 'value') else (str(profile.status) if profile else RescuerStatus.AVAILABLE.value),
            "current_latitude": profile.current_latitude if profile else None,
            "current_longitude": profile.current_longitude if profile else None,
        }
        for user, profile in rescuer_users
    ]


@router.get("/rescue-units")
async def list_rescue_units(session: AsyncSession = Depends(get_session)):
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
                "center_id": vehicle.center_id,
                "current_location_lat": vehicle.current_location_lat,
                "current_location_lng": vehicle.current_location_lng,
            }
            for vehicle in vehicle_result.scalars().all()
        ],
    }

@router.post("/alerts", response_model=EmergencyAlertRead, status_code=status.HTTP_201_CREATED)
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
        "assigned_rescuer_name": payload.get("assigned_rescuer_name")
    }
    alert = EmergencyAlert.model_validate(alert_data)

    session.add(alert)
    await session.commit()
    await session.refresh(alert)
    await telemetry_manager.broadcast({
        "type": "alert_created",
        "data": EmergencyAlertRead.model_validate(alert).model_dump(mode="json"),
        "timestamp": datetime.now(timezone.utc).timestamp(),
    })
    return alert


@router.get("/alerts", response_model=list[EmergencyAlertRead])
async def list_alerts(session: AsyncSession = Depends(get_session)):
    statement = select(EmergencyAlert).order_by(EmergencyAlert.created_at.desc())
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

    if assigned_user_id:
        # Verify the user exists and has role rescuer
        user_stmt = select(User).where(User.id == assigned_user_id)
        user_res = await session.execute(user_stmt)
        rescuer_user = user_res.scalar_one_or_none()
        if not rescuer_user:
            raise HTTPException(status_code=404, detail="Rescuer user not found")

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

        # The alert field references user.id, so acknowledgement can resolve the profile later.
        payload["assigned_rescuer_id"] = assigned_user_id
        # set a friendly name if not provided
        payload.setdefault("assigned_rescuer_name", rescuer_user.full_name or rescuer_user.username)
        # default status to assigned if caller didn't set it
        payload.setdefault("status", AlertStatus.ASSIGNED)

    for field, value in payload.items():
        if hasattr(alert, field):
            setattr(alert, field, value)

    await session.commit()
    await session.refresh(alert)
    await telemetry_manager.broadcast({
        "type": "alert_updated",
        "data": EmergencyAlertRead.model_validate(alert).model_dump(mode="json"),
        "timestamp": datetime.now(timezone.utc).timestamp(),
    })
    return alert


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
    alert.status = AlertStatus.RESOLVING
    await session.commit()
    await session.refresh(alert)
    await telemetry_manager.broadcast({
        "type": "alert_updated",
        "data": EmergencyAlertRead.model_validate(alert).model_dump(mode="json"),
        "timestamp": datetime.now(timezone.utc).timestamp(),
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
    now = datetime.now(timezone.utc)
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
    now = datetime.now(timezone.utc)
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