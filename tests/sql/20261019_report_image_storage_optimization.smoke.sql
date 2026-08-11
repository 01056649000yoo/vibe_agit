DO $$
DECLARE
    v_bucket storage.buckets%ROWTYPE;
BEGIN
    SELECT * INTO v_bucket
    FROM storage.buckets
    WHERE id = 'report-images';

    IF v_bucket.id IS NULL
       OR v_bucket.public IS TRUE
       OR v_bucket.file_size_limit <> 262144
       OR NOT (v_bucket.allowed_mime_types @> ARRAY['image/webp', 'image/jpeg']::TEXT[]) THEN
        RAISE EXCEPTION 'optimized report-images bucket contract mismatch';
    END IF;
END;
$$;
