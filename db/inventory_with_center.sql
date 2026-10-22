-- Add center_id column to inventory table and seed data
-- Run this in Supabase SQL Editor

-- 1. Add center_id column to inventory table (INTEGER to match center.id)
ALTER TABLE public.inventory
ADD COLUMN IF NOT EXISTS center_id INTEGER REFERENCES center(id) ON DELETE SET NULL;

-- 2. Create index for faster queries by center
CREATE INDEX IF NOT EXISTS idx_inventory_center_id ON public.inventory(center_id);

-- 3. Update existing inventory items to assign them to centers (adjust as needed)
-- This assigns items to the first 3 centers in round-robin fashion
-- You can customize this based on your actual centers and inventory

-- First, let's see what centers exist:
-- SELECT id, name FROM center ORDER BY id;

-- Example: Update inventory items to assign to centers
-- (Run this after you have centers and inventory data)

-- If you want to assign existing inventory items to centers:
-- UPDATE public.inventory
-- SET center_id = (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET (random() * (SELECT count(*) FROM center)::int))
-- WHERE center_id IS NULL;

-- 4. Create a view for easier querying with center name
CREATE OR REPLACE VIEW inventory_with_center AS
SELECT
    i.id,
    i.item_description,
    i.current_stock,
    i.max_stock,
    i.status,
    i.last_shipment,
    i.center_id,
    c.name AS center_name,
    c.address AS center_address
FROM public.inventory i
LEFT JOIN center c ON i.center_id = c.id;

-- 5. Grant permissions
GRANT SELECT ON public.inventory TO anon;
GRANT SELECT ON inventory_with_center TO anon;
GRANT ALL ON public.inventory TO authenticated;

-- 6. Optional: Seed sample inventory data with center assignments
-- (Uncomment and adjust center_id values to match your actual center IDs)

/*
INSERT INTO public.inventory (item_description, current_stock, max_stock, status, last_shipment, center_id)
VALUES
    -- Center 1 items
    ('Family Food Packs', 500, 1000, 'OK', NOW() - INTERVAL '7 days', (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 0)),
    ('Hygiene Kits', 150, 300, 'LOW', NOW() - INTERVAL '14 days', (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 0)),
    ('Sleeping Mats', 80, 200, 'CRITICAL', NOW() - INTERVAL '21 days', (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 0)),
    ('Blankets', 300, 500, 'OK', NOW() - INTERVAL '5 days', (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 0)),
    ('Water Containers (10L)', 200, 400, 'OK', NOW() - INTERVAL '10 days', (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 0)),

    -- Center 2 items
    ('Family Food Packs', 750, 1200, 'OK', NOW() - INTERVAL '3 days', (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 1)),
    ('Hygiene Kits', 50, 200, 'CRITICAL', NOW() - INTERVAL '30 days', (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 1)),
    ('Sleeping Mats', 180, 300, 'OK', NOW() - INTERVAL '7 days', (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 1)),
    ('Blankets', 120, 250, 'LOW', NOW() - INTERVAL '14 days', (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 1)),
    ('Medicines (Basic)', 100, 200, 'OK', NOW() - INTERVAL '2 days', (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 1)),

    -- Center 3 items
    ('Family Food Packs', 300, 800, 'LOW', NOW() - INTERVAL '10 days', (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 2)),
    ('Hygiene Kits', 200, 400, 'OK', NOW() - INTERVAL '7 days', (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 2)),
    ('Sleeping Mats', 45, 150, 'CRITICAL', NOW() - INTERVAL '21 days', (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 2)),
    ('Blankets', 250, 400, 'OK', NOW() - INTERVAL '5 days', (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 2)),
    ('Portable Toilets', 10, 20, 'LOW', NOW() - INTERVAL '14 days', (SELECT id FROM center ORDER BY id LIMIT 1 OFFSET 2))

ON CONFLICT DO NOTHING;
*/