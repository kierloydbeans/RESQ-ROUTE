from enum import Enum
from typing import Optional
from datetime import datetime

from sqlmodel import SQLModel, Field


class RescuerStatus(str, Enum):
    AVAILABLE = "available"
    IN_TRANSIT = "in_transit"
    RECOVERING = "recovering"


class RescuerProfileBase(SQLModel):
    user_id: int = Field(foreign_key="user.id", index=True, unique=True)
    status: RescuerStatus = Field(default=RescuerStatus.AVAILABLE)
    station_name: Optional[str] = None
    phone: Optional[str] = None
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None


class RescuerProfile(RescuerProfileBase, table=True):
    __tablename__ = "rescuer_profile"
    __table_args__ = {"extend_existing": True}

    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class RescuerProfileRead(RescuerProfileBase):
    id: int
    created_at: datetime
    updated_at: datetime
