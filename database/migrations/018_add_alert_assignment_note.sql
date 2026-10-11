ALTER TABLE IF EXISTS emergency_alert
    ADD COLUMN IF NOT EXISTS assignment_note TEXT;
