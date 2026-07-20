from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime

class VehicleBase(SQLModel):
    plate_number: str
    vehicle_type: str  # ambulance, truck, van, etc.
    driver_name: str
    driver_phone: str
    capacity: int
    current_location_lat: Optional[float] = None
    current_location_lng: Optional[float] = None
    status: str = "available"  # available, in_transit, maintenance

class Vehicle(VehicleBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    center_id: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class VehicleCreate(VehicleBase):
    center_id: Optional[int] = None

class VehicleRead(VehicleBase):
    id: int
    center_id: Optional[int]
    created_at: datetime
    updated_at: datetime

class VehicleUpdate(SQLModel):
    plate_number: Optional[str] = None
    vehicle_type: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    capacity: Optional[int] = None
    current_location_lat: Optional[float] = None
    current_location_lng: Optional[float] = None
    status: Optional[str] = None
    center_id: Optional[int] = None
