BEGIN;

-- 새 보고서 사진은 학생 기기에서 720px·256KiB 이하로 줄인 뒤 업로드한다.
-- 기존 파일은 그대로 두되 Storage가 이후의 큰 업로드를 서버에서도 거부하게 한다.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'report-images',
    'report-images',
    false,
    262144,
    ARRAY['image/webp', 'image/jpeg']::TEXT[]
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;
