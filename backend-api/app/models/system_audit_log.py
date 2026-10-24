from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class SystemAuditLog(SQLModel, table=True):
    __tablename__ = "system_audit_logs"
    __table_args__ = {"schema": "public"}

    id: Optional[int] = Field(default=None, primary_key=True)
    action_entry: str = Field(max_length=500)
    user_id: str = Field(max_length=100, index=True)
    authority_role: str = Field(max_length=100, index=True)
    net_address: str = Field(max_length=255)
    timestamp: datetime = Field(default_factory=datetime.utcnow, index=True)

