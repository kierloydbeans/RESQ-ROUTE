-- Phase 3: dispatcher-only hazard layers with optional citizen publication.
CREATE TABLE IF NOT EXISTS public.hazard_map_layers (
    id BIGSERIAL PRIMARY KEY,
    source_grid_id TEXT NOT NULL UNIQUE,
    hazard_type TEXT NOT NULL DEFAULT 'flood',
    hazard_level TEXT NOT NULL DEFAULT 'low',
    hazard_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    geometry JSONB NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    source TEXT NOT NULL DEFAULT 'UP NOAH',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT hazard_map_layers_score_range
        CHECK (hazard_score >= 0 AND hazard_score <= 1),
    CONSTRAINT hazard_map_layers_level_values
        CHECK (hazard_level IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_hazard_map_layers_published
    ON public.hazard_map_layers (is_published);
CREATE INDEX IF NOT EXISTS idx_hazard_map_layers_score
    ON public.hazard_map_layers (hazard_score DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hazard_map_layers TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.hazard_map_layers_id_seq TO service_role;
