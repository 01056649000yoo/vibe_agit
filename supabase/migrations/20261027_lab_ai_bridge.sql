BEGIN;

-- 연구소가 자체 OpenAI 키를 보관하지 않고 아지트의 승인 교사 AI 경로를 사용한다.
-- 구 연구소 사용자 ID는 통합 아지트 사용자 ID와 다르므로 서버 전용 매핑을 둔다.
CREATE TABLE IF NOT EXISTS public.lab_ai_teacher_links (
    lab_user_id UUID PRIMARY KEY,
    agit_user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.lab_ai_teacher_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lab_ai_teacher_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.lab_ai_teacher_links TO service_role;

INSERT INTO public.lab_ai_teacher_links(lab_user_id, agit_user_id)
SELECT '098d553a-cdbf-4dfb-9b4c-2c8c453c8a5d'::UUID,
       '2f5e2cf5-6a78-4d19-98a1-d871b52231f8'::UUID
WHERE EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = '2f5e2cf5-6a78-4d19-98a1-d871b52231f8'::UUID
)
ON CONFLICT (lab_user_id) DO UPDATE
SET agit_user_id = EXCLUDED.agit_user_id,
    active = TRUE,
    updated_at = NOW();

INSERT INTO public.lab_ai_teacher_links(lab_user_id, agit_user_id)
SELECT '4507af34-8cff-4e1b-9724-b981cb8d7531'::UUID,
       'bbf421da-e5c3-4815-a1ad-73d20f8a6906'::UUID
WHERE EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = 'bbf421da-e5c3-4815-a1ad-73d20f8a6906'::UUID
)
ON CONFLICT (lab_user_id) DO UPDATE
SET agit_user_id = EXCLUDED.agit_user_id,
    active = TRUE,
    updated_at = NOW();

CREATE OR REPLACE FUNCTION public.resolve_lab_ai_teacher_v1(p_lab_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_link public.lab_ai_teacher_links%ROWTYPE;
    v_profile public.profiles%ROWTYPE;
    v_allowed BOOLEAN := FALSE;
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
    END IF;
    IF p_lab_user_id IS NULL THEN
        RAISE EXCEPTION 'lab user id required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_link
    FROM public.lab_ai_teacher_links
    WHERE lab_user_id = p_lab_user_id
      AND active IS TRUE;

    IF v_link.lab_user_id IS NULL THEN
        RETURN jsonb_build_object('allowed', FALSE);
    END IF;

    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = v_link.agit_user_id;

    v_allowed := v_profile.role = 'ADMIN'
        OR (
            v_profile.role = 'TEACHER'
            AND v_profile.is_approved IS TRUE
            AND v_profile.approval_revoked_at IS NULL
        );

    IF v_allowed IS NOT TRUE THEN
        RETURN jsonb_build_object('allowed', FALSE);
    END IF;

    RETURN jsonb_build_object(
        'allowed', TRUE,
        'agit_user_id', v_link.agit_user_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_lab_ai_teacher_v1(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_lab_ai_teacher_v1(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
