-- 운영 DB 계약 스모크: 실제 활성 학생의 인증 문맥을 사용하지만 전체를 ROLLBACK한다.
-- 실행: docker exec -i agit-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < scripts/smoke-writing-policy.sql

BEGIN;

DO $$
DECLARE
    v_student_id UUID;
    v_auth_id UUID;
    v_class_id UUID;
    v_before_points INTEGER;
    v_after_points INTEGER;
    v_first JSONB;
    v_edit JSONB;
    v_second JSONB;
    v_rewrite JSONB;
    v_first_post_id UUID;
    v_library_item_id UUID;
    v_claim_count INTEGER;
    v_log_count INTEGER;
    v_short_rejected BOOLEAN := false;
    v_book_one JSONB := jsonb_build_object(
        'source', 'manual',
        'title', '정책 스모크 첫 번째 책',
        'authors', jsonb_build_array('테스트 작가')
    );
    v_book_two JSONB := jsonb_build_object(
        'source', 'manual',
        'title', '정책 스모크 두 번째 책',
        'authors', jsonb_build_array('테스트 작가')
    );
BEGIN
    SELECT s.id, s.auth_id, s.class_id, COALESCE(s.total_points, 0)
    INTO v_student_id, v_auth_id, v_class_id, v_before_points
    FROM public.students s
    WHERE s.auth_id IS NOT NULL
      AND s.is_active IS DISTINCT FROM false
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    ORDER BY s.created_at
    LIMIT 1;

    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '스모크에 사용할 활성 학생이 없습니다.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_auth_id::TEXT, true);
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', v_auth_id, 'role', 'authenticated')::TEXT,
        true
    );

    UPDATE public.class_writing_policies
    SET min_chars = 10,
        min_paragraphs = 2,
        base_reward = 7,
        bonus_enabled = true,
        bonus_threshold = 5,
        bonus_reward = 3,
        daily_reward_limit = 1
    WHERE class_id = v_class_id
      AND writing_type = 'reading_log';

    BEGIN
        PERFORM public.upsert_my_reading_log(
            NULL, v_book_one, '분량 미달', '짧음', 'private', 'completed'
        );
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
        v_short_rejected := true;
    END;
    IF NOT v_short_rejected THEN
        RAISE EXCEPTION '분량 미달 독서록이 완료 처리되었습니다.';
    END IF;

    v_first := public.upsert_my_reading_log(
        NULL, v_book_one, '첫 완료', E'열 글자를 충분히 넘긴 첫 문단입니다.\n둘째 문단입니다.', 'private', 'completed'
    );
    v_first_post_id := (v_first ->> 'post_id')::UUID;
    v_library_item_id := (v_first ->> 'library_item_id')::UUID;

    IF (v_first ->> 'points_awarded')::INTEGER <> 10 OR v_first ->> 'reward_status' <> 'awarded' THEN
        RAISE EXCEPTION '최초 완료 보상 또는 보너스 계산이 다릅니다: %', v_first;
    END IF;

    v_edit := public.upsert_my_reading_log(
        v_first_post_id, v_book_one, '완료 후 수정', E'수정해도 충분히 긴 첫 문단입니다.\n수정한 둘째 문단입니다.', 'private', 'completed'
    );
    IF (v_edit ->> 'points_awarded')::INTEGER <> 0 OR v_edit ->> 'reward_status' <> 'already_completed' THEN
        RAISE EXCEPTION '완료 후 수정에 포인트가 다시 지급되었습니다: %', v_edit;
    END IF;

    v_second := public.upsert_my_reading_log(
        NULL, v_book_two, '하루 두 번째 완료', E'분량을 충분히 채운 첫 문단입니다.\n분량을 채운 둘째 문단입니다.', 'private', 'completed'
    );
    IF (v_second ->> 'points_awarded')::INTEGER <> 0 OR v_second ->> 'reward_status' <> 'daily_limit' THEN
        RAISE EXCEPTION '일일 보상 상한이 적용되지 않았습니다: %', v_second;
    END IF;

    DELETE FROM public.student_posts WHERE id = v_first_post_id;
    v_rewrite := public.upsert_my_reading_log(
        NULL, v_book_one, '삭제 후 재작성', E'다시 써도 충분히 긴 첫 문단입니다.\n다시 쓴 둘째 문단입니다.', 'private', 'completed'
    );
    IF (v_rewrite ->> 'library_item_id')::UUID IS DISTINCT FROM v_library_item_id
       OR (v_rewrite ->> 'points_awarded')::INTEGER <> 0
       OR v_rewrite ->> 'reward_status' <> 'already_claimed' THEN
        RAISE EXCEPTION '같은 책 삭제·재작성 중복 보상이 차단되지 않았습니다: %', v_rewrite;
    END IF;

    SELECT COALESCE(total_points, 0)
    INTO v_after_points
    FROM public.students
    WHERE id = v_student_id;
    IF v_after_points <> v_before_points + 10 THEN
        RAISE EXCEPTION '학생 포인트 합계가 예상과 다릅니다: % → %', v_before_points, v_after_points;
    END IF;

    SELECT count(*)::INTEGER
    INTO v_claim_count
    FROM public.writing_reward_claims
    WHERE student_id = v_student_id
      AND writing_type = 'reading_log'
      AND source_key IN (
          v_library_item_id::TEXT,
          (v_second ->> 'library_item_id')
      );
    IF v_claim_count <> 2 THEN
        RAISE EXCEPTION '완료 원장 수가 예상과 다릅니다: %', v_claim_count;
    END IF;

    SELECT count(*)::INTEGER
    INTO v_log_count
    FROM public.point_logs
    WHERE student_id = v_student_id
      AND post_id = v_first_post_id
      AND activity_type = 'writing_reward'
      AND amount = 10;
    IF v_log_count <> 1 THEN
        RAISE EXCEPTION '포인트 로그가 정확히 한 번 기록되지 않았습니다: %', v_log_count;
    END IF;

    RAISE NOTICE 'writing-policy smoke passed';
END;
$$;

ROLLBACK;
