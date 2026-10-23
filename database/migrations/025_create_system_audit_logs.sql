CREATE TABLE IF NOT EXISTS public.system_audit_logs (
    id SERIAL PRIMARY KEY,
    action_entry VARCHAR NOT NULL,
    user_id VARCHAR NOT NULL,
    authority_role VARCHAR NOT NULL,
    net_address VARCHAR NOT NULL,
    timestamp TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_system_audit_logs_timestamp
    ON public.system_audit_logs (timestamp DESC);

INSERT INTO public.system_audit_logs
    (action_entry, user_id, authority_role, net_address, timestamp)
SELECT action_entry, user_id, authority_role, net_address, timestamp
FROM (VALUES
    ('System audit logging enabled', 'system', 'system', '127.0.0.1', NOW()),
    ('Database-backed audit trail initialized', 'system', 'system', '127.0.0.1', NOW()),
    ('Admin dashboard audit feed initialized', 'system', 'system', '127.0.0.1', NOW())
) AS seed(action_entry, user_id, authority_role, net_address, timestamp)
WHERE NOT EXISTS (SELECT 1 FROM public.system_audit_logs);
