-- Migration 004: Store alert classification separately from the free-text message

ALTER TABLE emergency_alert
    ADD COLUMN IF NOT EXISTS disaster_type VARCHAR(50) NOT NULL DEFAULT 'other',
    ADD COLUMN IF NOT EXISTS severity VARCHAR(20) NOT NULL DEFAULT 'high';