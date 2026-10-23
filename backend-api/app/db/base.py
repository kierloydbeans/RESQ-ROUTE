from sqlalchemy import text
from sqlmodel import SQLModel
from ..db.session import engine

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
        await conn.execute(text("""
            INSERT INTO public.system_audit_logs
                (action_entry, user_id, authority_role, net_address)
            SELECT * FROM (VALUES
                ('System audit logging enabled', 'system', 'System', '127.0.0.1'),
                ('Database-backed audit trail initialized', 'system', 'System', '127.0.0.1'),
                ('Admin dashboard audit feed initialized', 'system', 'System Admin', '127.0.0.1')
            ) AS seed(action_entry, user_id, authority_role, net_address)
            WHERE NOT EXISTS (SELECT 1 FROM public.system_audit_logs)
        """))
