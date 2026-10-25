-- Migration 026: Store the public Supabase Storage URL for SOS alert photos.

ALTER TABLE IF EXISTS public.emergency_alert
    ADD COLUMN IF NOT EXISTS image_url VARCHAR(2048);
