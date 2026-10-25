-- Create center_inventory junction table for many-to-many relationship
-- Run this in Supabase SQL Editor

-- 1. Create the junction table
CREATE TABLE IF NOT EXISTS public.center_inventory (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
    center_id INTEGER NOT NULL REFERENCES public.center(id) ON DELETE CASCADE,
    current_stock INTEGER NOT NULL DEFAULT 0,
    max_stock INTEGER NOT NULL DEFAULT 1000,
    last_shipment TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT center_inventory_unique UNIQUE (inventory_id, center_id)
);

-- 2. Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_center_inventory_inventory_id ON public.center_inventory(inventory_id);
CREATE INDEX IF NOT EXISTS idx_center_inventory_center_id ON public.center_inventory(center_id);

-- 3. Enable Row Level Security
ALTER TABLE public.center_inventory ENABLE ROW LEVEL SECURITY;

-- 4. Create policies for access
CREATE POLICY "Enable read access for all users" ON public.center_inventory
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users" ON public.center_inventory
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON public.center_inventory
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON public.center_inventory
    FOR DELETE USING (auth.role() = 'authenticated');

-- 5. Modify inventory table - remove center_id column (if it exists from previous migration)
-- The inventory table will now represent MASTER item definitions with TOTAL quantities
-- Total = sum of all center_inventory.current_stock for that inventory_id

-- Remove center_id from inventory (run if you previously added it)
-- ALTER TABLE public.inventory DROP COLUMN IF EXISTS center_id;

-- 6. Create view for consolidated inventory with center breakdown
CREATE OR REPLACE VIEW public.inventory_with_centers AS
SELECT
    i.id AS inventory_id,
    i.item_description,
    i.current_stock AS total_current_stock,
    i.max_stock AS total_max_stock,
    i.status AS overall_status,
    i.last_shipment AS overall_last_shipment,
    COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'center_id', c.id,
                'center_name', c.name,
                'center_address', c.address,
                'current_stock', ci.current_stock,
                'max_stock', ci.max_stock,
                'last_shipment', ci.last_shipment
            )
        ) FILTER (WHERE ci.id IS NOT NULL),
        '[]'::jsonb
    ) AS center_allocations
FROM public.inventory i
LEFT JOIN public.center_inventory ci ON i.id = ci.inventory_id
LEFT JOIN public.center c ON ci.center_id = c.id
GROUP BY i.id, i.item_description, i.current_stock, i.max_stock, i.status, i.last_shipment;

-- 7. Create view for per-center inventory display
CREATE OR REPLACE VIEW public.center_inventory_detail AS
SELECT
    ci.id,
    ci.inventory_id,
    i.item_description,
    ci.center_id,
    c.name AS center_name,
    c.address AS center_address,
    ci.current_stock,
    ci.max_stock,
    ci.last_shipment,
    CASE
        WHEN ci.current_stock <= 0 THEN 'CRITICAL'
        WHEN ci.current_stock <= 100 THEN 'CRITICAL'
        WHEN ci.current_stock <= 300 THEN 'LOW'
        ELSE 'OK'
    END AS status,
    ci.created_at,
    ci.updated_at
FROM public.center_inventory ci
JOIN public.inventory i ON ci.inventory_id = i.id
JOIN public.center c ON ci.center_id = c.id;

-- 8. Grant permissions
GRANT SELECT ON public.center_inventory TO anon;
GRANT SELECT ON public.inventory_with_centers TO anon;
GRANT SELECT ON public.center_inventory_detail TO anon;
GRANT ALL ON public.center_inventory TO authenticated;

-- 9. Optional: Trigger to update inventory totals from center_inventory
-- (Run this if you want automatic sync of totals)

