-- 우리반 아지트를 전체 교사에게 연다. `open` 단계를 새로 넣고 운영 설정을 그리로 옮긴다.
-- open 이어도 학급마다 교사가 모듈을 켜야 열린다(class_agit_class_is_open_v1 의 enabled_modules 검사는 그대로).
-- 승인되지 않은 계정, 삭제된 학급, 담임이 아닌 학급은 여전히 막힌다. 외부 공유는 별개 스위치다.
BEGIN;
ALTER TABLE public.class_agit_rollout DROP CONSTRAINT IF EXISTS class_agit_rollout_mode_check;
ALTER TABLE public.class_agit_rollout ADD CONSTRAINT class_agit_rollout_mode_check
    CHECK(mode IN('internal','pilot','open','disabled'));

CREATE OR REPLACE FUNCTION public.class_agit_class_is_allowed_v1(p_class_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
    SELECT EXISTS(SELECT 1 FROM public.classes c JOIN public.profiles p ON p.id=c.teacher_id
        CROSS JOIN public.class_agit_rollout r WHERE c.id=p_class_id AND c.deleted_at IS NULL AND p.is_approved IS TRUE
        AND r.singleton AND ((r.mode='internal' AND p.role='ADMIN')
            OR (r.mode='open' AND p.role IN('ADMIN','TEACHER'))
            OR (r.mode='pilot' AND p.role IN('ADMIN','TEACHER')
                AND EXISTS(SELECT 1 FROM public.class_agit_pilot_classes pc WHERE pc.class_id=c.id))));
$$;

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
        -- open 단계에서도 시범 목록은 보존한다. 그 목록은 pilot 일 때만 읽으므로 되돌리기가 쉬워진다.
        DELETE FROM public.class_agit_pilot_classes;
        INSERT INTO public.class_agit_pilot_classes SELECT DISTINCT value::UUID FROM jsonb_array_elements_text(p_payload->'class_ids');
        UPDATE public.class_agit_rollout SET mode=p_payload->>'mode',external_enabled=(p_payload->>'external_enabled')::BOOLEAN,revision=revision+1 WHERE singleton;
    END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY name,id),'[]') INTO v_classes FROM (
        SELECT c.id,c.name,left(COALESCE(t.name,''),80) AS teacher_name,left(COALESCE(t.school_name,''),80) AS school_name
        FROM public.classes c JOIN public.profiles p ON p.id=c.teacher_id LEFT JOIN public.teachers t ON t.id=c.teacher_id
        WHERE c.deleted_at IS NULL AND p.is_approved IS TRUE AND p.role IN('ADMIN','TEACHER') ORDER BY c.name,c.id LIMIT 100) q;
    SELECT COALESCE(jsonb_agg(class_id ORDER BY class_id),'[]') INTO v_allowed FROM public.class_agit_pilot_classes;
    RETURN jsonb_build_object('version',1,'settings',(SELECT to_jsonb(r)-'singleton' FROM public.class_agit_rollout r WHERE singleton),'class_ids',v_allowed,'classes',v_classes);
END; $$;
REVOKE ALL ON FUNCTION public.class_agit_class_is_allowed_v1(UUID) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.manage_class_agit_rollout_v1(JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.manage_class_agit_rollout_v1(JSONB) TO authenticated;

-- 사용자 요청: 전체 교사 공개로 전환한다. 시범 목록은 지우지 않아 pilot 으로 되돌릴 수 있다.
UPDATE public.class_agit_rollout SET mode='open',revision=revision+1 WHERE singleton AND mode='pilot';
NOTIFY pgrst,'reload schema';
COMMIT;
