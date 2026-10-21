-- 교사 계정 이관(2026-10-21, 선생님 요청): 교육청이 구글 계정을 지워 로그인할 수 없게 된 선생님의 자료를 새 계정으로 옮긴다.
--
-- 원칙
--  - **소유·접근을 정하는 열만 옮긴다**(학급·과제·학생 기록·점수 지급·댓글·연구소 방 등). 학생·학급 자료는 학급에 묶여 있어 담당 교사만 바뀌면 그대로 이어진다.
--  - **이력·보안 정보는 옛 계정에 둔다**(이벤트 로그·승인자 표시·구글 로그인 기록·다했니 연동 키·약관 동의). 로그가 바뀌면 누가 했는지 추적이 깨지고,
--    연동 키·동의는 새 계정에서 다시 해야 한다.
--  - 관리자만, 먼저 **사전 점검**(아무것도 바꾸지 않고 어떤 열에서 몇 행이 옮겨지는지·충돌이 없는지 본다) → 확인 문구(옛 계정 이메일)를 입력해 **실행**.
--    사전 점검과 실행이 같은 코드라, 점검에서 통과한 것은 실행에서도 통과한다(점검은 열마다 하위 트랜잭션에서 바꿔 보고 되돌린다).
--  - 새 표가 생기면 `teacher_transfer_unclassified_v1()` 이 분류 안 된 열을 알려 주고 스모크가 빈 목록을 요구한다 — 옮길지 둘지 한 줄로 정한다.
--  - 옛 계정은 지우지 않고 승인을 취소해 로그인을 막는다(되돌릴 수 있게). 이관 기록은 `teacher_account_transfers` 에 남긴다.

BEGIN;

