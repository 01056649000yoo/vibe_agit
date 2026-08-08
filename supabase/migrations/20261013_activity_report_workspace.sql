BEGIN;
CREATE OR REPLACE FUNCTION public.get_teacher_activity_report_workspace_v1(p_class_id UUID,p_mission_ids UUID[],p_limit INTEGER DEFAULT 200,p_offset INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
      'students',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) ORDER BY s.name) FROM public.students s WHERE s.class_id=p_class_id AND s.deleted_at IS NULL),'[]'::jsonb),
      'posts',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.updated_at DESC,p.id) FROM page p),'[]'::jsonb),
      'total_count',(SELECT count(*) FROM base),'next_offset',CASE WHEN v_offset+v_limit<(SELECT count(*) FROM base) THEN v_offset+v_limit ELSE NULL END
    ) INTO v_result;
    RETURN v_result;
END; $$;
CREATE OR REPLACE FUNCTION public.get_teacher_mission_evaluation_report_v1(p_mission_id UUID,p_limit INTEGER DEFAULT 100)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_class_id UUID; v_limit INTEGER:=LEAST(GREATEST(COALESCE(p_limit,100),1),100); v_result JSONB;
BEGIN
  SELECT m.class_id INTO v_class_id FROM public.writing_missions m WHERE m.id=p_mission_id;
  IF v_class_id IS NULL OR auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.classes c WHERE c.id=v_class_id AND c.deleted_at IS NULL AND (c.teacher_id=auth.uid() OR public.auth_user_role()='ADMIN')) THEN RAISE EXCEPTION '과제 평가 조회 권한이 없습니다.' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('version',1,'items',COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.student_name),'[]'::jsonb)) INTO v_result
  FROM (SELECT p.id,p.student_id,p.initial_eval,p.final_eval,p.eval_comment,s.name AS student_name FROM public.student_posts p JOIN public.students s ON s.id=p.student_id AND s.class_id=p.class_id WHERE p.class_id=v_class_id AND p.mission_id=p_mission_id AND s.deleted_at IS NULL ORDER BY s.name LIMIT v_limit) row_data;
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.get_teacher_activity_report_workspace_v1(UUID,UUID[],INTEGER,INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_teacher_mission_evaluation_report_v1(UUID,INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_activity_report_workspace_v1(UUID,UUID[],INTEGER,INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_teacher_mission_evaluation_report_v1(UUID,INTEGER) TO authenticated, service_role;
COMMIT;
