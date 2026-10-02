-- Migration 008: Track assignment state and rescuer onboard each deployed vehicle.

ALTER TABLE IF EXISTS rescuer_profile
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'available';

ALTER TABLE IF EXISTS vehicles
    ADD COLUMN IF NOT EXISTS rescuer_onboard VARCHAR(255);