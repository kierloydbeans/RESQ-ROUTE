-- Migration 011: Add gallery image URLs to evacuation centers.

ALTER TABLE IF EXISTS public.center
    ADD COLUMN IF NOT EXISTS image_url VARCHAR(2048),
    ADD COLUMN IF NOT EXISTS image_url_2 VARCHAR(2048),
    ADD COLUMN IF NOT EXISTS image_url_3 VARCHAR(2048);

-- Keep the legacy plural table used by database/seed_data_caloocan.sql compatible.
ALTER TABLE IF EXISTS public.centers
    ADD COLUMN IF NOT EXISTS image_url VARCHAR(2048),
    ADD COLUMN IF NOT EXISTS image_url_2 VARCHAR(2048),
    ADD COLUMN IF NOT EXISTS image_url_3 VARCHAR(2048);