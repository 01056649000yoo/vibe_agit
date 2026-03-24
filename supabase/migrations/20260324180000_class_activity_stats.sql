-- 교사 대시보드(학생 관리 탭)에서 100명 이상의 point_logs 전체 역사를 
-- 클라이언트로 다운로드하여 집계하는 성능 병목(수십만 건 연산)을 해결하기 위한 RPC 함수입니다.

CREATE OR REPLACE FUNCTION get_class_activity_stats(p_class_id UUID)
RETURNS TABLE (
    student_id UUID,
    score_all BIGINT,
    score_week BIGINT,
    score_month BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id AS student_id,
        COALESCE(SUM(pl.amount) FILTER (WHERE pl.amount > 0), 0) AS score_all,
        COALESCE(SUM(pl.amount) FILTER (WHERE pl.amount > 0 AND pl.created_at >= NOW() - INTERVAL '7 days'), 0) AS score_week,
        COALESCE(SUM(pl.amount) FILTER (WHERE pl.amount > 0 AND pl.created_at >= NOW() - INTERVAL '30 days'), 0) AS score_month
    FROM students s
    LEFT JOIN point_logs pl ON s.id = pl.student_id
    WHERE s.class_id = p_class_id AND s.deleted_at IS NULL
    GROUP BY s.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
