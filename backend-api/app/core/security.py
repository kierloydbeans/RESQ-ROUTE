from datetime import datetime, timedelta
from typing import Optional
import bcrypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadTimeSignature
from .config import settings
import secrets

security = HTTPBearer()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    plain_bytes = plain_password.encode('utf-8')
    hashed_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(plain_bytes, hashed_bytes)

def get_password_hash(password: str) -> str:
    pwd_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    token = credentials.credentials
    payload = decode_token(token)
    return payload

# --- PASSWORD RESET TOKEN HELPERS ---

def generate_reset_token(email: str) -> str:
    """Generates a secure, signed URL token containing the target email."""
    serializer = URLSafeTimedSerializer(settings.SECRET_KEY)
    return serializer.dumps(email, salt="password-reset-salt")

def verify_reset_token(token: str, max_age_seconds: int = 1800) -> Optional[str]:
    """
    Verifies reset token signature and checks if it expired (default 30 mins).
    Returns email if valid, or None if invalid/expired.
    """
    serializer = URLSafeTimedSerializer(settings.SECRET_KEY)
    try:
        email = serializer.loads(token, salt="password-reset-salt", max_age=max_age_seconds)
        return email
    except (SignatureExpired, BadTimeSignature):
        return None

def generate_otp_code(length: int = 6) -> str:
    """
    Generates a cryptographically secure numeric OTP code of specified length.
    Defaults to 6 digits (e.g., '482901').
    """
    return "".join(secrets.choice("0123456789") for _ in range(length))