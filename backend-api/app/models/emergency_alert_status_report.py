from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class EmergencyAlertStatusReportBase(SQLModel):
    alert_id: int = Field(foreign_key="emergency_alert.id", index=True)
    reporter_id: int = Field(foreign_key="user.id", index=True)
    reporter_name: str
    report_type: str = Field(max_length=32)
    message: str = Field(max_length=1000)
    additional_notes: Optional[str] = Field(default=None, max_length=2000)


class EmergencyAlertStatusReport(EmergencyAlertStatusReportBase, table=True):
    __tablename__ = "emergency_alert_status_report"

    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class EmergencyAlertStatusReportRead(EmergencyAlertStatusReportBase):
    id: int
    created_at: datetime
