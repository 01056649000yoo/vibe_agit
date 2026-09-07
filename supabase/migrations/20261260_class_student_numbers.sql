-- 학급 번호를 진짜 값으로 만든다(2026-09-07, 사용자 요청).
--
-- 문제: 명단의 `번호` 는 저장된 값이 아니라 **등록한 순서(created_at)로 줄 세운 자리**였다.
-- 게다가 학생 이름을 고치는 길이 아예 없어서, 이름을 잘못 적으면 지우고 다시 넣는 수밖에 없었고
-- 다시 넣은 학생은 등록 시각이 가장 최근이라 번호가 맨 뒤로 갔다. 선생님이 학교에서 받은
-- 실제 학급 번호와 화면 번호를 맞출 방법이 없었다.
--
-- 고침:
--   1. `students.student_no` 를 두고 학급 안에서 겹치지 않게 한다(살아 있는 학생 기준).
--   2. 기존 학생은 지금 화면에 보이던 순서(등록순) 그대로 1번부터 붙여 준다 — 화면이 갑자기 바뀌지 않는다.
--   3. 새 학생은 남은 번호 중 가장 작은 번호를 받는다. 되살린 학생도 마찬가지다.
--   4. 교사가 번호를 직접 고치거나(`set_class_student_numbers_v1`),
--      가나다순으로 다시 매길 수 있다(`renumber_class_students_v1`).
--   5. 이름을 지우고 다시 넣지 않아도 되도록 이름 고치기를 연다(`rename_class_student_v1`).
--
-- 번호 범위를 300 까지 둔 것은 한 학급 인원(현재 상한 200명)보다 넉넉해야 학교에서 받은
-- 번호를 그대로 적을 수 있기 때문이다(예: 2반 학생에게 201~ 번을 주는 학교가 있다).
BEGIN;

ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS student_no SMALLINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'students_student_no_range'
    ) THEN
        ALTER TABLE public.students
            ADD CONSTRAINT students_student_no_range CHECK (student_no IS NULL OR student_no BETWEEN 1 AND 300);
    END IF;
END $$;

-- 지금 화면에 보이던 순서(등록순) 그대로 붙인다. 선생님이 보던 번호가 갑자기 바뀌면 안 된다.
-- `protect_student_sensitive_columns` 는 로그인하지 않은 갱신을 막으므로, 이 한 번의 채우기만 비켜 간다.
SELECT set_config('app.bypass_student_trigger', 'true', TRUE);

WITH numbered AS (
    SELECT s.id, ROW_NUMBER() OVER (PARTITION BY s.class_id ORDER BY s.created_at, s.id) AS seq
    FROM public.students s
    WHERE s.deleted_at IS NULL AND s.student_no IS NULL
)
UPDATE public.students s
   SET student_no = numbered.seq
  FROM numbered
 WHERE s.id = numbered.id AND numbered.seq <= 300;

SELECT set_config('app.bypass_student_trigger', 'false', TRUE);

-- 살아 있는 학생끼리만 겹치지 않으면 된다. 삭제 대기(3일) 학생의 번호는 비워 두므로 자리를 막지 않는다.
CREATE UNIQUE INDEX IF NOT EXISTS students_class_student_no_key
    ON public.students (class_id, student_no)
    WHERE deleted_at IS NULL AND student_no IS NOT NULL;

/**
 * 학급에서 아직 쓰지 않은 가장 작은 번호.
 * 새로 넣을 때도, 삭제 대기에서 되살릴 때도 같은 규칙을 쓴다.
 */
CREATE OR REPLACE FUNCTION public.next_class_student_no_v1(p_class_id UUID)
RETURNS SMALLINT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT MIN(candidate)::SMALLINT
      FROM generate_series(1, 300) AS candidate
     WHERE NOT EXISTS (
         SELECT 1 FROM public.students s
          WHERE s.class_id = p_class_id AND s.deleted_at IS NULL AND s.student_no = candidate
     );
$$;

