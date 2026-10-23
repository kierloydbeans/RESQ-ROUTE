from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.security import get_current_user
from app.db.session import get_session
from app.models.user import User, UserRole
from app.services.audit_logging import record_audit_log

router = APIRouter()


class InventoryShipmentCreate(BaseModel):
    inventory_id: UUID
    center_id: int = Field(gt=0)
    quantity: int = Field(gt=0)


class InventoryItemCreate(BaseModel):
    item_description: str = Field(min_length=1, max_length=255)
    current_stock: int = Field(ge=0)
    max_stock: int = Field(gt=0)
    status: str = Field(min_length=1, max_length=32)
    last_shipment: Optional[datetime] = None

    @field_validator("item_description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Item description is required")
        return value


class InventoryShipmentRead(BaseModel):
    id: UUID
    inventory_id: UUID
    item_description: str
    center_id: int
    center_name: str
    quantity: int
    status: str
    created_at: datetime
    arrived_at: Optional[datetime] = None


async def _require_inventory_manager(
    current_user: dict,
    session: AsyncSession,
) -> User:
    result = await session.execute(
        select(User).where(User.username == current_user.get("sub"))
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Active user account required")
    if user.role not in {UserRole.ADMIN, UserRole.COORDINATOR}:
        raise HTTPException(status_code=403, detail="Coordinator account required")
    return user


async def _require_inventory_viewer(
    current_user: dict,
    session: AsyncSession,
) -> User:
    result = await session.execute(
        select(User).where(User.username == current_user.get("sub"))
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Active user account required")
    if user.role not in {UserRole.ADMIN, UserRole.COORDINATOR, UserRole.CENTER_COORDINATOR}:
        raise HTTPException(status_code=403, detail="Coordinator account required")
    if user.role == UserRole.CENTER_COORDINATOR and user.assigned_center_id is None:
        raise HTTPException(status_code=403, detail="No evacuation center is assigned to this account")
    return user


async def _get_shipment(session: AsyncSession, shipment_id: UUID) -> dict:
    result = await session.execute(
        text(
            """
            SELECT shipment.id, shipment.inventory_id, inventory.item_description,
                   shipment.center_id, center.name AS center_name, shipment.quantity,
                   shipment.status, shipment.created_at, shipment.arrived_at
            FROM public.inventory_shipments AS shipment
            JOIN public.inventory AS inventory ON inventory.id = shipment.inventory_id
            JOIN public.center AS center ON center.id = shipment.center_id
            WHERE shipment.id = :shipment_id
            """
        ),
        {"shipment_id": shipment_id},
    )
    row = result.mappings().one()
    return dict(row)


@router.get("/")
async def list_inventory(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await _require_inventory_manager(current_user, session)
    result = await session.execute(
        text(
            """
            SELECT id, item_description, current_stock, max_stock, status, last_shipment
            FROM public.inventory
            ORDER BY item_description
            LIMIT 100
            """
        )
    )
    return [dict(row) for row in result.mappings()]


@router.post("/", status_code=201)
async def create_inventory_item(
    payload: InventoryItemCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await _require_inventory_manager(current_user, session)
    result = await session.execute(
        text(
            """
            INSERT INTO public.inventory
                (item_description, current_stock, max_stock, status, last_shipment)
            VALUES
                (:item_description, :current_stock, :max_stock, :status, :last_shipment)
            RETURNING id, item_description, current_stock, max_stock, status, last_shipment
            """
        ),
        payload.model_dump(),
    )
    item = dict(result.mappings().one())
    record_audit_log(session, current_user, request, f"Inventory item created: {item['item_description']}")
    await session.commit()
    return item


@router.get("/shipments", response_model=List[InventoryShipmentRead])
async def list_pending_shipments(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    user = await _require_inventory_viewer(current_user, session)
    center_filter = ""
    params = {}
    if user.role == UserRole.CENTER_COORDINATOR:
        center_filter = "AND shipment.center_id = :center_id"
        params["center_id"] = user.assigned_center_id

    result = await session.execute(
        text(
            f"""
            SELECT shipment.id, shipment.inventory_id, inventory.item_description,
                   shipment.center_id, center.name AS center_name, shipment.quantity,
                   shipment.status, shipment.created_at, shipment.arrived_at
            FROM public.inventory_shipments AS shipment
            JOIN public.inventory AS inventory ON inventory.id = shipment.inventory_id
            JOIN public.center AS center ON center.id = shipment.center_id
            WHERE shipment.status = 'pending'
              {center_filter}
            ORDER BY shipment.created_at DESC
            LIMIT 500
            """
        ),
        params,
    )
    return [dict(row) for row in result.mappings()]


@router.post("/shipments", response_model=InventoryShipmentRead, status_code=201)
async def create_inventory_shipment(
    payload: InventoryShipmentCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await _require_inventory_manager(current_user, session)
    inventory_result = await session.execute(
        text("SELECT id FROM public.inventory WHERE id = :inventory_id"),
        {"inventory_id": payload.inventory_id},
    )
    if inventory_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    center_result = await session.execute(
        text("SELECT id FROM public.center WHERE id = :center_id"),
        {"center_id": payload.center_id},
    )
    if center_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Evacuation center not found")

    result = await session.execute(
        text(
            """
            INSERT INTO public.inventory_shipments (inventory_id, center_id, quantity)
            VALUES (:inventory_id, :center_id, :quantity)
            RETURNING id, created_at
            """
        ),
        {
            "inventory_id": payload.inventory_id,
            "center_id": payload.center_id,
            "quantity": payload.quantity,
        },
    )
    shipment = result.mappings().one()
    await session.execute(
        text(
            """
            UPDATE public.inventory
            SET last_shipment = GREATEST(COALESCE(last_shipment, :created_at), :created_at)
            WHERE id = :inventory_id
            """
        ),
        {
            "inventory_id": payload.inventory_id,
            "created_at": shipment["created_at"],
        },
    )
    record_audit_log(
        session,
        current_user,
        request,
        f"Resource allocation created: shipment {shipment['id']} quantity {payload.quantity}",
    )
    await session.commit()
    return await _get_shipment(session, shipment["id"])


@router.post("/shipments/{shipment_id}/arrive")
async def mark_shipment_arrived(
    shipment_id: UUID,
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    user = await _require_inventory_viewer(current_user, session)
    shipment_result = await session.execute(
        text(
            """
            SELECT inventory_id, center_id, quantity, status
            FROM public.inventory_shipments
            WHERE id = :shipment_id
            FOR UPDATE
            """
        ),
        {"shipment_id": shipment_id},
    )
    shipment = shipment_result.mappings().one_or_none()
    if shipment is None:
        raise HTTPException(status_code=404, detail="Shipment not found")
    if (
        user.role == UserRole.CENTER_COORDINATOR
        and shipment["center_id"] != user.assigned_center_id
    ):
        raise HTTPException(status_code=403, detail="Shipment belongs to another evacuation center")
    if shipment["status"] != "pending":
        raise HTTPException(status_code=409, detail="Shipment has already arrived")

    await session.execute(
        text(
            """
            INSERT INTO public.center_inventory AS center_stock
                (inventory_id, center_id, current_stock, last_shipment, updated_at)
            VALUES
                (:inventory_id, :center_id, :quantity, NOW(), NOW())
            ON CONFLICT (inventory_id, center_id)
            DO UPDATE SET
                current_stock = center_stock.current_stock + EXCLUDED.current_stock,
                last_shipment = NOW(),
                updated_at = NOW()
            """
        ),
        {
            "inventory_id": shipment["inventory_id"],
            "center_id": shipment["center_id"],
            "quantity": shipment["quantity"],
        },
    )
    await session.execute(
        text(
            """
            UPDATE public.inventory_shipments
            SET status = 'arrived', arrived_at = NOW()
            WHERE id = :shipment_id
            """
        ),
        {"shipment_id": shipment_id},
    )
    record_audit_log(session, current_user, request, f"Inventory shipment received: {shipment_id}")
    await session.commit()
    return {"id": shipment_id, "status": "arrived"}


@router.get("/depletion-metrics")
async def get_depletion_metrics(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await _require_inventory_manager(current_user, session)
    result = await session.execute(
        text(
            """
            SELECT COUNT(*) AS total_items,
                   COUNT(*) FILTER (WHERE UPPER(status::text) = 'CRITICAL') AS critical_items
            FROM public.inventory
            """
        )
    )
    metrics = result.mappings().one()
    total_items = metrics["total_items"]
    critical_items = metrics["critical_items"]
    return {
        "total_items": total_items,
        "critical_items": critical_items,
        "depletion_rate": critical_items / total_items if total_items > 0 else 0
    }
