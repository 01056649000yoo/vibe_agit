-- 이웃 학급 글은 보관하지 않는다(2026-09-07, 선생님 결정).
--
-- 결정: “같은 주제로 쓴 글은 그 글 통째로 해당 학급의 학생 글만 보관한다. 상대방 글은 보관이 안 되어야 한다.”
--
-- 지금 상태:
--   - **내가 쓴 글**은 이미 그 학급의 진짜 과제 글(`student_posts`)이라 학급 기록·보관함에 그대로 남는다.
--     함께 쓰는 주제는 학급마다 `writing_missions` 를 하나씩 만들고 학생은 평소처럼 글을 쓴다. 손댈 것이 없다.
--   - **상대 학급 글**은 `🔖 간직하기`(`neighbor_saves`)로 참조를 남길 수 있었다. 이걸 없앤다.
--     참조뿐이라 본문이 복사되지는 않았지만, 간직한 글을 다시 볼 화면도 없어 쓸모가 없었다.
--
-- 표는 지우지 않고 잠근다(기능 삭제보다 기본 OFF). 지금 0건이라 지울 자료도 없다.
BEGIN;

DELETE FROM public.neighbor_saves WHERE TRUE;

/**
 * 이웃 글 간직하기는 더 이상 제공하지 않는다.
 *
 * 화면에서 단추를 뺐지만, 옛 화면이 남아 있는 브라우저가 부를 수 있으므로 서버도 분명히 막는다.
 * 표는 남겨 둔다 — 읽는 함수 몇 곳이 `my_saved` 를 아직 내려 주고 있어 지우면 그쪽을 함께 고쳐야 한다.
 */
CREATE OR REPLACE FUNCTION public.toggle_neighbor_save_v1(p_space_id UUID, p_shared_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 부르는 사람이 이 공간의 학생이 맞는지는 그대로 확인한다(막는 이유를 정확히 알려 주기 위해).
    PERFORM public.assert_neighbor_student_access_v1(p_space_id);
    RAISE EXCEPTION '이웃 학급 글은 간직할 수 없습니다. 내가 쓴 글만 우리 학급에 남습니다.'
        USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_neighbor_save_v1(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
