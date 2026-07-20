from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime

class EvacueeBase(SQLModel):
    name: str
    qr_code: str
    shelter_id: Optional[int] = None
    needs_medical_attention: bool = False
    medical_notes: Optional[str] = None
    phone_number: Optional[str] = None

class Evacuee(EvacueeBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    check_in_time: datetime = Field(default_factory=datetime.utcnow)
    check_out_time: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class EvacueeCreate(EvacueeBase):
    pass

class EvacueeRead(EvacueeBase):
    id: int
    check_in_time: datetime
    check_out_time: Optional[datetime]
    created_at: datetime

class EvacueeUpdate(SQLModel):
    name: Optional[str] = None
    shelter_id: Optional[int] = None
    needs_medical_attention: Optional[bool] = None
    medical_notes: Optional[str] = None
    phone_number: Optional[str] = None
    check_out_time: Optional[datetime] = None
