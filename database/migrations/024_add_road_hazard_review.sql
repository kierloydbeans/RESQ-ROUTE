ALTER TABLE public.road_hazard_reports
    ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) NOT NULL DEFAULT 'approved',
    ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

ALTER TABLE public.road_hazard_reports
    DROP CONSTRAINT IF EXISTS road_hazard_reports_review_status_check;

ALTER TABLE public.road_hazard_reports
    ADD CONSTRAINT road_hazard_reports_review_status_check
    CHECK (review_status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_road_hazard_reports_review_status
    ON public.road_hazard_reports (review_status, reported_at DESC);