/**
 * 번호 없이 들어오거나 되살아난 학생에게 번호를 붙인다.
 *
 * 어느 경로로 학생이 생기든 번호가 반드시 있어야 명단이 흐트러지지 않으므로 트리거로 둔다.
 * 되살리기(`deleted_at` → NULL)는 화면에서 표를 바로 고치는 방식이라 부를 함수가 따로 없다.
 * 번호를 **비우는 갱신 자체는 건드리지 않는다** — 번호를 서로 맞바꿀 때 잠깐 비우기 때문이다.
 */
CREATE OR REPLACE FUNCTION public.assign_student_no_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.deleted_at IS NULL AND NEW.student_no IS NULL THEN
            NEW.student_no := public.next_class_student_no_v1(NEW.class_id);
        END IF;
        RETURN NEW;
    END IF;

    -- 되살리는 순간에만 본다. 원래 번호가 비어 있거나 그 사이 다른 학생이 가져갔으면 새로 준다.
    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
        IF NEW.student_no IS NULL OR EXISTS (
            SELECT 1 FROM public.students s
             WHERE s.class_id = NEW.class_id AND s.deleted_at IS NULL
               AND s.student_no = NEW.student_no AND s.id <> NEW.id
        ) THEN
            NEW.student_no := public.next_class_student_no_v1(NEW.class_id);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_student_no ON public.students;
CREATE TRIGGER trg_assign_student_no
    BEFORE INSERT OR UPDATE ON public.students
    FOR EACH ROW EXECUTE FUNCTION public.assign_student_no_v1();

/** 교사가 이 학급을 다룰 수 있는지 본다. 번호·이름 고치기가 같은 관문을 쓴다. */
CREATE OR REPLACE FUNCTION public.assert_class_roster_editor_v1(p_class_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR (
        public.auth_user_role() <> 'ADMIN'
        AND NOT EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = p_class_id AND c.teacher_id = auth.uid() AND c.deleted_at IS NULL
        )
    ) THEN
        RAISE EXCEPTION '이 학급의 명단을 고칠 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
END;
$$;

/**
 * 번호를 교사가 직접 정한다. `[{"id": "...", "no": 3}, ...]` 를 한꺼번에 받는다.
 *
 * 한 번에 받는 이유는 **자리 맞바꾸기** 때문이다. 3번과 5번을 바꾸려고 한 줄씩 고치면
 * 중간에 번호가 겹쳐 막힌다. 그래서 대상 학생의 번호를 모두 비운 뒤 한꺼번에 채운다.
 */
