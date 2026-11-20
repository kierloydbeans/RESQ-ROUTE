ALTER TABLE public.road_hazard_reports
ADD COLUMN IF NOT EXISTS image_url VARCHAR(2048);
