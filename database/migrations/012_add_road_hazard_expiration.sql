ALTER TABLE public.road_hazard_reports
    ADD COLUMN IF NOT EXISTS expires_at timestamp without time zone;

UPDATE public.road_hazard_reports
SET expires_at = reported_at + CASE lower(hazard_type::text)
    WHEN 'flood' THEN interval '6 hours'
    WHEN 'fire' THEN interval '6 hours'
    WHEN 'debris' THEN interval '24 hours'
    WHEN 'other' THEN interval '24 hours'
    WHEN 'landslide' THEN interval '72 hours'
    WHEN 'collapsed_road' THEN interval '7 days'
    WHEN 'downed_power_line' THEN interval '7 days'
    ELSE interval '24 hours'
END
WHERE expires_at IS NULL;

ALTER TABLE public.road_hazard_reports
    ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_road_hazard_reports_expires_at
    ON public.road_hazard_reports (expires_at);

CREATE OR REPLACE FUNCTION public.set_road_hazard_expiration()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT'
       OR NEW.hazard_type IS DISTINCT FROM OLD.hazard_type
       OR NEW.reported_at IS DISTINCT FROM OLD.reported_at THEN
        NEW.expires_at := NEW.reported_at + CASE lower(NEW.hazard_type::text)
            WHEN 'flood' THEN interval '6 hours'
            WHEN 'fire' THEN interval '6 hours'
            WHEN 'debris' THEN interval '24 hours'
            WHEN 'other' THEN interval '24 hours'
            WHEN 'landslide' THEN interval '72 hours'
            WHEN 'collapsed_road' THEN interval '7 days'
            WHEN 'downed_power_line' THEN interval '7 days'
            ELSE interval '24 hours'
        END;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_road_hazard_expiration ON public.road_hazard_reports;
CREATE TRIGGER set_road_hazard_expiration
    BEFORE INSERT OR UPDATE ON public.road_hazard_reports
    FOR EACH ROW EXECUTE FUNCTION public.set_road_hazard_expiration();