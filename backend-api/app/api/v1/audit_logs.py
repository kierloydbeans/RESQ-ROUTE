from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.security import get_current_user
from app.db.session import get_session
from app.models.system_audit_log import SystemAuditLog
from app.models.user import User, UserRole

router = APIRouter()


async def _require_admin(current_user: dict, session: AsyncSession) -> None:
    result = await session.execute(
        select(User).where(User.username == current_user.get("sub"))
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Active user account required")
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Administrator account required")


@router.get("")
async def get_audit_logs(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await _require_admin(current_user, session)
    result = await session.execute(
        select(SystemAuditLog).order_by(SystemAuditLog.timestamp.desc(), SystemAuditLog.id.desc())
    )
    return [
        {
            "id": log.id,
            "action_entry": log.action_entry,
            "user_id": log.user_id,
            "authority_role": log.authority_role,
            "net_address": log.net_address,
            # Stored timestamps are UTC-naive; mark them as UTC for reliable
            # client-side conversion to Philippine Time.
            "timestamp": f"{log.timestamp.isoformat()}Z",
        }
        for log in result.scalars().all()
    ]

