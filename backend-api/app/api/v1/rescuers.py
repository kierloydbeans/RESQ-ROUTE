from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.security import get_current_user
from app.db.session import get_session
from app.models.user import User, UserRole


router = APIRouter()


async def _require_admin(current_user: dict, session: AsyncSession) -> None:
    result = await session.execute(select(User).where(User.username == current_user.get("sub")))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Active user account required")
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Administrator account required")


@router.get("/deployment")
async def get_rescuer_deployment(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return live rescuer profiles with dispatch-derived operational metrics."""
    await _require_admin(current_user, session)

    result = await session.execute(
        text(
            """
            WITH dispatch_metrics AS (
                SELECT
                    alert.assigned_rescuer_id AS user_id,
                    COUNT(DISTINCT alert.id) FILTER (
                        WHERE EXISTS (
                            SELECT 1
                            FROM public.emergency_alert_status_report AS resolved_report
                            WHERE resolved_report.alert_id = alert.id
                              AND resolved_report.reporter_id = alert.assigned_rescuer_id
                              AND LOWER(resolved_report.report_type) = 'resolved'
                        )
                    ) AS completed_cases,
                    COUNT(DISTINCT alert.id) AS assigned_cases,
                    COUNT(DISTINCT alert.id) FILTER (
                        WHERE EXISTS (
                            SELECT 1
                            FROM public.emergency_alert_status_report AS response_report
                            WHERE response_report.alert_id = alert.id
                              AND response_report.reporter_id = alert.assigned_rescuer_id
                              AND LOWER(response_report.report_type) IN (
                                  'resolving', 'in_transit', 'going_to_evacuation_center', 'resolved'
                              )
                              AND response_report.created_at <= alert.created_at + INTERVAL '8 minutes'
                        )
                    ) AS responded_cases
                FROM public.emergency_alert AS alert
                WHERE alert.assigned_rescuer_id IS NOT NULL
                GROUP BY alert.assigned_rescuer_id
            )
            SELECT
                profile.id,
                profile.user_id,
                COALESCE(NULLIF(TRIM(user_account.full_name), ''), user_account.username) AS rescuer_name,
                user_account.username,
                profile.station_name,
                profile.status::text AS status,
                profile.phone,
                profile.current_latitude,
                profile.current_longitude,
                profile.last_seen_at,
                profile.recovering_until,
                COALESCE(metrics.completed_cases, 0) AS completed_cases,
                COALESCE(metrics.assigned_cases, 0) AS assigned_cases,
                COALESCE(metrics.responded_cases, 0) AS responded_cases,
                CASE
                    WHEN COALESCE(metrics.assigned_cases, 0) = 0 THEN NULL
                    ELSE ROUND((metrics.responded_cases::numeric / metrics.assigned_cases) * 100, 1)
                END AS response_rate
            FROM public.rescuer_profile AS profile
            JOIN public.user AS user_account ON user_account.id = profile.user_id
            LEFT JOIN dispatch_metrics AS metrics ON metrics.user_id = profile.user_id
            WHERE user_account.is_active = TRUE
            ORDER BY
                CASE profile.status::text
                    WHEN 'assigned' THEN 0
                    WHEN 'in_transit' THEN 1
                    WHEN 'available' THEN 2
                    WHEN 'recovering' THEN 3
                    ELSE 4
                END,
                LOWER(COALESCE(NULLIF(TRIM(user_account.full_name), ''), user_account.username))
            """
        )
    )

    return [dict(row) for row in result.mappings().all()]
