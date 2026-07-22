from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field

class OTPVerification(SQLModel, table=True):
    __tablename__ = "otp_verifications"
    __table_args__ = {"extend_existing": True}

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    otp_code: str
    # Force SQLAlchemy to map datetime to TIMESTAMPTZ
    expires_at: datetime
    is_verified: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)