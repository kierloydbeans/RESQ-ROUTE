ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'CENTER_COORDINATOR';

ALTER TABLE public."user"
    ADD COLUMN IF NOT EXISTS assigned_center_id INTEGER
        REFERENCES public.center(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_assigned_center_id
    ON public."user" (assigned_center_id)
    WHERE assigned_center_id IS NOT NULL;
