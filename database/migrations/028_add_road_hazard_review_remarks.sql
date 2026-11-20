ALTER TABLE public.road_hazard_reports
ADD COLUMN IF NOT EXISTS review_remarks VARCHAR(1000);
