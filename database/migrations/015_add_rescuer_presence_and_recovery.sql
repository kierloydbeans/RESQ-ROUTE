ALTER TYPE public.rescuerstatus
    ADD VALUE IF NOT EXISTS 'OFF_DUTY';

ALTER TABLE public.rescuer_profile
    ADD COLUMN IF NOT EXISTS recovering_until timestamp without time zone,
    ADD COLUMN IF NOT EXISTS last_seen_at timestamp without time zone;
