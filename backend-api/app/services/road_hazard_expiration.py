from datetime import datetime, timedelta, timezone

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.road_hazard import RoadHazardReport


EXPIRATION_BY_HAZARD_TYPE = {
    "flood": timedelta(hours=6),
    "fire": timedelta(hours=6),
    "debris": timedelta(hours=24),
    "other": timedelta(hours=24),
    "landslide": timedelta(hours=72),
    "collapsed_road": timedelta(days=7),
    "downed_power_line": timedelta(days=7),
}


def calculate_road_hazard_expiration(hazard_type: str, reported_at: datetime) -> datetime:
    normalized_type = str(getattr(hazard_type, "value", hazard_type)).lower()
    expiration = EXPIRATION_BY_HAZARD_TYPE.get(normalized_type, EXPIRATION_BY_HAZARD_TYPE["other"])
    if reported_at.tzinfo is not None:
        reported_at = reported_at.astimezone(timezone.utc).replace(tzinfo=None)
    return reported_at + expiration


async def expire_stale_road_hazards(session: AsyncSession) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    result = await session.execute(
        update(RoadHazardReport)
        .where(
            RoadHazardReport.is_active == True,  # noqa: E712
            RoadHazardReport.is_resolved == False,  # noqa: E712
            RoadHazardReport.expires_at <= now,
        )
        .values(is_active=False)
    )
    if result.rowcount:
        await session.commit()