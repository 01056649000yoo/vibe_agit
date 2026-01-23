-- 시스템 설정 테이블 생성
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 초기 가입 승인 설정 (기본값: 수동 승인)
INSERT INTO public.system_settings (key, value)
VALUES ('auto_approval', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- RLS 활성화
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- 정책 설정
DROP POLICY IF EXISTS "Anyone can view settings" ON public.system_settings;
CREATE POLICY "Anyone can view settings" ON public.system_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can update settings" ON public.system_settings;
CREATE POLICY "Admins can update settings" ON public.system_settings FOR ALL USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'ADMIN'
    )
);

-- 권한 부여
GRANT SELECT ON public.system_settings TO anon, authenticated;
GRANT ALL ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