-- ── 이관 기록 ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teacher_account_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    old_user_id UUID NOT NULL,
    new_user_id UUID NOT NULL,
    actor_id UUID NOT NULL,
    old_email TEXT,
    new_email TEXT,
    moved JSONB NOT NULL DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT teacher_account_transfers_distinct CHECK (old_user_id <> new_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS teacher_account_transfers_old_once_idx ON public.teacher_account_transfers(old_user_id);
ALTER TABLE public.teacher_account_transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.teacher_account_transfers FROM PUBLIC, anon, authenticated, service_role;

-- ── 어떤 열을 옮기고 어떤 열을 두는지(한 곳) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.teacher_transfer_targets_v1()
RETURNS TABLE(kind TEXT, schema_name TEXT, table_name TEXT, column_name TEXT, reason TEXT)
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT * FROM (VALUES
        -- 옮긴다: 소유·접근을 정하는 열
        ('move','public','classes','teacher_id','담당 학급 — 학생·글·학급 자료가 이 열을 따라 이어진다'),
        ('move','public','classes','student_consent_confirmed_by','학급 개인정보 동의 확인자(새 담당 교사가 이어받는다)'),
        ('move','public','writing_missions','teacher_id','교사가 낸 과제'),
        ('move','public','student_records','teacher_id','학생 기록'),
        ('move','public','ai_prompt_presets','teacher_id','교사의 피드백 틀'),
        ('move','public','feedback_reports','teacher_id','교사가 보낸 의견'),
        ('move','public','point_logs','teacher_id','교사가 준 점수(접근 정책이 이 열을 쓴다)'),
        ('move','public','post_comments','teacher_id','교사 댓글·피드백(접근 정책이 이 열을 쓴다)'),
        ('move','public','reading_log_teacher_reviews','teacher_id','독서록 교사 한마디'),
        ('move','public','reading_marathon_campaigns','teacher_id','독서 마라톤'),
        ('move','public','survival_legacy_archives','teacher_id','옛 보관 자료'),
        ('move','writing_helper','rooms','teacher_id','연구소 방'),
        ('move','writing_helper','morals_rooms','teacher_id','연구소 도덕 방'),
        ('move','writing_helper','question_sets','teacher_id','연구소 질문 묶음'),
        ('move','writing_helper','activity_setting_presets','teacher_id','연구소 활동 설정'),
        ('move','writing_helper','classes','teacher_id','연구소 학급'),
        ('move','writing_helper','outline_boards','teacher_id','연구소 개요 모음'),
        ('move','writing_helper','question_card_roles','teacher_id','연구소 질문 카드 역할'),
        ('move','writing_helper','question_card_sets','teacher_id','연구소 질문 카드'),
        ('move','writing_helper','room_teacher_questions','teacher_id','연구소 교사 질문'),
        ('move','writing_helper','science_rooms','teacher_id','연구소 과학 방'),
        ('move','writing_helper','teacher_hanja_word_cards','teacher_id','연구소 한자 카드'),
        ('move','writing_helper','teacher_profiles','user_id','연구소 교사 프로필'),
        ('move','samlink','short_link_account_access','user_id','샘링크 단축 주소 접근'),
        -- 둔다: 이력·보안 정보(옛 계정으로 남는다)
        ('keep','public','profiles','id','계정 자체'),
        ('keep','public','teachers','id','교사 정보 자체(새 계정은 자기 교사 정보를 쓴다)'),
        ('keep','public','profile_secrets','id','개인 API 키 — 새 계정에서 다시 등록'),
        ('keep','public','dahandin_teacher_credentials','teacher_id','다했니 연동 키 — 새 계정에서 다시 등록'),
        ('keep','public','policy_consents','user_id','약관·개인정보 동의 — 새 계정에서 다시 동의'),
        ('keep','public','students','auth_id','학생 계정(교사 계정이 아니다)'),
        ('keep','public','announcements','created_by','공지 작성자 기록'),
        ('keep','public','ai_request_events','actor_id','AI 요청 기록'),
        ('keep','public','class_agit_consent_events','actor_id','전시 동의 기록(이력)'),
        ('keep','public','class_agit_items','confirmed_by','전시 작품 확인자(이력)'),
        ('keep','public','class_agit_item_photos','checked_by','사진 확인자(이력)'),
        ('keep','public','class_agit_release_events','actor_id','전시·문집 공개 기록(이력)'),
        ('keep','public','class_board_notices','updated_by','수정자 기록'),
        ('keep','public','class_boards','created_by','만든 사람 기록'),
        ('keep','public','class_meal_school_settings','updated_by','수정자 기록'),
        ('keep','public','class_timetable_bases','updated_by','수정자 기록'),
        ('keep','public','class_timetable_weeks','updated_by','수정자 기록'),
        ('keep','public','classroom_arrangement_history','created_by','자리 바꾸기 기록(이력)'),
        ('keep','public','classroom_arrangement_settings','updated_by','수정자 기록'),
        ('keep','public','dragon_growth_seasons','created_by','시즌 만든 사람 기록'),
        ('keep','public','lab_ai_teacher_links','agit_user_id','연구소 AI 연결 — 새 계정에서 다시 연결'),
        ('keep','public','neighbor_activities','created_by','모두의 아지트 기록'),
        ('keep','public','neighbor_activities','match_decided_by','모두의 아지트 기록'),
        ('keep','public','neighbor_activities','match_proposed_by','모두의 아지트 기록'),
        ('keep','public','neighbor_activity_approvals','decided_by','모두의 아지트 기록'),
        ('keep','public','neighbor_book_guestbook','reviewed_by','모두의 아지트 기록'),
        ('keep','public','neighbor_comments','hidden_by','모두의 아지트 기록'),
        ('keep','public','neighbor_internal_test_classes','created_by','모두의 아지트 기록'),
        ('keep','public','neighbor_invite_attempts','user_id','모두의 아지트 기록'),
        ('keep','public','neighbor_invites','created_by','모두의 아지트 기록'),
        ('keep','public','neighbor_limited_class_events','changed_by','모두의 아지트 기록'),
        ('keep','public','neighbor_limited_classes','enabled_by','모두의 아지트 기록'),
        ('keep','public','neighbor_rollout_events','changed_by','모두의 아지트 기록'),
        ('keep','public','neighbor_rollout_state','acceptance_checked_by','모두의 아지트 기록'),
        ('keep','public','neighbor_rollout_state','updated_by','모두의 아지트 기록'),
        ('keep','public','neighbor_shared_books','shared_by','모두의 아지트 기록'),
        ('keep','public','neighbor_shared_posts','hidden_by','모두의 아지트 기록'),
        ('keep','public','neighbor_shared_posts','reviewed_by','모두의 아지트 기록'),
        ('keep','public','neighbor_space_classes','reviewed_by','모두의 아지트 기록'),
        ('keep','public','neighbor_space_events','actor_user_id','모두의 아지트 기록'),
        ('keep','public','neighbor_spaces','created_by','모두의 아지트 기록'),
        ('keep','public','samlink_connect_tickets','user_id','샘링크 연결 표(일회용)'),
        ('keep','public','spelling_claw_class_settings','updated_by','수정자 기록'),
        ('keep','public','spelling_common_reviews','decided_by','맞춤법 검수 기록'),
        ('keep','public','spelling_learning_entries','approved_by','맞춤법 검수 기록'),
        ('keep','public','spelling_learning_entries','created_by','맞춤법 검수 기록'),
        ('keep','public','spelling_weekly_review_items','decided_by','맞춤법 검수 기록'),
        ('keep','public','student_meal_notes','updated_by','수정자 기록'),
        ('keep','public','student_post_teacher_edits','teacher_id','교정 기록(누가 고쳤는지 이력)'),
        ('keep','public','teacher_account_transfers','actor_id','계정 이관을 한 관리자 기록(이력)'),
        ('keep','public','student_posts','recalled_by','글 회수자 기록(이력)'),
        ('keep','public','student_posts','teacher_edited_by','글 교정자 기록(이력)'),
        ('keep','public','system_service_review_items','checked_by','점검 기록'),
        ('keep','public','system_service_reviews','completed_by','점검 기록'),
        ('keep','public','system_service_reviews','started_by','점검 기록'),
        ('keep','public','title_reward_rollout_classes','enabled_by','롤아웃 기록'),
        ('keep','public','title_reward_rollout_state','enabled_by','롤아웃 기록'),
        ('keep','public','vocab_tower_v2_review_decks','locked_by','검수 기록'),
        ('keep','public','vocab_tower_v2_review_decks','reviewed_by','검수 기록'),
        ('keep','public','vocab_tower_v2_review_items','updated_by','검수 기록'),
        ('keep','public','writing_mission_lab_sources','created_by','만든 사람 기록'),
        ('keep','writing_helper','api_usage_logs','teacher_id','연구소 사용 기록(이력)')
    ) AS t(kind, schema_name, table_name, column_name, reason);
$$;

-- 분류가 안 된 열(= 새 표가 생겼는데 옮길지 둘지 정하지 않은 열). 스모크가 빈 목록을 요구한다.
CREATE OR REPLACE FUNCTION public.teacher_transfer_unclassified_v1()
RETURNS TABLE(schema_name TEXT, table_name TEXT, column_name TEXT)
LANGUAGE sql STABLE SET search_path = public AS $$
    WITH fk AS (
        SELECT r.nspname AS schema_name, c.relname AS table_name, a.attname AS column_name
        FROM pg_constraint k
        JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace r ON r.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
        WHERE k.contype = 'f' AND k.confrelid::regclass::TEXT IN ('auth.users','profiles','public.profiles','teachers','public.teachers')
          AND r.nspname IN ('public','samlink','app','writing_helper')
    ), named AS (
        SELECT c.table_schema AS schema_name, c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema IN ('public','samlink','app','writing_helper') AND c.data_type = 'uuid'
          AND (c.column_name IN ('teacher_id','owner_id','created_by','updated_by','actor_id','author_id','reviewer_id','user_id','admin_id',
                                 'approved_by','confirmed_by','checked_by','revoked_by','owner_teacher_id') OR c.column_name LIKE '%teacher%id')
    )
    SELECT u.schema_name, u.table_name, u.column_name FROM (SELECT * FROM fk UNION SELECT * FROM named) u
    WHERE NOT EXISTS (SELECT 1 FROM public.teacher_transfer_targets_v1() t
                      WHERE t.schema_name = u.schema_name AND t.table_name = u.table_name AND t.column_name = u.column_name)
    ORDER BY 1, 2, 3;
$$;
-- replica 모드는 외래키 검사도 끈다 → 옮길 열의 외래키 대상(부모 표)에 새 계정이 있는지 직접 확인한다. 없으면 `표.열` 을, 괜찮으면 NULL.
CREATE OR REPLACE FUNCTION public.teacher_transfer_missing_parent_v1(p_schema TEXT, p_table TEXT, p_column TEXT, p_new UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_fk RECORD; v_ok BOOLEAN;
BEGIN
    FOR v_fk IN
        SELECT k.confrelid::regclass::TEXT AS parent, pa.attname AS parent_col
        FROM pg_constraint k
        JOIN pg_attribute ca ON ca.attrelid = k.conrelid AND ca.attnum = k.conkey[1]
        JOIN pg_attribute pa ON pa.attrelid = k.confrelid AND pa.attnum = k.confkey[1]
        WHERE k.contype = 'f' AND k.conrelid = to_regclass(format('%I.%I', p_schema, p_table))
          AND array_length(k.conkey, 1) = 1 AND ca.attname = p_column
    LOOP
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)', v_fk.parent, v_fk.parent_col) INTO v_ok USING p_new;
        IF NOT v_ok THEN RETURN v_fk.parent || '.' || v_fk.parent_col; END IF;
    END LOOP;
    RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.teacher_transfer_missing_parent_v1(TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.teacher_transfer_targets_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.teacher_transfer_unclassified_v1() FROM PUBLIC, anon, authenticated;

-- ── 관리자: 교사 찾기(이관 화면에서 옛 계정·새 계정을 고른다) ───────────────────────────
CREATE OR REPLACE FUNCTION public.admin_find_teachers_v1(p_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_query TEXT := btrim(COALESCE(p_query, ''));
BEGIN
    IF public.auth_user_role() IS DISTINCT FROM 'ADMIN' THEN RAISE EXCEPTION '[보안] 관리자만 사용할 수 있습니다.' USING ERRCODE = '42501'; END IF;
    IF char_length(v_query) < 2 OR char_length(v_query) > 80 THEN RAISE EXCEPTION '이름이나 이메일을 두 글자 이상 입력해 주세요.' USING ERRCODE = '22023'; END IF;
    RETURN jsonb_build_object('teachers', COALESCE((
        SELECT jsonb_agg(row_to_json(x) ORDER BY x.name) FROM (
            SELECT p.id, COALESCE(t.name, p.full_name, '') AS name, COALESCE(p.email, t.email, '') AS email, COALESCE(t.school_name, '') AS school,
                   p.role, (p.is_approved IS TRUE AND p.approval_revoked_at IS NULL) AS approved, p.last_login_at,
                   (SELECT count(*) FROM public.classes c WHERE c.teacher_id = p.id AND c.deleted_at IS NULL) AS class_count,
                   (t.id IS NOT NULL) AS has_teacher_info,
                   EXISTS (SELECT 1 FROM public.teacher_account_transfers x WHERE x.old_user_id = p.id) AS already_transferred
            FROM public.profiles p LEFT JOIN public.teachers t ON t.id = p.id
            WHERE p.role = 'TEACHER'
              AND (strpos(lower(COALESCE(t.name, p.full_name, '')), lower(v_query)) > 0 OR strpos(lower(COALESCE(p.email, t.email, '')), lower(v_query)) > 0)
            ORDER BY COALESCE(t.name, p.full_name, '') LIMIT 20
        ) x), '[]'::JSONB));
END; $$;
REVOKE ALL ON FUNCTION public.admin_find_teachers_v1(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_find_teachers_v1(TEXT) TO authenticated;

-- ── 관리자: 사전 점검(p_apply=false)과 실행(p_apply=true) ────────────────────────────────
-- 점검은 열마다 하위 트랜잭션에서 실제로 바꿔 보고 되돌린다 — 유일 제약·트리거 거절 같은 충돌을 미리 안다. 실행은 같은 일을 되돌리지 않고 한다.
-- `session_replication_role = replica`: 이 함수가 도는 동안만 자동 규칙(트리거)을 끈다. 소유자 표시만 바꾸는 일이라 알림·활동 기록·수정 시각 같은 부수 효과가
-- 다시 생기면 안 되고(댓글·독서록 한마디가 바뀔 때마다 학생에게 알림), 댓글 표의 "작성 교사는 바꿀 수 없다" 보호 규칙도 이 일에는 걸린다.
-- 유일·널 아님·검사 제약은 그대로 지켜진다(충돌은 위 사전 점검이 잡는다). 함수가 끝나면 원래대로 돌아온다.
CREATE OR REPLACE FUNCTION public.admin_transfer_teacher_account_v1(p_old UUID, p_new UUID, p_apply BOOLEAN DEFAULT FALSE, p_confirm TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET session_replication_role = replica AS $$
DECLARE
    v_actor UUID := auth.uid(); v_old public.profiles%ROWTYPE; v_new public.profiles%ROWTYPE;
    v_old_name TEXT; v_new_name TEXT; v_target RECORD; v_count BIGINT; v_changed BIGINT;
    v_moved JSONB := '[]'::JSONB; v_conflicts JSONB := '[]'::JSONB; v_kept JSONB := '[]'::JSONB; v_total BIGINT := 0; v_error TEXT;
    v_old_email TEXT; v_new_email TEXT; v_missing TEXT; v_recent BOOLEAN;
BEGIN
    IF public.auth_user_role() IS DISTINCT FROM 'ADMIN' THEN RAISE EXCEPTION '[보안] 관리자만 사용할 수 있습니다.' USING ERRCODE = '42501'; END IF;
    IF p_old IS NULL OR p_new IS NULL OR p_old = p_new THEN RAISE EXCEPTION '옛 계정과 새 계정은 서로 다른 교사여야 합니다.' USING ERRCODE = '22023'; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('teacher_account_transfer'));
    SELECT * INTO v_old FROM public.profiles WHERE id = p_old;
    SELECT * INTO v_new FROM public.profiles WHERE id = p_new;
    IF v_old.id IS NULL OR v_new.id IS NULL THEN RAISE EXCEPTION '교사 계정을 찾을 수 없습니다.' USING ERRCODE = '22023'; END IF;
    IF v_old.role IS DISTINCT FROM 'TEACHER' OR v_new.role IS DISTINCT FROM 'TEACHER' THEN
        RAISE EXCEPTION '교사 계정끼리만 이관할 수 있습니다(관리자·학생 계정은 안 됩니다).' USING ERRCODE = '22023'; END IF;
    IF v_new.is_approved IS NOT TRUE OR v_new.approval_revoked_at IS NOT NULL THEN
        RAISE EXCEPTION '새 계정이 아직 승인되지 않았습니다. 새 계정으로 로그인해 승인된 뒤에 이관해 주세요.' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.teachers WHERE id = p_new) THEN
        RAISE EXCEPTION '새 계정이 교사 정보(이름·학교)를 아직 입력하지 않았습니다. 새 계정으로 로그인해 교사 정보를 입력한 뒤에 이관해 주세요.' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.teacher_account_transfers WHERE old_user_id = p_old) THEN
        RAISE EXCEPTION '이 옛 계정은 이미 이관했습니다.' USING ERRCODE = '22023'; END IF;
    -- 이메일은 프로필 값이 없으면 교사 정보의 값을 쓴다(화면에 보이는 값과 같다). 이메일이 아예 없는 계정은 확인 문구를 받을 수 없어 실행하지 않는다.
    v_old_email := btrim(COALESCE(NULLIF(btrim(v_old.email), ''), (SELECT t.email FROM public.teachers t WHERE t.id = p_old), ''));
    v_new_email := btrim(COALESCE(NULLIF(btrim(v_new.email), ''), (SELECT t.email FROM public.teachers t WHERE t.id = p_new), ''));
    IF p_apply AND v_old_email = '' THEN
        RAISE EXCEPTION '옛 계정에 이메일 기록이 없어 확인 문구를 받을 수 없습니다. 다른 방법으로 확인해 주세요.' USING ERRCODE = '22023'; END IF;
    IF p_apply AND lower(btrim(COALESCE(p_confirm, ''))) IS DISTINCT FROM lower(v_old_email) THEN
        RAISE EXCEPTION '확인 문구가 옛 계정의 이메일과 같지 않습니다.' USING ERRCODE = '22023'; END IF;
    -- 이관하는 동안 새 계정 행이 지워지지 않게 잠근다(외래키 검사를 끄고 도는 일이라 고아 참조를 막는다).
    PERFORM 1 FROM public.profiles WHERE id = p_new FOR KEY SHARE;
    PERFORM 1 FROM public.teachers WHERE id = p_new FOR KEY SHARE;
    v_recent := v_old.last_login_at IS NOT NULL AND v_old.last_login_at > now() - INTERVAL '30 days';
    SELECT COALESCE(t.name, v_old.full_name, '') INTO v_old_name FROM (SELECT 1) s LEFT JOIN public.teachers t ON t.id = p_old;
    SELECT COALESCE(t.name, v_new.full_name, '') INTO v_new_name FROM (SELECT 1) s LEFT JOIN public.teachers t ON t.id = p_new;

    FOR v_target IN SELECT * FROM public.teacher_transfer_targets_v1() WHERE kind = 'move' ORDER BY schema_name, table_name, column_name LOOP
        IF to_regclass(format('%I.%I', v_target.schema_name, v_target.table_name)) IS NULL THEN CONTINUE; END IF;
        EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I = $1', v_target.schema_name, v_target.table_name, v_target.column_name) INTO v_count USING p_old;
        IF v_count = 0 THEN CONTINUE; END IF;
        v_missing := public.teacher_transfer_missing_parent_v1(v_target.schema_name, v_target.table_name, v_target.column_name, p_new);
        IF v_missing IS NOT NULL THEN
            IF p_apply THEN
                RAISE EXCEPTION '새 계정이 % 에 없어 %.% 을(를) 옮길 수 없습니다.', v_missing, v_target.table_name, v_target.column_name USING ERRCODE = '23503'; END IF;
            v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('table', v_target.schema_name || '.' || v_target.table_name, 'column', v_target.column_name, 'rows', v_count,
                'error', '새 계정이 ' || v_missing || ' 에 없습니다.'));
            CONTINUE;
        END IF;
        IF p_apply THEN
            EXECUTE format('UPDATE %I.%I SET %I = $2 WHERE %I = $1', v_target.schema_name, v_target.table_name, v_target.column_name, v_target.column_name) USING p_old, p_new;
            GET DIAGNOSTICS v_changed = ROW_COUNT;
            v_moved := v_moved || jsonb_build_array(jsonb_build_object('table', v_target.schema_name || '.' || v_target.table_name, 'column', v_target.column_name, 'rows', v_changed, 'reason', v_target.reason));
            v_total := v_total + v_changed;
        ELSE
            -- 점검: 하위 트랜잭션에서 바꿔 보고 되돌린다. 충돌(유일 제약·트리거 거절)은 목록으로 돌려준다.
            v_error := NULL;
            BEGIN
                EXECUTE format('UPDATE %I.%I SET %I = $2 WHERE %I = $1', v_target.schema_name, v_target.table_name, v_target.column_name, v_target.column_name) USING p_old, p_new;
                RAISE EXCEPTION 'transfer-preview-rollback';
            EXCEPTION WHEN OTHERS THEN
                IF SQLERRM <> 'transfer-preview-rollback' THEN v_error := SQLERRM; END IF;
            END;
            IF v_error IS NOT NULL THEN
                v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('table', v_target.schema_name || '.' || v_target.table_name, 'column', v_target.column_name, 'rows', v_count, 'error', left(v_error, 200)));
            ELSE
                v_moved := v_moved || jsonb_build_array(jsonb_build_object('table', v_target.schema_name || '.' || v_target.table_name, 'column', v_target.column_name, 'rows', v_count, 'reason', v_target.reason));
                v_total := v_total + v_count;
            END IF;
        END IF;
    END LOOP;

    -- 옛 계정에 남는 것(이력·보안 정보)의 행 수 — 참고용
    FOR v_target IN SELECT * FROM public.teacher_transfer_targets_v1() WHERE kind = 'keep' ORDER BY schema_name, table_name, column_name LOOP
        IF to_regclass(format('%I.%I', v_target.schema_name, v_target.table_name)) IS NULL THEN CONTINUE; END IF;
        IF v_target.table_name IN ('profiles','teachers') THEN CONTINUE; END IF;
        EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I = $1', v_target.schema_name, v_target.table_name, v_target.column_name) INTO v_count USING p_old;
        IF v_count > 0 THEN
            v_kept := v_kept || jsonb_build_array(jsonb_build_object('table', v_target.schema_name || '.' || v_target.table_name, 'column', v_target.column_name, 'rows', v_count, 'reason', v_target.reason));
        END IF;
    END LOOP;

    IF p_apply THEN
        -- 충돌이 있으면 위 UPDATE 에서 이미 예외로 전체가 취소된다. 여기서는 계정 정리·기록.
        PERFORM set_config('app.bypass_profile_protection', 'true', TRUE);
        -- 새 계정의 개인 설정이 비어 있으면 옛 계정의 것을 이어받는다(피드백 문구·자주 쓰는 태그·기본 루브릭 등).
        -- "비어 있다" = NULL 이거나 빈 배열·빈 객체·빈 글(새 계정은 목록형 설정이 `[]` 로 시작한다).
        UPDATE public.profiles n SET
            primary_class_id = COALESCE(n.primary_class_id, o.primary_class_id),
            frequent_tags = CASE WHEN n.frequent_tags IS NULL OR n.frequent_tags IN ('[]'::JSONB,'{}'::JSONB) THEN o.frequent_tags ELSE n.frequent_tags END,
            default_rubric = CASE WHEN n.default_rubric IS NULL OR n.default_rubric IN ('[]'::JSONB,'{}'::JSONB) THEN o.default_rubric ELSE n.default_rubric END,
            mission_default_settings = CASE WHEN n.mission_default_settings IS NULL OR n.mission_default_settings IN ('[]'::JSONB,'{}'::JSONB) THEN o.mission_default_settings ELSE n.mission_default_settings END,
            feedback_phrases = CASE WHEN n.feedback_phrases IS NULL OR n.feedback_phrases IN ('[]'::JSONB,'{}'::JSONB) THEN o.feedback_phrases ELSE n.feedback_phrases END,
            notice_templates = CASE WHEN n.notice_templates IS NULL OR n.notice_templates IN ('[]'::JSONB,'{}'::JSONB) THEN o.notice_templates ELSE n.notice_templates END,
            ai_prompt_template = COALESCE(NULLIF(btrim(n.ai_prompt_template), ''), o.ai_prompt_template),
            activity_ai_prompt = COALESCE(NULLIF(btrim(n.activity_ai_prompt), ''), o.activity_ai_prompt)
        FROM public.profiles o WHERE n.id = p_new AND o.id = p_old;
        -- 옛 계정: 지우지 않고 승인을 취소해 로그인을 막는다(되돌릴 수 있게).
        UPDATE public.profiles SET is_approved = FALSE, approval_revoked_at = now() WHERE id = p_old;
        PERFORM set_config('app.bypass_profile_protection', 'false', TRUE);
        INSERT INTO public.teacher_account_transfers(old_user_id, new_user_id, actor_id, old_email, new_email, moved)
        VALUES (p_old, p_new, v_actor, NULLIF(v_old_email, ''), NULLIF(v_new_email, ''), v_moved);
    END IF;

    RETURN jsonb_build_object('applied', p_apply,
        'old', jsonb_build_object('id', p_old, 'name', v_old_name, 'email', v_old_email, 'approved', (v_old.is_approved IS TRUE AND v_old.approval_revoked_at IS NULL),
            'last_login_at', v_old.last_login_at, 'recently_active', v_recent),
        'new', jsonb_build_object('id', p_new, 'name', v_new_name, 'email', v_new_email),
        'moved', v_moved, 'kept', v_kept, 'conflicts', v_conflicts, 'total_rows', v_total,
        'can_apply', jsonb_array_length(v_conflicts) = 0);
END; $$;
REVOKE ALL ON FUNCTION public.admin_transfer_teacher_account_v1(UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transfer_teacher_account_v1(UUID, UUID, BOOLEAN, TEXT) TO authenticated;

-- ── 관리자: 이관 기록 보기 ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_teacher_transfers_v1()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF public.auth_user_role() IS DISTINCT FROM 'ADMIN' THEN RAISE EXCEPTION '[보안] 관리자만 사용할 수 있습니다.' USING ERRCODE = '42501'; END IF;
    RETURN jsonb_build_object('transfers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', x.id, 'old_email', x.old_email, 'new_email', x.new_email, 'created_at', x.created_at,
            'total_rows', (SELECT COALESCE(sum((m->>'rows')::BIGINT), 0) FROM jsonb_array_elements(x.moved) m)) ORDER BY x.created_at DESC)
        FROM (SELECT * FROM public.teacher_account_transfers ORDER BY created_at DESC LIMIT 50) x), '[]'::JSONB));
END; $$;
REVOKE ALL ON FUNCTION public.admin_list_teacher_transfers_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_teacher_transfers_v1() TO authenticated;

COMMIT;
