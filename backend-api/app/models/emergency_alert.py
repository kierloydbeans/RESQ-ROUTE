from typing import Optional
from datetime import datetime
from enum import Enum

from sqlmodel import SQLModel, Field


class AlertStatus(str, Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    ON_THE_WAY = "on_the_way"
    ARRIVED = "arrived"
    RETURNING = "returning"
    RESOLVING = "resolving"
    CLOSED = "closed"


class EmergencyAlertBase(SQLModel):
    sender_id: int = Field(foreign_key="user.id", index=True)
    sender_name: str
    sender_role: str
    latitude: float
    longitude: float
    message: str = "Emergency alert"
    status: AlertStatus = Field(default=AlertStatus.PENDING)
    assigned_rescuer_id: Optional[int] = Field(default=None, foreign_key="user.id")
    assigned_rescuer_name: Optional[str] = None


class EmergencyAlert(EmergencyAlertBase, table=True):
    __tablename__ = "emergency_alert"
    __table_args__ = {"extend_existing": True}

    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
class EmergencyAlertRead(EmergencyAlertBase):
    id: int
    created_at: datetime
    updated_at: datetime
