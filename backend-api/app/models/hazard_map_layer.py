from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


class HazardMapLayer(SQLModel, table=True):
    __tablename__ = "hazard_map_layers"

    id: Optional[int] = Field(default=None, primary_key=True)
    source_grid_id: str = Field(index=True, unique=True)
    hazard_type: str = Field(default="flood", index=True)
    hazard_level: str = Field(default="low", index=True)
    hazard_score: float = Field(default=0.0)
    geometry: dict[str, Any] = Field(sa_column=Column(JSON, nullable=False))
    is_published: bool = Field(default=False, index=True)
    source: str = Field(default="UP NOAH")
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class HazardMapLayerRead(SQLModel):
    id: int
    source_grid_id: str
    hazard_type: str
    hazard_level: str
    hazard_score: float
    geometry: dict[str, Any]
    is_published: bool
    source: str
    updated_at: datetime


class HazardLayerPublish(SQLModel):
    is_published: bool
