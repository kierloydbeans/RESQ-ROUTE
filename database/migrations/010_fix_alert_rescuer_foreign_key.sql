-- Migration 010: assigned_rescuer_id stores the rescuer's user.id.
-- The original database constraint incorrectly referenced rescuer_profile.id.

ALTER TABLE IF EXISTS emergency_alert
    DROP CONSTRAINT IF EXISTS emergency_alert_assigned_rescuer_id_fkey;

ALTER TABLE IF EXISTS emergency_alert
    ADD CONSTRAINT emergency_alert_assigned_rescuer_id_fkey
    FOREIGN KEY (assigned_rescuer_id) REFERENCES "user" (id) ON DELETE SET NULL;
