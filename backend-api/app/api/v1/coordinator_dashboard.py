from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.security import get_current_user
from app.db.session import get_session
from app.models.user import User, UserRole

router = APIRouter()


async def _require_coordinator(
    current_user: dict,
    session: AsyncSession,
) -> None:
    result = await session.execute(
        select(User).where(User.username == current_user.get("sub"))
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Active user account required")
    if user.role not in {UserRole.ADMIN, UserRole.COORDINATOR}:
        raise HTTPException(status_code=403, detail="Coordinator account required")


@router.get("/")
async def get_coordinator_dashboard_data(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await _require_coordinator(current_user, session)

    centers_result = await session.execute(
        text(
            """
            SELECT id, name, address, latitude, longitude, capacity,
                   current_occupancy, is_active, image_url, created_at, updated_at
            FROM public.center
            ORDER BY name
            LIMIT 100
            """
        )
    )
    inventory_result = await session.execute(
        text(
            """
            SELECT id, item_description, current_stock, max_stock, status, last_shipment
            FROM public.inventory
            ORDER BY item_description
            LIMIT 100
            """
        )
    )
    evacuees_result = await session.execute(
        text(
            """
            SELECT evacuee.id, evacuee.name, evacuee.qr_code,
                   evacuee.shelter_id AS center_id, center.name AS center_name,
                   evacuee.household_id, evacuee.household_name,
                   evacuee.household_member_id, evacuee.has_account,
                   evacuee.needs_medical_attention, evacuee.medical_notes,
                   evacuee.phone_number, evacuee.check_in_time,
                   evacuee.check_out_time, evacuee.created_at
            FROM public.evacuee AS evacuee
            LEFT JOIN public.center AS center ON center.id = evacuee.shelter_id
            ORDER BY evacuee.check_in_time DESC
            LIMIT 500
            """
        )
    )
    sheltered_count_result = await session.execute(
        text(
            """
            SELECT COUNT(*)
            FROM public.evacuee
            WHERE shelter_id IS NOT NULL AND check_out_time IS NULL
            """
        )
    )
    active_alerts_result = await session.execute(
        text(
            """
            SELECT COUNT(*)
            FROM public.emergency_alert
            WHERE status::text <> 'closed'
            """
        )
    )

    return {
        "centers": [dict(row) for row in centers_result.mappings()],
        "inventory": [dict(row) for row in inventory_result.mappings()],
        "evacuees": [dict(row) for row in evacuees_result.mappings()],
        "sheltered_evacuees_count": sheltered_count_result.scalar_one(),
        "active_alerts_count": active_alerts_result.scalar_one(),
    }


@router.get("/centers/{center_id}/inventory")
async def get_center_inventory(
    center_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await _require_coordinator(current_user, session)
    result = await session.execute(
        text(
            """
            SELECT inventory.id, inventory.item_description, inventory.status,
                   center_inventory.center_id, center_inventory.current_stock,
                   center_inventory.max_stock, center_inventory.last_shipment,
                   center_inventory.created_at, center_inventory.updated_at
            FROM public.center_inventory AS center_inventory
            JOIN public.inventory AS inventory
              ON inventory.id = center_inventory.inventory_id
            WHERE center_inventory.center_id = :center_id
            ORDER BY inventory.item_description
            LIMIT 200
            """
        ),
        {"center_id": center_id},
    )
    return [dict(row) for row in result.mappings()]