/*
CREATE OR REPLACE FUNCTION update_inventory_totals()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.inventory
    SET
        current_stock = (
            SELECT COALESCE(SUM(current_stock), 0)
            FROM public.center_inventory
            WHERE inventory_id = NEW.inventory_id
        ),
        max_stock = (
            SELECT COALESCE(SUM(max_stock), 0)
            FROM public.center_inventory
            WHERE inventory_id = NEW.inventory_id
        ),
        status = CASE
            WHEN (SELECT COALESCE(SUM(current_stock), 0) FROM public.center_inventory WHERE inventory_id = NEW.inventory_id) <= 100 THEN 'CRITICAL'
            WHEN (SELECT COALESCE(SUM(current_stock), 0) FROM public.center_inventory WHERE inventory_id = NEW.inventory_id) <= 300 THEN 'LOW'
            ELSE 'OK'
        END,
        last_shipment = (
            SELECT MAX(last_shipment)
            FROM public.center_inventory
            WHERE inventory_id = NEW.inventory_id
        ),
        updated_at = NOW()
    WHERE id = NEW.inventory_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_inventory_totals
AFTER INSERT OR UPDATE OR DELETE ON public.center_inventory
FOR EACH ROW EXECUTE FUNCTION update_inventory_totals();
*/

-- 10. Seed sample data (adjust inventory_id and center_id to match your actual IDs)
/*
-- First, create master inventory items
INSERT INTO public.inventory (item_description, current_stock, max_stock, status, last_shipment)
VALUES
    ('Family Food Packs', 0, 0, 'OK', NOW()),
    ('Hygiene Kits', 0, 0, 'OK', NOW()),
    ('Sleeping Mats', 0, 0, 'OK', NOW()),
    ('Blankets', 0, 0, 'OK', NOW()),
    ('Water Containers (10L)', 0, 0, 'OK', NOW()),
    ('Medicines (Basic)', 0, 0, 'OK', NOW()),
    ('Portable Toilets', 0, 0, 'OK', NOW());

-- Then, allocate to centers (replace inventory_id and center_id with actual UUIDs/integers)
INSERT INTO public.center_inventory (inventory_id, center_id, current_stock, max_stock, last_shipment)
VALUES
    -- Center 1 allocations
    ((SELECT id FROM inventory WHERE item_description = 'Family Food Packs'), (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 0), 500, 1000, NOW() - INTERVAL '7 days'),
    ((SELECT id FROM inventory WHERE item_description = 'Hygiene Kits'), (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 0), 150, 300, NOW() - INTERVAL '14 days'),
    ((SELECT id FROM inventory WHERE item_description = 'Sleeping Mats'), (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 0), 80, 200, NOW() - INTERVAL '21 days'),
    ((SELECT id FROM inventory WHERE item_description = 'Blankets'), (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 0), 300, 500, NOW() - INTERVAL '5 days'),
    ((SELECT id FROM inventory WHERE item_description = 'Water Containers (10L)'), (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 0), 200, 400, NOW() - INTERVAL '10 days'),

    -- Center 2 allocations
    ((SELECT id FROM inventory WHERE item_description = 'Family Food Packs'), (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 1), 750, 1200, NOW() - INTERVAL '3 days'),
    ((SELECT id FROM inventory WHERE item_description = 'Hygiene Kits'), (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 1), 50, 200, NOW() - INTERVAL '30 days'),
    ((SELECT id FROM inventory WHERE item_description = 'Sleeping Mats'), (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 1), 180, 300, NOW() - INTERVAL '7 days'),
    ((SELECT id FROM inventory WHERE item_description = 'Blankets'), (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 1), 120, 250, NOW() - INTERVAL '14 days'),
    ((SELECT id FROM inventory WHERE item_description = 'Medicines (Basic)'), (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 1), 100, 200, NOW() - INTERVAL '2 days'),

    -- Center 3 allocations
    ((SELECT id FROM inventory WHERE item_description = 'Family Food Packs'), (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 2), 300, 800, NOW() - INTERVAL '10 days'),
    ((SELECT id FROM inventory WHERE item_description = 'Hygiene Kits'), (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 2), 200, 400, NOW() - INTERVAL '7 days'),
    ((SELECT id FROM inventory WHERE item_description = 'Sleeping Mats'), (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 2), 45, 150, NOW() - INTERVAL '21 days'),
    ((SELECT id FROM inventory WHERE item_description = 'Blankets'), (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 2), 250, 400, NOW() - INTERVAL '5 days'),
    ((SELECT id FROM inventory WHERE item_description = 'Portable Toilets'), (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 2), 10, 20, NOW() - INTERVAL '14 days');

-- After seeding, run the trigger manually or re-insert to sync totals
*/