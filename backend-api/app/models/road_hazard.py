from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum

from app.models.report import SeverityLevel


class RoadHazardType(str, Enum):
    FLOOD = "flood"
    DEBRIS = "debris"
    FIRE = "fire"
    LANDSLIDE = "landslide"
    COLLAPSED_ROAD = "collapsed_road"
    DOWNED_POWER_LINE = "downed_power_line"
    OTHER = "other"


class RoadHazardReportBase(SQLModel):
    hazard_type: RoadHazardType
    description: str
    latitude: float
    longitude: float
    radius_meters: int = 75
    severity: SeverityLevel = SeverityLevel.HIGH
    road_name: Optional[str] = None
    reporter_name: Optional[str] = None
    is_active: bool = True
    is_resolved: bool = False


class RoadHazardReport(RoadHazardReportBase, table=True):
    __tablename__ = "road_hazard_reports"

    id: Optional[int] = Field(default=None, primary_key=True)
    reported_at: datetime = Field(default_factory=datetime.utcnow)
    resolved_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class RoadHazardReportCreate(RoadHazardReportBase):
    pass


class RoadHazardReportRead(RoadHazardReportBase):
    id: int
    reported_at: datetime
    resolved_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class RoadHazardReportUpdate(SQLModel):
    hazard_type: Optional[RoadHazardType] = None
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius_meters: Optional[int] = None
    severity: Optional[SeverityLevel] = None
    road_name: Optional[str] = None
    reporter_name: Optional[str] = None
    is_active: Optional[bool] = None
    is_resolved: Optional[bool] = None
    resolved_at: Optional[datetime] = None
