ALTER TABLE public.evacuee
    ADD COLUMN IF NOT EXISTS household_id INTEGER
        REFERENCES public.household(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS household_name VARCHAR(120) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS household_member_id INTEGER
        REFERENCES public.household_member(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS has_account BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_evacuee_household_id
    ON public.evacuee (household_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_evacuee_qr_code
    ON public.evacuee (qr_code);

CREATE INDEX IF NOT EXISTS idx_evacuee_shelter_active_check_in
    ON public.evacuee (shelter_id, check_in_time DESC)
    WHERE check_out_time IS NULL;
