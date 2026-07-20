from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List
from app.models.center import Center, CenterRead
from app.db.session import get_session
from sqlmodel import SQLModel, Field

router = APIRouter()

class InventoryItem(SQLModel):
    id: str
    name: str
    category: str
    quantity: int
    threshold: int
    critical: bool

# Mock inventory data - in production, this would be a proper database model
mock_inventory = [
    InventoryItem(
        id="1",
        name="Water Bottles",
        category="Food & Water",
        quantity=500,
        threshold=200,
        critical=False
    ),
    InventoryItem(
        id="2",
        name="First Aid Kits",
        category="Medical",
        quantity=50,
        threshold=100,
        critical=True
    ),
    InventoryItem(
        id="3",
        name="Blankets",
        category="Supplies",
        quantity=300,
        threshold=150,
        critical=False
    ),
    InventoryItem(
        id="4",
        name="Canned Food",
        category="Food & Water",
        quantity=200,
        threshold=300,
        critical=True
    ),
]

@router.get("/", response_model=List[InventoryItem])
async def list_inventory(session: Session = Depends(get_session)):
    return mock_inventory

@router.get("/depletion-metrics")
async def get_depletion_metrics():
    total_items = len(mock_inventory)
    critical_items = sum(1 for item in mock_inventory if item.critical)
    
    return {
        "total_items": total_items,
        "critical_items": critical_items,
        "depletion_rate": critical_items / total_items if total_items > 0 else 0
    }
