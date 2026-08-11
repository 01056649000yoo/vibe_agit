DO $$
DECLARE
    v_bucket storage.buckets%ROWTYPE;
    v_policy_count INTEGER;
BEGIN
    SELECT * INTO v_bucket
    FROM storage.buckets
    WHERE id = 'report-images';

    IF v_bucket.id IS NULL
       OR v_bucket.public IS TRUE
       OR v_bucket.file_size_limit <> 1572864
       OR NOT (v_bucket.allowed_mime_types @> ARRAY['image/webp', 'image/jpeg']::TEXT[]) THEN
        RAISE EXCEPTION 'report-images bucket contract mismatch';
    END IF;

    SELECT count(*) INTO v_policy_count
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN (
          'Report_Images_Select_V1',
          'Report_Images_Insert_V1',
          'Report_Images_Delete_V1'
      );
    IF v_policy_count <> 3 THEN
        RAISE EXCEPTION 'report image RLS policies are incomplete';
    END IF;

    IF to_regprocedure('public.validate_report_post_structure()') IS NULL THEN
        RAISE EXCEPTION 'report structure validation trigger function missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_validate_report_post_structure'
          AND tgrelid = 'public.student_posts'::regclass
          AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'report structure validation trigger missing';
    END IF;
END;
$$;
