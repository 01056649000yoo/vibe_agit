BEGIN;

ALTER TABLE public.classes
    ALTER COLUMN vocab_tower_content_version SET DEFAULT 'v2';

COMMENT ON COLUMN public.classes.vocab_tower_content_version IS
    'v2 잠긴 현재 덱이 표준 출제자료다. v1은 운영 비상 롤백용으로만 보존한다.';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.classes class
        WHERE class.deleted_at IS NULL
          AND class.vocab_tower_content_version = 'v1'
          AND (
              SELECT count(*)
              FROM public.vocab_tower_v2_review_decks deck
              WHERE deck.grade = class.vocab_tower_grade
                AND deck.review_status = 'locked'
          ) <> 10
    ) THEN
        RAISE EXCEPTION '활성 학급을 V2로 전환하려면 학년별 잠긴 덱 10개가 필요합니다.'
            USING ERRCODE = '55000';
    END IF;
END;
$$;

UPDATE public.vocab_tower_runs run
   SET status = 'abandoned',
       finish_reason = 'exited',
       finished_at = NOW()
FROM public.classes class
WHERE class.id = run.class_id
  AND class.deleted_at IS NULL
  AND class.vocab_tower_content_version = 'v1'
  AND run.status = 'active';

ALTER TABLE public.classes DISABLE TRIGGER enforce_vocab_tower_class_content_version_v2;

UPDATE public.classes
   SET vocab_tower_content_version = 'v2',
       vocab_tower_reset_date = NOW()
 WHERE deleted_at IS NULL
   AND vocab_tower_content_version = 'v1';

ALTER TABLE public.classes ENABLE TRIGGER enforce_vocab_tower_class_content_version_v2;

COMMIT;
