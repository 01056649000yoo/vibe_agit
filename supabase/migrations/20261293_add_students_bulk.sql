-- ============================================================================
-- 👥 학생 명단 한 번에 추가
-- 작성일: 2026-09-14
--
-- 왜 (2026-09-14 사용자 분석):
--   최근 30일에 가입한 교사 512명 중 학급까지 만든 사람은 505명인데, **학생을 등록한
--   사람은 168명**이다. 가장 크게 떨어지는 칸이 여기다. 학급을 만들고 학생 0명으로
--   멈춘 교사 337명 가운데 **그 뒤에 다시 들어온 사람은 2명**뿐이다.
--   동행 모드에서 멈추는 자리도 같다(`invite-students`).
--
--   지금은 이름을 **한 명씩** 넣는다. 실제로 끝까지 한 학급은 23명을 2분 만에 넣었으니
--   느려서가 아니라, 선생님이 명단을 앞에 두고 "서른 번 치기" 를 시작하지 못하는 것이다.
--   명단은 나이스·엑셀·한글에 이미 있다. 붙여넣게 한다.
--
-- 왜 함수 하나로 묶나:
--   서른 번 왕복하면 중간에 하나가 실패했을 때 절반만 들어간 명단이 남는다. 한 번에
--   보내 **다 들어가거나 하나도 안 들어가거나** 로 만든다.
--
-- 학생 코드를 여기서 만드는 이유:
--   화면에서 서른 개를 만들어 보내면, 겹쳤을 때(UNIQUE) 되돌릴 자리가 없다. 여기서
--   만들고 겹치면 다시 뽑는다. 글자는 `src/lib/codeGenerator.js` 와 같은 것을 쓴다 —
--   사람이 손으로 옮겨 적으므로 O/0·I/1·L 을 뺀다. `tests/studentRoster.test.mjs` 가 대조한다.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.add_students_bulk_v1(
    p_class_id UUID,
    p_names TEXT[],
    p_initial_points INTEGER DEFAULT 100
)
 RETURNS JSONB
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    -- src/lib/codeGenerator.js 의 UNAMBIGUOUS_ALPHABET 과 같아야 한다.
    v_alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    v_name TEXT; v_clean TEXT; v_code TEXT; v_id UUID; v_added INTEGER := 0; v_tries INTEGER;
BEGIN
    -- 권한은 한 명씩 추가할 때(add_student_with_bonus)와 같은 기준이다.
    IF auth.uid() IS NULL OR (
        public.auth_user_role() <> 'ADMIN'
        AND NOT EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = p_class_id AND c.teacher_id = auth.uid() AND c.deleted_at IS NULL
        )
    ) THEN
        RAISE EXCEPTION '이 학급에 학생을 추가할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    IF p_names IS NULL OR COALESCE(array_length(p_names, 1), 0) NOT BETWEEN 1 AND 60 THEN
        RAISE EXCEPTION '한 번에 1~60명까지 추가할 수 있습니다.' USING ERRCODE = '22023';
    END IF;
    IF p_initial_points NOT BETWEEN 0 AND 10000 THEN
        RAISE EXCEPTION '시작 포인트는 0~10,000P 사이여야 합니다.' USING ERRCODE = '22023';
    END IF;

    FOREACH v_name IN ARRAY p_names LOOP
        v_clean := btrim(COALESCE(v_name, ''));
        IF char_length(v_clean) NOT BETWEEN 1 AND 30 THEN
            RAISE EXCEPTION '학생 이름은 1~30자로 입력해주세요.' USING ERRCODE = '22023';
        END IF;

        v_tries := 0;
        LOOP
            SELECT string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::INT, 1), '')
              INTO v_code FROM generate_series(1, 8);
            EXIT WHEN NOT EXISTS (SELECT 1 FROM public.students WHERE student_code = v_code);
            v_tries := v_tries + 1;
            IF v_tries > 20 THEN
                RAISE EXCEPTION '학생 코드를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.' USING ERRCODE = '55000';
            END IF;
        END LOOP;

        INSERT INTO public.students (class_id, name, student_code, total_points)
        VALUES (p_class_id, v_clean, v_code, 0)
        RETURNING id INTO v_id;

        IF p_initial_points > 0 THEN
            PERFORM public.point_engine_apply(
                v_id, p_initial_points, '신규 등록 기념 환영 포인트! 🎁', 'starting_bonus',
                format('student:%s:welcome', v_id), NULL, NULL,
                jsonb_build_object('source', 'student_registration_bulk')
            );
        END IF;
        v_added := v_added + 1;
    END LOOP;

    RETURN jsonb_build_object('version', 1, 'added', v_added);
END;
$function$;

REVOKE ALL ON FUNCTION public.add_students_bulk_v1(UUID, TEXT[], INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_students_bulk_v1(UUID, TEXT[], INTEGER) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
