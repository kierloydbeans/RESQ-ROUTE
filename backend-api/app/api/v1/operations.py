from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.security import get_current_user
from app.db.session import get_session
from app.models.user import User

router = APIRouter()


async def _require_active_user(current_user: dict, session: AsyncSession) -> None:
    result = await session.execute(
        select(User).where(User.username == current_user.get("sub"))
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Active user account required")


@router.get("/metrics")
async def get_operation_metrics(
    window_days: int = Query(default=7, ge=1, le=3650),
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return dispatcher-defined rescue KPIs from resolved emergency alerts."""
    await _require_active_user(current_user, session)

    result = await session.execute(
        text(
            """
            SELECT
                COUNT(*) AS people_rescued,
                COUNT(*) AS operations_total,
                COUNT(*) FILTER (
                    WHERE updated_at >= created_at
                ) AS response_samples,
                AVG(
                    EXTRACT(EPOCH FROM (updated_at - created_at)) / 60.0
                ) FILTER (
                    WHERE updated_at >= created_at
                ) AS average_response_minutes
            FROM public.emergency_alert
            WHERE LOWER(status::text) = 'closed'
              AND COALESCE(updated_at, created_at) >= CURRENT_TIMESTAMP - (CAST(:window_days AS INTEGER) * INTERVAL '1 day')
            """
        ),
        {"window_days": window_days},
    )
    row = result.mappings().one()
    average_response = row["average_response_minutes"]

    return {
        "window_days": window_days,
        "people_rescued": int(row["people_rescued"] or 0),
        "operations_total": int(row["operations_total"] or 0),
        "response_samples": int(row["response_samples"] or 0),
        "average_response_minutes": round(float(average_response), 1) if average_response is not None else None,
        "definition": "Emergency alerts whose status is closed and whose closure timestamp (updated_at) is within the requested window; response time is updated_at minus created_at.",
    }
