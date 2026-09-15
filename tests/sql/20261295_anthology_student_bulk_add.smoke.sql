-- 바깥 실행기가 전체 트랜잭션을 롤백하므로 운영 데이터는 바뀌지 않는다.
-- 문집 "학생째 담기": 학생 기준으로 글을 고를 수 있고, 학생 목록의 글 수가 실제 검색 결과와 같은지 본다.

-- [1] 두 함수가 있고, 검색 함수가 student_id 조건을 가진다. 기존 자격 관문은 그대로다.
DO $$
DECLARE
    v_def TEXT := pg_get_functiondef('public.get_class_agit_candidates_v2'::regproc);
BEGIN
    IF v_def NOT LIKE '%(v_student IS NULL OR p.student_id=v_student)%' THEN
        RAISE EXCEPTION '작품 검색에 학생 조건이 없습니다.';
    END IF;
    IF v_def NOT LIKE '%(v_mission IS NULL OR p.mission_id=v_mission)%' THEN
        RAISE EXCEPTION '미션 조건이 사라졌습니다 — 주제째 담기가 깨집니다.';
    END IF;
    IF v_def NOT LIKE '%is_confirmed IS TRUE%' OR v_def NOT LIKE '%is_returned IS NOT TRUE%' OR v_def NOT LIKE '%visibility=''class''%' THEN
        RAISE EXCEPTION '승인·반려·공개 관문 가운데 하나가 사라졌습니다.';
    END IF;
    IF to_regproc('public.get_class_agit_students_v1') IS NULL THEN
        RAISE EXCEPTION '학생 목록 함수가 없습니다.';
    END IF;
END;
$$;

-- [2] 실제 데이터로 본다: 담을 글이 있는 학생 하나를 골라, 그 담임으로 두 함수를 부른다.
--     학생 목록의 review_count 와 학생 조건 검색의 편수가 같아야 하고, 검색 결과는 전부 그 학생 글이어야 한다.
SELECT set_config('test.student', pick.student_id::TEXT, true),
       set_config('test.class', pick.class_id::TEXT, true),
       set_config('test.teacher', pick.teacher_id::TEXT, true),
       set_config('test.expected', pick.n::TEXT, true)
FROM (
    SELECT p.student_id, p.class_id, c.teacher_id, count(*) AS n
    FROM public.student_posts p
    JOIN public.classes c ON c.id = p.class_id
    JOIN public.students s ON s.id = p.student_id AND s.class_id = p.class_id AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE
    JOIN public.writing_missions m ON m.id = p.mission_id AND m.class_id = p.class_id
    WHERE p.writing_context = 'assignment' AND p.is_submitted IS TRUE AND p.is_confirmed IS TRUE
      AND p.is_returned IS NOT TRUE AND p.visibility = 'class'
      AND public.class_agit_mission_format_v1(m.input_template, m.mission_type) IN ('prose', 'poem')
      AND public.class_agit_class_is_allowed_v1(c.id)
    GROUP BY p.student_id, p.class_id, c.teacher_id
    HAVING count(*) BETWEEN 2 AND 50
    ORDER BY count(*) DESC
    LIMIT 1
) pick;

DO $$
DECLARE
    v_student UUID := NULLIF(current_setting('test.student', true), '')::UUID;
    v_class UUID := NULLIF(current_setting('test.class', true), '')::UUID;
    v_teacher UUID := NULLIF(current_setting('test.teacher', true), '')::UUID;
    v_expected INTEGER := NULLIF(current_setting('test.expected', true), '')::INTEGER;
    v_students JSONB;
    v_listed INTEGER;
    v_page JSONB;
    v_found INTEGER;
    v_foreign INTEGER;
BEGIN
    IF v_student IS NULL THEN
        RAISE NOTICE '담을 글이 2편 이상인 학생이 운영에 없어 [2]를 건너뜁니다.';
        RETURN;
    END IF;
    -- 담임으로 부른다(트랜잭션 안에서만 유효).
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_teacher, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('request.jwt.claim.sub', v_teacher::TEXT, true);

    v_students := public.get_class_agit_students_v1(v_class);
    IF (v_students->>'version') <> '1' OR (v_students->>'class_id')::UUID <> v_class THEN
        RAISE EXCEPTION '학생 목록 응답 모양이 다릅니다: %', left(v_students::TEXT, 200);
    END IF;
    SELECT (item->>'review_count')::INTEGER INTO v_listed
    FROM jsonb_array_elements(v_students->'items') item WHERE (item->>'id')::UUID = v_student;
    IF v_listed IS DISTINCT FROM v_expected THEN
        RAISE EXCEPTION '학생 목록의 글 수(%)가 실제(%)와 다릅니다.', v_listed, v_expected;
    END IF;

    v_page := public.get_class_agit_candidates_v2(v_class, jsonb_build_object('student_id', v_student, 'sort', 'student', 'limit', 50));
    SELECT count(*), count(*) FILTER (WHERE (item->>'student_id')::UUID <> v_student)
    INTO v_found, v_foreign FROM jsonb_array_elements(v_page->'items') item;
    IF v_foreign > 0 THEN
        RAISE EXCEPTION '학생 조건 검색에 다른 학생 글이 %편 섞였습니다.', v_foreign;
    END IF;
    IF v_found <> v_expected THEN
        RAISE EXCEPTION '학생 조건 검색이 %편을 주었는데 실제는 %편입니다.', v_found, v_expected;
    END IF;
    -- 학생 조건이 없으면 전처럼 학급 전체가 나온다(다른 학생 글이 포함).
    v_page := public.get_class_agit_candidates_v2(v_class, jsonb_build_object('sort', 'student', 'limit', 50));
    IF (SELECT count(*) FROM jsonb_array_elements(v_page->'items') item) < v_found THEN
        RAISE EXCEPTION '학생 조건을 빼도 결과가 줄었습니다 — 조건이 항상 걸립니다.';
    END IF;
    RAISE NOTICE '학생 % 의 글 %편이 목록과 검색에서 일치합니다.', v_student, v_found;
END;
$$;
