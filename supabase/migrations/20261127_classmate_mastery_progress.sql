-- 친구 아지트에서도 관문 진행도(덱마스터 N/10)를 보여 준다.
--
-- 2026-08-17에는 "완성된 성취는 자랑스럽고 진행 중인 상태는 사적"이라는 기준으로 친구용 응답에서
-- `passed_count` 를 뺐다(A안). 실제로 붙여 놓고 보니 반대 문제가 더 컸다 — 친구 아지트에서
-- **친구가 어디까지 왔는지가 전혀 안 보여** 휘장 칸이 "받았다/못 받았다" 두 값짜리가 되고,
-- 오른쪽이 텅 비어 칸 자체가 초라했다. 사용자 요청으로 진행도를 연다.
--
-- 여는 범위는 **관문 진행도 하나뿐**이다. 이 값은 이미 공개되던 `all_collections_cleared`
-- (모두 완료 여부)와 같은 종류의 정보이고, 학급 안에서 서로의 학습 진도를 보는 것은
-- 이 앱의 다른 화면(친구 책장·칭호)이 이미 하고 있는 일이다.
-- 시험 점수·오답·시도 횟수는 여전히 어떤 친구용 응답에도 들어가지 않는다.
--
-- `learning_engine_mastery_summary_v1` 은 그대로 둔다. 무엇을 보여 줄지는 **부르는 쪽**이 정하고
-- 엔진은 시키는 대로 담는다. 나중에 콘텐츠마다 공개 범위를 달리하고 싶어지면 여기만 고친다.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_classmate_learning_mastery_v1(p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me public.students%ROWTYPE;
    v_friend public.students%ROWTYPE;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    SELECT s.* INTO v_me FROM public.students s
    WHERE s.auth_id = auth.uid() AND s.is_active IS DISTINCT FROM FALSE
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW()) LIMIT 1;
    IF v_me.id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    -- 같은 학급 친구만 볼 수 있다.
    SELECT s.* INTO v_friend FROM public.students s
    WHERE s.id = p_student_id AND s.class_id = v_me.class_id
      AND s.is_active IS DISTINCT FROM FALSE
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW());
    IF v_friend.id IS NULL THEN
        RAISE EXCEPTION '같은 반 친구를 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    -- 관문 진행도를 함께 담는다(2026-08-18 변경). 점수·오답·시도 횟수는 이 요약에 애초에 없다.
    RETURN public.learning_engine_mastery_summary_v1(v_friend.id, v_friend.class_id, TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.get_classmate_learning_mastery_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_classmate_learning_mastery_v1(UUID) TO authenticated, service_role;

COMMIT;
