from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.security import get_current_user
from app.db.session import get_session
from app.models.user import User, UserRole
from app.services.audit_logging import record_audit_log


router = APIRouter()

PERMISSIONS = (
    "view_dashboard",
    "dispatch_units",
    "edit_inventory",
    "register_evacuees",
    "resolve_incidents",
    "manage_users",
    "view_audit",
)

ROLE_PERMISSIONS = {
    "System Admin": set(PERMISSIONS),
    "Dispatcher": {"view_dashboard", "dispatch_units"},
    "Field Commander": {"view_dashboard", "dispatch_units", "resolve_incidents"},
    "Warehouse Mgr": {"view_dashboard", "edit_inventory"},
    "Center Staff": {"view_dashboard", "register_evacuees"},
    "Rescuer": {"view_dashboard", "resolve_incidents"},
    "Citizen": {"view_dashboard"},
}

ROLE_DB_NAMES = {
    UserRole.ADMIN.value: "System Admin",
    UserRole.DISPATCHER.value: "Dispatcher",
    UserRole.COORDINATOR.value: "Field Commander",
    UserRole.CENTER_COORDINATOR.value: "Center Staff",
    UserRole.RESCUER.value: "Rescuer",
    UserRole.CITIZEN.value: "Citizen",
}


class RbacSummaryUpdate(BaseModel):
    roles: dict[str, dict[str, bool]]
    version: int | None = None


async def _ensure_permissions_table(session: AsyncSession) -> None:
    await session.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS public.rbac_role_permissions (
                role_name VARCHAR(100) NOT NULL,
                permission_id VARCHAR(100) NOT NULL,
                allowed BOOLEAN NOT NULL DEFAULT FALSE,
                updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                PRIMARY KEY (role_name, permission_id)
            )
            """
        )
    )
    await session.execute(
        text(
            """
            INSERT INTO public.rbac_role_permissions (role_name, permission_id, allowed)
            SELECT role_name, permission_id, allowed
            FROM (VALUES
                ('System Admin', 'view_dashboard', TRUE), ('System Admin', 'dispatch_units', TRUE),
                ('System Admin', 'edit_inventory', TRUE), ('System Admin', 'register_evacuees', TRUE),
                ('System Admin', 'resolve_incidents', TRUE), ('System Admin', 'manage_users', TRUE),
                ('System Admin', 'view_audit', TRUE),
                ('Dispatcher', 'view_dashboard', TRUE), ('Dispatcher', 'dispatch_units', TRUE),
                ('Field Commander', 'view_dashboard', TRUE), ('Field Commander', 'dispatch_units', TRUE),
                ('Field Commander', 'resolve_incidents', TRUE),
                ('Warehouse Mgr', 'view_dashboard', TRUE), ('Warehouse Mgr', 'edit_inventory', TRUE),
                ('Center Staff', 'view_dashboard', TRUE), ('Center Staff', 'register_evacuees', TRUE),
                ('Rescuer', 'view_dashboard', TRUE), ('Rescuer', 'resolve_incidents', TRUE),
                ('Citizen', 'view_dashboard', TRUE)
            ) AS seed(role_name, permission_id, allowed)
            ON CONFLICT (role_name, permission_id) DO NOTHING
            """
        )
    )


async def _require_admin(current_user: dict[str, Any], session: AsyncSession) -> dict[str, Any]:
    result = await session.execute(select(User).where(User.username == current_user.get("sub")))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Active user account required")
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Administrator account required")
    return {"id": user.id, "username": user.username, "role": user.role.value}


def _permissions_matrix(rows: list[dict[str, Any]]) -> dict[str, dict[str, bool]]:
    matrix = {
        role: {permission: False for permission in PERMISSIONS}
        for role in ROLE_PERMISSIONS
    }
    for row in rows:
        role = row["role_name"]
        if role in matrix and row["permission_id"] in PERMISSIONS:
            matrix[role][row["permission_id"]] = bool(row["allowed"])
    return matrix


async def _summary(session: AsyncSession) -> dict[str, Any]:
    await _ensure_permissions_table(session)
    permission_result = await session.execute(
        text(
            """
            SELECT role_name, permission_id, allowed
            FROM public.rbac_role_permissions
            ORDER BY role_name, permission_id
            """
        )
    )
    matrix = _permissions_matrix([dict(row) for row in permission_result.mappings().all()])

    count_result = await session.execute(
        text(
            """
            SELECT role::text AS role_key,
                   COUNT(*)::int AS active_count,
                   COUNT(*) FILTER (
                       WHERE role::text IN ('coordinator', 'center_coordinator')
                         AND assigned_center_id IS NOT NULL
                   )::int AS assigned_center_count
            FROM public."user"
            WHERE is_active IS TRUE
            GROUP BY role::text
            """
        )
    )
    role_user_counts = {role: 0 for role in ROLE_PERMISSIONS}
    assigned_center_counts = {role: 0 for role in ROLE_PERMISSIONS}
    for row in count_result.mappings().all():
        role_key = str(row["role_key"]).lower()
        role_name = ROLE_DB_NAMES.get(role_key, str(row["role_key"]))
        role_user_counts[role_name] = int(row["active_count"] or 0)
        assigned_center_counts[role_name] = int(row["assigned_center_count"] or 0)

    return {
        "roles": matrix,
        "roleUserCounts": role_user_counts,
        "assignedCenterUserCounts": assigned_center_counts,
        "version": 1,
    }


@router.get("/summary")
async def get_rbac_summary(
    current_user: dict[str, Any] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await _require_admin(current_user, session)
    return await _summary(session)


@router.put("/summary")
async def update_rbac_summary(
    payload: RbacSummaryUpdate,
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await _require_admin(current_user, session)
    await _ensure_permissions_table(session)

    invalid_roles = set(payload.roles) - set(ROLE_PERMISSIONS)
    if invalid_roles:
        raise HTTPException(status_code=422, detail=f"Unsupported roles: {', '.join(sorted(invalid_roles))}")

    for role, permissions in payload.roles.items():
        invalid_permissions = set(permissions) - set(PERMISSIONS)
        if invalid_permissions:
            raise HTTPException(status_code=422, detail=f"Unsupported permissions for {role}")
        for permission_id in PERMISSIONS:
            await session.execute(
                text(
                    """
                    INSERT INTO public.rbac_role_permissions (role_name, permission_id, allowed, updated_at)
                    VALUES (:role_name, :permission_id, :allowed, NOW())
                    ON CONFLICT (role_name, permission_id)
                    DO UPDATE SET allowed = EXCLUDED.allowed, updated_at = NOW()
                    """
                ),
                {
                    "role_name": role,
                    "permission_id": permission_id,
                    "allowed": bool(permissions.get(permission_id, False)),
                },
            )

    changed_roles = ", ".join(sorted(payload.roles)) or "none"
    record_audit_log(
        session,
        current_user,
        request,
        f"RBAC permission matrix updated for roles: {changed_roles}",
    )
    await session.commit()
    return await _summary(session)
