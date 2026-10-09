UPDATE public.rescuer_profile
SET status = 'OFF_DUTY'
WHERE last_seen_at IS NULL;
