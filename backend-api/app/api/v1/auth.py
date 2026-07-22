from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import select
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token, 
    verify_password, 
    get_password_hash,   
    generate_reset_token,
    verify_reset_token,
    generate_otp_code,
)
from app.db.session import get_session
from app.models.user import User, UserRead, UserRole
from app.models.otp import OTPVerification
from app.core.mail import send_reset_password_email, send_otp_email

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
            "role": user.role
        }
    }


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
        is_active=True
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