from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.security import get_current_user
from app.db.session import get_session
from app.models.center import Center
from app.models.user import User, UserRole

router = APIRouter()


class CheckInFamilyMember(BaseModel):
    id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=120)
    has_account: bool

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Family member name is required")
        return value


class CheckInAccountHolder(BaseModel):
    id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=255)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Account holder name is required")
        return value


class CheckInHousehold(BaseModel):
    id: int | None = Field(default=None, gt=0)
    name: str = Field(default="", max_length=120)
    family_members: list[CheckInFamilyMember] = Field(default_factory=list, max_length=50)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class CheckInCenter(BaseModel):
    id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=255)


class EvacuationCheckIn(BaseModel):
    type: Literal["resq-route-evacuation-check-in"]
    version: Literal[1]
    account_holder: CheckInAccountHolder
    household: CheckInHousehold
    center: CheckInCenter


async def _get_assigned_center_id(
    credentials: dict,
    session: AsyncSession,
) -> int:
    result = await session.execute(
        select(User).where(User.username == credentials.get("sub"))
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Active user account required")
    if user.role != UserRole.CENTER_COORDINATOR:
        raise HTTPException(status_code=403, detail="Center coordinator account required")
    if user.assigned_center_id is None:
        raise HTTPException(status_code=403, detail="No evacuation center is assigned to this account")
    return user.assigned_center_id


@router.get("/center")
async def get_assigned_center(
    credentials: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    center_id = await _get_assigned_center_id(credentials, session)
    result = await session.execute(select(Center).where(Center.id == center_id))
    center = result.scalar_one_or_none()
    if not center:
        raise HTTPException(status_code=404, detail="Assigned evacuation center not found")
    return center


@router.get("/evacuees")
async def list_assigned_center_evacuees(
    credentials: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    center_id = await _get_assigned_center_id(credentials, session)
    result = await session.execute(
        text(
            """
            SELECT id, name, qr_code, shelter_id, household_id, household_name,
                   household_member_id, has_account, needs_medical_attention,
                   medical_notes, phone_number, check_in_time, check_out_time, created_at
            FROM public.evacuee
            WHERE shelter_id = :center_id AND check_out_time IS NULL
            ORDER BY check_in_time DESC
            LIMIT 500
            """
        ),
        {"center_id": center_id},
    )
    return [dict(row) for row in result.mappings()]


@router.post("/evacuees/check-in")
async def check_in_household(
    payload: EvacuationCheckIn,
    credentials: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    center_id = await _get_assigned_center_id(credentials, session)
    if payload.center.id != center_id:
        raise HTTPException(status_code=403, detail="This QR code is for a different evacuation center")

    if len({member.id for member in payload.household.family_members}) != len(payload.household.family_members):
        raise HTTPException(status_code=422, detail="QR code contains duplicate family member IDs")

    account_result = await session.execute(
        select(User).where(User.id == payload.account_holder.id)
    )
    account = account_result.scalar_one_or_none()
    if (
        not account
        or not account.is_active
        or account.role != UserRole.CITIZEN
        or payload.account_holder.name.strip() != (account.full_name or account.username).strip()
    ):
        raise HTTPException(status_code=409, detail="Resident account details changed. Ask the resident to refresh their QR code.")

    household_query = """
        SELECT id, household_name
        FROM public.household
        WHERE user_id = :user_id
    """
    household_params = {"user_id": payload.account_holder.id}
    if payload.household.id is not None:
        household_query += " AND id = :household_id"
        household_params["household_id"] = payload.household.id
    household_result = await session.execute(text(household_query), household_params)
    household = household_result.mappings().one_or_none()
    household_id = household["id"] if household else None
    if household is None and payload.household.id is not None:
        raise HTTPException(status_code=409, detail="Household details changed. Ask the resident to refresh their QR code.")
    if household and household["household_name"] != payload.household.name.strip():
        raise HTTPException(status_code=409, detail="Household details changed. Ask the resident to refresh their QR code.")
    if household_id is None:
        household_result = await session.execute(
            text(
                """
                INSERT INTO public.household (user_id, household_name)
                VALUES (:user_id, :household_name)
                ON CONFLICT (user_id) DO UPDATE
                    SET household_name = household.household_name
                RETURNING id
                """
            ),
            {
                "user_id": payload.account_holder.id,
                "household_name": payload.household.name,
            },
        )
        household_id = household_result.scalar_one()

    member_result = await session.execute(
        text(
            """
            SELECT id, name, has_account
            FROM public.household_member
            WHERE household_id = :household_id
            """
        ),
        {"household_id": household_id},
    )
    valid_members = {row.id: row for row in member_result.mappings()}
    if (
        {member.id for member in payload.household.family_members} != set(valid_members)
        or any(
            valid_members[member.id]["name"] != member.name.strip()
            or valid_members[member.id]["has_account"] != member.has_account
            for member in payload.household.family_members
        )
    ):
        raise HTTPException(status_code=409, detail="Family member details changed. Ask the resident to refresh their QR code.")

    evacuees_to_check_in = [
        {
            "qr_code": f"RESQ1-HH-{household_id}-HEAD",
            "name": payload.account_holder.name.strip(),
            "household_member_id": None,
            "has_account": True,
        },
        *[
            {
                "qr_code": f"RESQ1-HH-{household_id}-MEMBER-{member.id}",
                "name": member.name.strip(),
                "household_member_id": member.id,
                "has_account": member.has_account,
            }
            for member in payload.household.family_members
        ],
    ]
    check_in_result = []
    for evacuee in evacuees_to_check_in:
        result = await session.execute(
            text(
                """
                INSERT INTO public.evacuee (
                    name, qr_code, shelter_id, household_id, household_name,
                    household_member_id, has_account, needs_medical_attention,
                    check_in_time, check_out_time, created_at
                )
                VALUES (
                    :name, :qr_code, :center_id, :household_id, :household_name,
                    :household_member_id, :has_account, FALSE, NOW(), NULL, NOW()
                )
                ON CONFLICT (qr_code) DO UPDATE SET
                    name = EXCLUDED.name,
                    shelter_id = EXCLUDED.shelter_id,
                    household_id = EXCLUDED.household_id,
                    household_name = EXCLUDED.household_name,
                    household_member_id = EXCLUDED.household_member_id,
                    has_account = EXCLUDED.has_account,
                    check_in_time = NOW(),
                    check_out_time = NULL
                RETURNING id, name, check_in_time
                """
            ),
            {
                **evacuee,
                "center_id": center_id,
                "household_id": household_id,
                "household_name": payload.household.name.strip(),
            },
        )
        check_in_result.append(dict(result.mappings().one()))

    await session.execute(
        text(
            """
            UPDATE public.center
            SET current_occupancy = (
                SELECT COUNT(*)
                FROM public.evacuee
                WHERE shelter_id = :center_id AND check_out_time IS NULL
            )
            WHERE id = :center_id
            """
        ),
        {"center_id": center_id},
    )
    await session.commit()
    return {
        "checked_in_count": len(check_in_result),
        "household_name": payload.household.name.strip(),
        "members": check_in_result,
    }


@router.get("/inventory")
async def list_assigned_center_inventory(
    credentials: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    center_id = await _get_assigned_center_id(credentials, session)
    result = await session.execute(
        text(
            """
            SELECT inventory_id, item_description, current_stock, max_stock,
                   status, last_shipment
            FROM public.center_inventory_detail
            WHERE center_id = :center_id
            ORDER BY item_description ASC
            LIMIT 500
            """
        ),
        {"center_id": center_id},
    )
    return [dict(row) for row in result.mappings()]
