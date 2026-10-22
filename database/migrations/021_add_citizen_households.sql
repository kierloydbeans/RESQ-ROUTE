CREATE TABLE IF NOT EXISTS public.household (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE
        REFERENCES public."user"(id) ON DELETE CASCADE,
    household_name VARCHAR(120) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.household_member (
    id SERIAL PRIMARY KEY,
    household_id INTEGER NOT NULL
        REFERENCES public.household(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL CHECK (length(btrim(name)) > 0),
    has_account BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_household_member_household_id
    ON public.household_member (household_id);

ALTER TABLE public.household ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_member ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.household, public.household_member FROM anon, authenticated;
GRANT ALL ON public.household, public.household_member TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.household_id_seq, public.household_member_id_seq TO service_role;
