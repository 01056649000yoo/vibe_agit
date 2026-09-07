-- 이름을 고칠 때 놓친 실명 사본 두 곳을 함께 고친다(2026-09-07, 사용자 지적).
--
-- `61260` 에서 이름 고치기를 열면서 실명 사본 세 곳(독서마라톤 명단·이웃 아지트 공유글·글꽃 책방)을
-- 같이 고치게 했는데, **두 곳을 빠뜨렸다.**
--
--   1. 글꽃 전시관 작품 지은이(`class_agit_items.snapshot->>'authorName'`, 운영 13건)
--      — 학급 공개 발행본의 지은이가 여기서 나온다. 처음에 이 표의 `public_alias`(`새싹 작가 NN`)만 보고
--        "전시관은 가명이라 영향 없다"고 잘못 판단했다. 실제 공개되는 이름은 `authorName`(실명)이다.
--   2. 알림 문구의 사람 이름(`student_notification_events.payload->>'actor_name'`, 운영 3,504건)
--      — `최윤 친구가 ‘가을 소풍’에 반응을 남겼어요` 처럼 화면에 그대로 보인다. 컬럼 이름 훑기로는
--        JSONB 안이라 안 잡혔다. 이 표에는 **행동한 학생의 id 가 없고 이름 문자열만** 있어서,
--        같은 반에 그 이름이 한 명뿐일 때만 고친다. 동명이인이 있으면 남의 알림까지 바꾸게 된다.
--
-- 손대지 않는 곳:
--   - `student_posts.structured_content`(8건) — **아이가 자기 글에 쓴 이름**이다. 글은 고치지 않는다.
--   - `dragon_season_students.snapshot->>'name'`(65건) — 지난 학기 기록인데 읽는 쪽이 숫자만 쓰고
--     이름은 꺼내 쓰지 않는다(화면에 안 나온다).
--   - `class_agit_items.public_alias` — 지금 어느 발행 경로도 읽지 않는 묵은 칸(모듈 README 참고).
--   - 이미 발행해 얼린 사본(`class_agit_published_items`·`class_agit_external_items`)은 그대로 둔다.
--     발행본은 통째로 얼려 두는 설계이고, 교사가 다시 발행하면 고쳐진 이름으로 새로 실린다.
BEGIN;

CREATE OR REPLACE FUNCTION public.rename_class_student_v1(p_student_id UUID, p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID;
    v_old_name TEXT;
    v_name TEXT := btrim(COALESCE(p_name, ''));
    v_synced JSONB;
    v_marathon INTEGER := 0;
    v_neighbor INTEGER := 0;
    v_book INTEGER := 0;
    v_exhibition INTEGER := 0;
    v_notice INTEGER := 0;
BEGIN
    SELECT s.class_id, s.name INTO v_class_id, v_old_name
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

    -- 아래는 모두 **실명을 복사해 둔 곳**이다. 오타를 고치는 것이 목적이므로 함께 고친다.
    -- 글·댓글·포인트 내역은 학생 id 로만 이어져 있어 손댈 것이 없다.
    UPDATE public.reading_marathon_participants
       SET name_snapshot = v_name
     WHERE student_id = p_student_id AND name_snapshot IS DISTINCT FROM v_name;
    GET DIAGNOSTICS v_marathon = ROW_COUNT;

    UPDATE public.neighbor_shared_posts
       SET public_author_name = left(v_name, 30)
     WHERE student_id = p_student_id AND public_author_name IS DISTINCT FROM left(v_name, 30);
    GET DIAGNOSTICS v_neighbor = ROW_COUNT;

    UPDATE public.class_agit_book_items
       SET snapshot = jsonb_set(snapshot, '{author}', to_jsonb(v_name))
     WHERE student_id = p_student_id AND snapshot->>'author' IS DISTINCT FROM v_name;
    GET DIAGNOSTICS v_book = ROW_COUNT;

    -- 글꽃 전시관 작품 지은이. 학급 공개 발행본의 지은이가 이 값에서 나온다.
    UPDATE public.class_agit_items
       SET snapshot = jsonb_set(snapshot, '{authorName}', to_jsonb(v_name))
     WHERE student_id = p_student_id AND snapshot->>'authorName' IS DISTINCT FROM v_name;
    GET DIAGNOSTICS v_exhibition = ROW_COUNT;

    -- 알림 문구에 박힌 사람 이름(`최윤 친구가 … 반응을 남겼어요`).
    -- 행동한 학생의 id 가 이 표에 없어 **옛 이름 문자열로만** 찾을 수 있다. 그래서 같은 반에
    -- 그 이름을 쓰는 학생이 이 학생 한 명뿐일 때만 고친다(동명이인이면 남의 알림까지 바뀐다).
    IF v_old_name IS DISTINCT FROM v_name AND NOT EXISTS (
        SELECT 1 FROM public.students other
         WHERE other.class_id = v_class_id AND other.deleted_at IS NULL
           AND other.id <> p_student_id AND other.name = v_old_name
    ) THEN
        UPDATE public.student_notification_events
           SET payload = jsonb_set(payload, '{actor_name}', to_jsonb(v_name))
         WHERE class_id = v_class_id AND payload->>'actor_name' = v_old_name;
        GET DIAGNOSTICS v_notice = ROW_COUNT;
    END IF;

    v_synced := jsonb_build_object(
        'marathon', v_marathon, 'neighbor', v_neighbor, 'book', v_book,
        'exhibition', v_exhibition, 'notification', v_notice);
    RETURN jsonb_build_object('status', 'ok', 'id', p_student_id, 'name', v_name, 'synced', v_synced);
END;
$$;

REVOKE ALL ON FUNCTION public.rename_class_student_v1(UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rename_class_student_v1(UUID, TEXT) TO authenticated;

COMMIT;
