from sqlalchemy import text
from sqlmodel import SQLModel
from ..db.session import engine

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS public.rbac_role_permissions (
                role_name VARCHAR(100) NOT NULL,
                permission_id VARCHAR(100) NOT NULL,
                allowed BOOLEAN NOT NULL DEFAULT FALSE,
                updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                PRIMARY KEY (role_name, permission_id)
            )
        """))
        await conn.execute(text("""
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
        """))
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
