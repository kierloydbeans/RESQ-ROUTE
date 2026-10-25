from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.security import get_current_user
from app.db.session import get_session
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


@router.get("/metrics")
async def get_admin_dashboard_metrics(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return database-derived rescue KPIs for the current and prior 7-day cohorts."""
    await _require_admin(current_user, session)

    result = await session.execute(
        text(
            """
            WITH assigned_rescues AS (
                SELECT alert.id, alert.created_at,
                       EXISTS (
                           SELECT 1
                           FROM public.emergency_alert_status_report AS report
                           WHERE report.alert_id = alert.id
                             AND lower(report.report_type) = 'resolved'
                       ) AS was_resolved
                FROM public.emergency_alert AS alert
                WHERE alert.assigned_rescuer_id IS NOT NULL
                  AND alert.created_at >= (CURRENT_TIMESTAMP - INTERVAL '14 days')
            ), cohort_counts AS (
                SELECT
                    COUNT(*) FILTER (
                        WHERE created_at >= (CURRENT_TIMESTAMP - INTERVAL '7 days')
                    ) AS current_total,
                    COUNT(*) FILTER (
                        WHERE created_at >= (CURRENT_TIMESTAMP - INTERVAL '7 days')
                          AND was_resolved
                    ) AS current_successful,
                    COUNT(*) FILTER (
                        WHERE created_at >= (CURRENT_TIMESTAMP - INTERVAL '14 days')
                          AND created_at < (CURRENT_TIMESTAMP - INTERVAL '7 days')
                    ) AS prior_total,
                    COUNT(*) FILTER (
                        WHERE created_at >= (CURRENT_TIMESTAMP - INTERVAL '14 days')
                          AND created_at < (CURRENT_TIMESTAMP - INTERVAL '7 days')
                          AND was_resolved
                    ) AS prior_successful
                FROM assigned_rescues
            )
            SELECT current_total, current_successful, prior_total, prior_successful,
                   CASE WHEN current_total > 0
                        THEN ROUND((current_successful::numeric / current_total) * 100, 1)
                        ELSE NULL END AS current_rate,
                   CASE WHEN prior_total > 0
                        THEN ROUND((prior_successful::numeric / prior_total) * 100, 1)
                        ELSE NULL END AS prior_rate
            FROM cohort_counts
            """
        )
    )
    row = result.mappings().one()
    current_rate = float(row["current_rate"]) if row["current_rate"] is not None else None
    prior_rate = float(row["prior_rate"]) if row["prior_rate"] is not None else None

    return {
        "rescue_success_rate": current_rate,
        "rescue_successful": int(row["current_successful"]),
        "rescue_total": int(row["current_total"]),
        "prior_rescue_success_rate": prior_rate,
        "prior_rescue_successful": int(row["prior_successful"]),
        "prior_rescue_total": int(row["prior_total"]),
        "rescue_success_change": (
            round(current_rate - prior_rate, 1)
            if current_rate is not None and prior_rate is not None
            else None
        ),
        "window_days": 7,
        "definition": "Assigned alerts with a recorded resolved status report divided by all assigned alerts created in the cohort.",
    }
