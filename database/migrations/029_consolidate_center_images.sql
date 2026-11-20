-- Migration 029: Store the evacuation-center gallery in one JSON array column.

UPDATE public.center
SET image_url = (
    SELECT json_agg(url)::text
    FROM unnest(ARRAY[
        NULLIF(image_url, ''),
        NULLIF(image_url_2, ''),
        NULLIF(image_url_3, '')
    ]) AS url
    WHERE url IS NOT NULL
)
WHERE image_url_2 IS NOT NULL
   OR image_url_3 IS NOT NULL
   OR (image_url IS NOT NULL AND left(trim(image_url), 1) <> '[');

ALTER TABLE IF EXISTS public.center
    DROP COLUMN IF EXISTS image_url_2,
    DROP COLUMN IF EXISTS image_url_3;

DO $$
BEGIN
    IF to_regclass('public.centers') IS NOT NULL THEN
        EXECUTE $sql$
            UPDATE public.centers
            SET image_url = (
                SELECT json_agg(url)::text
                FROM unnest(ARRAY[
                    NULLIF(image_url, ''),
                    NULLIF(image_url_2, ''),
                    NULLIF(image_url_3, '')
                ]) AS url
                WHERE url IS NOT NULL
            )
            WHERE image_url_2 IS NOT NULL
               OR image_url_3 IS NOT NULL
               OR (image_url IS NOT NULL AND left(trim(image_url), 1) <> '[')
        $sql$;
        EXECUTE 'ALTER TABLE public.centers DROP COLUMN IF EXISTS image_url_2, DROP COLUMN IF EXISTS image_url_3';
    END IF;
END $$;
