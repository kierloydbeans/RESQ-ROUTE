from sqlmodel import SQLModel, Field, select
from typing import Optional
from datetime import datetime
from enum import Enum
from sqlmodel import SQLModel, Field

class UserRole(str, Enum):
    ADMIN = "admin"
    RESCUER = "rescuer"
    COORDINATOR = "coordinator"
    CITIZEN = "citizen"

class UserBase(SQLModel):
    username: str = Field(index=True, unique=True)
    email: str = Field(index=True, unique=True)
    full_name: Optional[str] = None
    role: UserRole = Field(default=UserRole.RESCUER)
    is_active: bool = Field(default=True)

class User(UserBase, table=True):
    __tablename__ = "user"
    __table_args__ = {"extend_existing": True}

    id: Optional[int] = Field(default=None, primary_key=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

print("Mapped table name is:", User.__tablename__)

# class User(UserBase, table=True):
#     id: Optional[int] = Field(default=None, primary_key=True)
#     hashed_password: str
#     created_at: datetime = Field(default_factory=datetime.utcnow)
#     updated_at: datetime = Field(default_factory=datetime.utcnow)

class UserCreate(UserBase):
    password: str

class UserRead(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime

class UserUpdate(SQLModel):
    username: Optional[str] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None

class UserLogin(SQLModel):
    username: str
    password: str

# class OTPVerification(SQLModel, table=True):
#     __tablename__ = "otp_verifications"
#     __table_args__ = {"extend_existing": True}
    
#     id: int | None = Field(default=None, primary_key=True)
#     user_id: int = Field(foreign_key="users.id")
#     otp_code: str
#     expires_at: datetime