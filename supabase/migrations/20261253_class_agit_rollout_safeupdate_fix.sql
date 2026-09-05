-- 공개 단계 저장이 앱에서 늘 400으로 실패하던 것을 고친다.
-- 원인: `authenticator` 역할에 `session_preload_libraries=safeupdate` 가 걸려 있어(Supabase 기본)
-- PostgREST 로 들어오는 모든 요청은 WHERE 없는 DELETE/UPDATE 를 "DELETE requires a WHERE clause" 로 막는다.
-- `manage_class_agit_rollout_v1` 의 `DELETE FROM public.class_agit_pilot_classes;` 가 여기 걸렸다.
-- psql(postgres 역할)로는 통과해서 지금까지 드러나지 않았다. 시범 학급은 SQL 로 직접 넣어 왔다.
-- 고치는 방법: 지울 대상을 조건으로 밝힌다 — 이번에 고르지 않은 학급만 지우고 새 학급만 넣는다.
BEGIN;
CREATE OR REPLACE FUNCTION public.manage_class_agit_rollout_v1(p_payload JSONB DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_state public.class_agit_rollout%ROWTYPE; v_classes JSONB; v_allowed JSONB;
BEGIN
    IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='ADMIN' AND is_approved IS TRUE)
        THEN RAISE EXCEPTION '관리자만 공개 단계를 관리할 수 있습니다.' USING ERRCODE='42501'; END IF;
    SELECT * INTO v_state FROM public.class_agit_rollout WHERE singleton FOR UPDATE;
    IF p_payload IS NOT NULL THEN
        IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::TEXT)>2000
            OR p_payload->>'mode' NOT IN('internal','pilot','open','disabled') OR jsonb_typeof(p_payload->'external_enabled') IS DISTINCT FROM 'boolean'
            OR jsonb_typeof(p_payload->'class_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'class_ids')>2
            THEN RAISE EXCEPTION '공개 단계와 시범 학급(최대 2개)을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        IF (p_payload->>'expected_revision')::INTEGER IS DISTINCT FROM v_state.revision THEN RAISE EXCEPTION '공개 설정을 다시 불러와 주세요.' USING ERRCODE='PT409'; END IF;
        IF p_payload->>'mode'='pilot' AND jsonb_array_length(p_payload->'class_ids')=0 THEN RAISE EXCEPTION '시범 학급을 선택해 주세요.' USING ERRCODE='22023'; END IF;
        IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'class_ids') x WHERE NOT EXISTS(
            SELECT 1 FROM public.classes c JOIN public.profiles p ON p.id=c.teacher_id WHERE c.id=x::UUID AND c.deleted_at IS NULL AND p.is_approved IS TRUE AND p.role IN('ADMIN','TEACHER')))
            THEN RAISE EXCEPTION '허용할 수 없는 학급입니다.' USING ERRCODE='42501'; END IF;
        -- WHERE 를 반드시 남긴다. 고르지 않은 학급만 지우고 새로 고른 학급만 넣는다.
        DELETE FROM public.class_agit_pilot_classes pc WHERE NOT EXISTS(
            SELECT 1 FROM jsonb_array_elements_text(p_payload->'class_ids') x WHERE x::UUID=pc.class_id);
        INSERT INTO public.class_agit_pilot_classes
            SELECT DISTINCT value::UUID FROM jsonb_array_elements_text(p_payload->'class_ids')
            ON CONFLICT(class_id) DO NOTHING;
        UPDATE public.class_agit_rollout SET mode=p_payload->>'mode',external_enabled=(p_payload->>'external_enabled')::BOOLEAN,revision=revision+1 WHERE singleton;
    END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY name,id),'[]') INTO v_classes FROM (
        SELECT c.id,c.name,left(COALESCE(t.name,''),80) AS teacher_name,left(COALESCE(t.school_name,''),80) AS school_name
        FROM public.classes c JOIN public.profiles p ON p.id=c.teacher_id LEFT JOIN public.teachers t ON t.id=c.teacher_id
        WHERE c.deleted_at IS NULL AND p.is_approved IS TRUE AND p.role IN('ADMIN','TEACHER') ORDER BY c.name,c.id LIMIT 100) q;
    SELECT COALESCE(jsonb_agg(class_id ORDER BY class_id),'[]') INTO v_allowed FROM public.class_agit_pilot_classes;
    RETURN jsonb_build_object('version',1,'settings',(SELECT to_jsonb(r)-'singleton' FROM public.class_agit_rollout r WHERE singleton),'class_ids',v_allowed,'classes',v_classes);
END; $$;
REVOKE ALL ON FUNCTION public.manage_class_agit_rollout_v1(JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.manage_class_agit_rollout_v1(JSONB) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
