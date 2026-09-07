-- 활동 보고서의 `번호` 칸도 학급 번호를 쓴다(2026-09-07, 점검에서 발견).
--
-- `61260` 으로 학급 번호가 저장되는 값이 됐는데, 활동 보고서는 아직 **이름순 줄 번호**(`idx + 1`)를
-- `번호` 라고 띄우고 있었다. 같은 학생이 명단 화면과 보고서에서 서로 다른 번호로 보인다.
-- 조회 결과에 `student_no` 를 실어 주고 화면이 그 값을 쓰게 한다. 정렬도 번호순으로 맞춘다.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_teacher_activity_report_workspace_v1(p_class_id uuid, p_mission_ids uuid[], p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE v_limit INTEGER:=LEAST(GREATEST(COALESCE(p_limit,200),1),200); v_offset INTEGER:=GREATEST(COALESCE(p_offset,0),0); v_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.classes c WHERE c.id=p_class_id AND c.deleted_at IS NULL AND (c.teacher_id=auth.uid() OR public.auth_user_role()='ADMIN')) THEN RAISE EXCEPTION '학급 활동 보고서 권한이 없습니다.' USING ERRCODE='42501'; END IF;
    IF COALESCE(array_length(p_mission_ids,1),0)=0 OR array_length(p_mission_ids,1)>50 THEN RAISE EXCEPTION '과제는 1~50개를 선택해주세요.' USING ERRCODE='22023'; END IF;
    WITH valid_missions AS MATERIALIZED (SELECT m.id FROM public.writing_missions m WHERE m.class_id=p_class_id AND m.id=ANY(p_mission_ids)),
    base AS MATERIALIZED (
      SELECT p.id,p.student_id,p.mission_id,p.content,p.final_eval,p.initial_eval,p.eval_comment,p.is_submitted,p.is_confirmed,p.char_count,p.updated_at
      FROM public.student_posts p JOIN valid_missions m ON m.id=p.mission_id
      WHERE p.class_id=p_class_id AND p.is_submitted IS TRUE ORDER BY p.updated_at DESC,p.id
    ), page AS (SELECT * FROM base OFFSET v_offset LIMIT v_limit)
    SELECT jsonb_build_object(
      'version',1,
      'students',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'student_no',s.student_no) ORDER BY s.student_no NULLS LAST,s.name) FROM public.students s WHERE s.class_id=p_class_id AND s.deleted_at IS NULL),'[]'::jsonb),
      'posts',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.updated_at DESC,p.id) FROM page p),'[]'::jsonb),
      'total_count',(SELECT count(*) FROM base),'next_offset',CASE WHEN v_offset+v_limit<(SELECT count(*) FROM base) THEN v_offset+v_limit ELSE NULL END
    ) INTO v_result;
    RETURN v_result;
END; $$;

COMMIT;
