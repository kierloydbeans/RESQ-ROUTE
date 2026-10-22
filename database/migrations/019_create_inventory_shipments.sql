CREATE TABLE IF NOT EXISTS public.inventory_shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID NOT NULL
        REFERENCES public.inventory(id) ON DELETE RESTRICT,
    center_id INTEGER NOT NULL
        REFERENCES public.center(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'arrived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    arrived_at TIMESTAMPTZ,
    CONSTRAINT inventory_shipments_arrival_status_check
        CHECK ((status = 'pending' AND arrived_at IS NULL)
            OR (status = 'arrived' AND arrived_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_inventory_shipments_pending_created
    ON public.inventory_shipments (created_at DESC)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_inventory_shipments_inventory_id
    ON public.inventory_shipments (inventory_id);

CREATE INDEX IF NOT EXISTS idx_inventory_shipments_center_id
    ON public.inventory_shipments (center_id);

ALTER TABLE public.inventory_shipments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.inventory_shipments FROM anon, authenticated;
GRANT ALL ON public.inventory_shipments TO service_role;
