-- Migration 007: Store vehicles deployed with an assigned rescuer as JSON IDs.

ALTER TABLE IF EXISTS emergency_alert
    ADD COLUMN IF NOT EXISTS assigned_vehicle_ids TEXT;