-- Migration 005: Road hazard reports used by Valhalla pedestrian routing
-- Active, unresolved rows become exclusion polygons so citizens are rerouted around blocked roads

CREATE TABLE IF NOT EXISTS road_hazard_reports (
    id SERIAL PRIMARY KEY,
    hazard_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    radius_meters INTEGER NOT NULL DEFAULT 75,
    severity VARCHAR(20) NOT NULL DEFAULT 'high',
    road_name VARCHAR(255),
    reporter_name VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    is_resolved BOOLEAN DEFAULT false,
    reported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT road_hazard_reports_radius_check CHECK (radius_meters >= 10 AND radius_meters <= 2000),
    CONSTRAINT road_hazard_reports_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT road_hazard_reports_type_check CHECK (
        hazard_type IN (
            'flood',
            'debris',
            'fire',
            'landslide',
            'collapsed_road',
            'downed_power_line',
            'other'
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_road_hazard_reports_active
    ON road_hazard_reports (is_active, is_resolved);

CREATE INDEX IF NOT EXISTS idx_road_hazard_reports_severity
    ON road_hazard_reports (severity);

CREATE INDEX IF NOT EXISTS idx_road_hazard_reports_reported_at
    ON road_hazard_reports (reported_at);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        CREATE INDEX IF NOT EXISTS idx_road_hazard_reports_location
            ON road_hazard_reports USING GIST (ST_MakePoint(longitude, latitude));
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_road_hazard_reports_updated_at ON road_hazard_reports;
CREATE TRIGGER update_road_hazard_reports_updated_at
    BEFORE UPDATE ON road_hazard_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
