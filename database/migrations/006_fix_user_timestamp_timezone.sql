-- Migration 006: Keep the ORM's UTC-aware timestamps compatible with PostgreSQL.

ALTER TABLE IF EXISTS "user"
    ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE
    USING created_at AT TIME ZONE 'UTC';

ALTER TABLE IF EXISTS "user"
    ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE
    USING updated_at AT TIME ZONE 'UTC';