CREATE OR REPLACE FUNCTION public.set_class_student_numbers_v1(p_class_id UUID, p_assignments JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    PERFORM public.assert_class_roster_editor_v1(p_class_id);

    IF jsonb_typeof(COALESCE(p_assignments, 'null'::JSONB)) <> 'array' THEN
        RAISE EXCEPTION '번호 목록을 배열로 보내 주세요.' USING ERRCODE = '22023';
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS tmp_student_no (student_id UUID PRIMARY KEY, student_no SMALLINT) ON COMMIT DROP;
    DELETE FROM tmp_student_no WHERE TRUE;

    INSERT INTO tmp_student_no (student_id, student_no)
    SELECT (entry->>'id')::UUID, (entry->>'no')::SMALLINT
      FROM jsonb_array_elements(p_assignments) AS entry
     ON CONFLICT (student_id) DO UPDATE SET student_no = EXCLUDED.student_no;

    IF EXISTS (SELECT 1 FROM tmp_student_no WHERE student_no IS NULL OR student_no NOT BETWEEN 1 AND 300) THEN
        RAISE EXCEPTION '번호는 1~300 사이로 적어 주세요.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM tmp_student_no GROUP BY student_no HAVING count(*) > 1) THEN
        RAISE EXCEPTION '같은 번호를 두 학생에게 줄 수 없습니다.' USING ERRCODE = '23505';
    END IF;

    SELECT count(*) INTO v_count
      FROM tmp_student_no t
      JOIN public.students s ON s.id = t.student_id
     WHERE s.class_id = p_class_id AND s.deleted_at IS NULL;
    IF v_count <> (SELECT count(*) FROM tmp_student_no) THEN
        RAISE EXCEPTION '우리 학급 학생만 번호를 고칠 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    -- 고치지 않는 학생이 이미 그 번호를 쓰고 있으면 막는다(조용히 빼앗지 않는다).
    IF EXISTS (
        SELECT 1 FROM tmp_student_no t
         WHERE EXISTS (
             SELECT 1 FROM public.students s
              WHERE s.class_id = p_class_id AND s.deleted_at IS NULL
                AND s.student_no = t.student_no
                AND s.id NOT IN (SELECT student_id FROM tmp_student_no)
         )
    ) THEN
        RAISE EXCEPTION '이미 다른 학생이 쓰고 있는 번호입니다.' USING ERRCODE = '23505';
    END IF;

    UPDATE public.students s SET student_no = NULL
     WHERE s.id IN (SELECT student_id FROM tmp_student_no);
    UPDATE public.students s SET student_no = t.student_no
      FROM tmp_student_no t WHERE s.id = t.student_id;

    RETURN jsonb_build_object('status', 'ok', 'updated', (SELECT count(*) FROM tmp_student_no));
END;
$$;

/**
 * 번호를 1번부터 다시 붙인다.
 *   `name`  — 이름 가나다순(학교에서 번호를 가나다순으로 주는 경우가 많다)
 *   `order` — 지금 번호 순서 그대로, 빈 번호만 메운다(지우고 다시 넣어 번호가 튀었을 때)
 */
CREATE OR REPLACE FUNCTION public.renumber_class_students_v1(p_class_id UUID, p_mode TEXT DEFAULT 'name')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    PERFORM public.assert_class_roster_editor_v1(p_class_id);
    IF p_mode NOT IN ('name', 'order') THEN
        RAISE EXCEPTION '번호를 매기는 방식은 name 또는 order 입니다.' USING ERRCODE = '22023';
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS tmp_student_renumber (student_id UUID PRIMARY KEY, seq SMALLINT) ON COMMIT DROP;
    DELETE FROM tmp_student_renumber WHERE TRUE;

    INSERT INTO tmp_student_renumber (student_id, seq)
    SELECT s.id,
           ROW_NUMBER() OVER (
               ORDER BY CASE WHEN p_mode = 'name' THEN s.name END COLLATE "ko-KR-x-icu",
                        CASE WHEN p_mode = 'order' THEN s.student_no END NULLS LAST,
                        s.created_at, s.id
           )::SMALLINT
      FROM public.students s
     WHERE s.class_id = p_class_id AND s.deleted_at IS NULL;

    IF EXISTS (SELECT 1 FROM tmp_student_renumber WHERE seq > 300) THEN
        RAISE EXCEPTION '한 학급에 300명을 넘겨 번호를 매길 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.students s SET student_no = NULL
     WHERE s.class_id = p_class_id AND s.deleted_at IS NULL;
    UPDATE public.students s SET student_no = t.seq
      FROM tmp_student_renumber t WHERE s.id = t.student_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    RETURN jsonb_build_object('status', 'ok', 'mode', p_mode, 'updated', v_updated);
END;
$$;

/**
 * 이름을 고친다. 지우고 다시 넣을 필요가 없어져 번호가 뒤로 밀리는 일 자체가 사라진다.
 *
 * 글·댓글·포인트 기록·독서록·일기는 모두 학생 id 로 이어져 있어 저절로 새 이름을 따른다.
 * 그런데 **실명을 복사해 두는 곳이 세 군데** 있다. 오타를 고치는 것이 목적이므로 함께 고친다.
 * 그러지 않으면 그 화면에만 틀린 이름이 계속 남는다.
 *   1. 독서마라톤 참가 명단(`name_snapshot`) — 학생을 지워도 지난 대회 기록이 남게 하려는 사본
 *   2. 이웃 아지트 공유글 지은이(`public_author_name`) — 올릴 때 실명을 복사한다
 *   3. 글꽃 책방(학급 문집) 작품 지은이(`snapshot->>'author'`) — 수록할 때 실명을 복사한다
 *
 * 글꽃 전시관 발행본(학급 공개·외부 공개)은 손대지 않는다. 지은이를 `새싹 작가 05` 같은
 * 가명으로 서버가 덮어쓰기 때문에 실명이 아예 없다(운영 13건 확인, 실명 0건).
 */
CREATE OR REPLACE FUNCTION public.rename_class_student_v1(p_student_id UUID, p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID;
    v_name TEXT := btrim(COALESCE(p_name, ''));
BEGIN
    SELECT s.class_id INTO v_class_id
      FROM public.students s WHERE s.id = p_student_id AND s.deleted_at IS NULL;
    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '학생을 찾을 수 없습니다.' USING ERRCODE = '42704';
    END IF;
    PERFORM public.assert_class_roster_editor_v1(v_class_id);

    -- 학생 추가와 같은 기준을 쓴다(1~30자).
    IF char_length(v_name) NOT BETWEEN 1 AND 30 THEN
        RAISE EXCEPTION '학생 이름은 1~30자로 입력해주세요.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.students SET name = v_name WHERE id = p_student_id;

    UPDATE public.reading_marathon_participants
       SET name_snapshot = v_name
     WHERE student_id = p_student_id AND name_snapshot IS DISTINCT FROM v_name;

    UPDATE public.neighbor_shared_posts
       SET public_author_name = left(v_name, 30)
     WHERE student_id = p_student_id AND public_author_name IS DISTINCT FROM left(v_name, 30);

    UPDATE public.class_agit_book_items
       SET snapshot = jsonb_set(snapshot, '{author}', to_jsonb(v_name))
     WHERE student_id = p_student_id AND snapshot->>'author' IS DISTINCT FROM v_name;

    RETURN jsonb_build_object('status', 'ok', 'id', p_student_id, 'name', v_name);
END;
$$;

-- 교사 명단 화면이 읽는 곳. 번호를 함께 내려 주고 번호순으로 정렬한다.
CREATE OR REPLACE FUNCTION public.get_teacher_point_manager_snapshot(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_students JSONB;
BEGIN
    IF auth.uid() IS NULL OR (
        public.auth_user_role() <> 'ADMIN'
        AND NOT EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = p_class_id AND c.teacher_id = auth.uid()
        )
    ) THEN
        RAISE EXCEPTION '이 학급의 포인트 정보를 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    WITH scoped_students AS (
        SELECT s.id, s.name, s.total_points, s.student_code, s.created_at, s.pet_data, s.class_id, s.student_no
        FROM public.students s
        WHERE s.class_id = p_class_id AND s.deleted_at IS NULL
        ORDER BY s.student_no NULLS LAST, s.name
        LIMIT 200
    ), point_stats AS (
        SELECT pl.student_id,
            COALESCE(sum(pl.amount) FILTER (WHERE pl.amount > 0), 0)::BIGINT AS score_all,
            COALESCE(sum(pl.amount) FILTER (
                WHERE pl.amount > 0 AND pl.created_at >= now() - interval '7 days'
            ), 0)::BIGINT AS score_week,
            COALESCE(sum(pl.amount) FILTER (
                WHERE pl.amount > 0 AND pl.created_at >= now() - interval '30 days'
            ), 0)::BIGINT AS score_month
        FROM public.point_logs pl
        WHERE pl.class_id = p_class_id
        GROUP BY pl.student_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', student.id,
        'name', student.name,
        'student_no', student.student_no,
        'total_points', COALESCE(student.total_points, 0),
        'student_code', student.student_code,
        'created_at', student.created_at,
        'pet_data', student.pet_data,
        'class_id', student.class_id,
        'activity_score', COALESCE(stats.score_all, 0),
        'score_all', COALESCE(stats.score_all, 0),
        'score_week', COALESCE(stats.score_week, 0),
        'score_month', COALESCE(stats.score_month, 0)
    ) ORDER BY student.student_no NULLS LAST, student.name), '[]'::JSONB)
    INTO v_students
    FROM scoped_students student
    LEFT JOIN point_stats stats ON stats.student_id = student.id;

    RETURN jsonb_build_object('status', 'ok', 'class_id', p_class_id, 'students', v_students);
END;
$$;

REVOKE ALL ON FUNCTION public.next_class_student_no_v1(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assert_class_roster_editor_v1(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_class_student_numbers_v1(UUID, JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.renumber_class_students_v1(UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rename_class_student_v1(UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_class_student_numbers_v1(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.renumber_class_students_v1(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rename_class_student_v1(UUID, TEXT) TO authenticated;

COMMIT;
