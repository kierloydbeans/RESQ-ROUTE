-- Migration 009: Allow a rescuer to be assigned before acknowledging dispatch.

ALTER TYPE rescuerstatus
    ADD VALUE IF NOT EXISTS 'ASSIGNED';
