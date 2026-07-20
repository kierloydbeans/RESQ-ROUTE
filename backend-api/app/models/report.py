from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum

class SeverityLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class HazardType(str, Enum):
    STRUCTURAL = "structural"
    FLOOD = "flood"
    FIRE = "fire"
    DEBRIS = "debris"
    OTHER = "other"

class ReportBase(SQLModel):
    type: HazardType
    description: str
    latitude: float
    longitude: float
    severity: SeverityLevel
    reporter_name: Optional[str] = None
    reporter_phone: Optional[str] = None
    is_resolved: bool = False

class Report(ReportBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    reported_at: datetime = Field(default_factory=datetime.utcnow)
    resolved_at: Optional[datetime] = None
    assigned_to: Optional[int] = None  # vehicle_id or center_id

class ReportCreate(ReportBase):
    pass

class ReportRead(ReportBase):
    id: int
    reported_at: datetime
    resolved_at: Optional[datetime]
    assigned_to: Optional[int]

class ReportUpdate(SQLModel):
    description: Optional[str] = None
    severity: Optional[SeverityLevel] = None
    is_resolved: Optional[bool] = None
    resolved_at: Optional[datetime] = None
    assigned_to: Optional[int] = None
