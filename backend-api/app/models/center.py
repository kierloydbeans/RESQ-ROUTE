from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime

class CenterBase(SQLModel):
    name: str
    address: str
    latitude: float
    longitude: float
    capacity: int
    current_occupancy: int = 0
    is_active: bool = True

class Center(CenterBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class CenterCreate(CenterBase):
    pass

class CenterRead(CenterBase):
    id: int
    created_at: datetime
    updated_at: datetime

class CenterUpdate(SQLModel):
    name: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    capacity: Optional[int] = None
    current_occupancy: Optional[int] = None
    is_active: Optional[bool] = None
