from datetime import datetime
from typing import Optional

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system_audit_log import SystemAuditLog


def _request_ip(request: Optional[Request]) -> str:
    if request is None:
        return "unknown"
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


def _role_value(current_user: dict) -> str:
    role = current_user.get("role") or current_user.get("authority_role") or "unknown"
    return getattr(role, "value", str(role))


def record_audit_log(
    session: AsyncSession,
    current_user: dict,
    request: Optional[Request],
    action_entry: str,
) -> SystemAuditLog:
    """Attach an audit row to the current transaction.

    The caller commits the transaction after the associated state change. This
    keeps the audit row atomic with the action and derives identity from the
    validated bearer token rather than trusting client-supplied role headers.
    """
    audit_log = SystemAuditLog(
        action_entry=action_entry,
        user_id=str(current_user.get("sub") or current_user.get("user_id") or "unknown"),
        authority_role=_role_value(current_user),
        net_address=_request_ip(request),
        timestamp=datetime.utcnow(),
    )
    session.add(audit_log)
    return audit_log

