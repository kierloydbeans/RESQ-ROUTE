ALTER TABLE public.vehicle
    ALTER COLUMN status SET DEFAULT 'available';

UPDATE public.vehicle
SET status = 'available'
WHERE status IS NULL;

ALTER TABLE public.vehicle
    ALTER COLUMN status SET NOT NULL;
