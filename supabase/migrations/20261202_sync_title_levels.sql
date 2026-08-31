-- 칭호 기준 동기화 — **손으로 고치지 마세요.**
-- `src/constants/writerLevels.js` 를 고친 뒤
-- `node scripts/sync-title-levels.mjs --write` 로 다시 만듭니다.
--
-- 화면과 DB 가 같은 기준을 봐야 하는 이유: DB 쪽은 학기 마감 때 그 시점의 칭호를
-- 스냅샷에 얼려 두는 데 쓰인다. 어긋나면 작별 편지의 칭호가 화면과 달라진다.

BEGIN;

CREATE OR REPLACE FUNCTION public.dragon_writer_level(
    p_chars BIGINT,
    p_posts BIGINT,
    p_override INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_override BETWEEN 1 AND 10 THEN p_override
        WHEN COALESCE(p_chars, 0) >= 26000 THEN 10
        WHEN COALESCE(p_chars, 0) >= 15600 THEN 9
        WHEN COALESCE(p_chars, 0) >= 10920 THEN 8
        WHEN COALESCE(p_chars, 0) >= 5460 THEN 7
        WHEN COALESCE(p_chars, 0) >= 3250 THEN 6
        WHEN COALESCE(p_chars, 0) >= 1820 THEN 5
        WHEN COALESCE(p_chars, 0) >= 910 THEN 4
        WHEN COALESCE(p_chars, 0) >= 390 THEN 3
        WHEN COALESCE(p_posts, 0) >= 1 THEN 2
        ELSE 1
    END;
$$;

CREATE OR REPLACE FUNCTION public.dragon_reader_level(
    p_score BIGINT,
    p_override INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_override BETWEEN 1 AND 7 THEN p_override
        WHEN COALESCE(p_score, 0) >= 300 THEN 7
        WHEN COALESCE(p_score, 0) >= 200 THEN 6
        WHEN COALESCE(p_score, 0) >= 120 THEN 5
        WHEN COALESCE(p_score, 0) >= 50 THEN 4
        WHEN COALESCE(p_score, 0) >= 20 THEN 3
        WHEN COALESCE(p_score, 0) >= 1 THEN 2
        ELSE 1
    END;
$$;

CREATE OR REPLACE FUNCTION public.dragon_diary_level(p_days BIGINT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT CASE
        WHEN COALESCE(p_days, 0) >= 40 THEN 7
        WHEN COALESCE(p_days, 0) >= 30 THEN 6
        WHEN COALESCE(p_days, 0) >= 21 THEN 5
        WHEN COALESCE(p_days, 0) >= 14 THEN 4
        WHEN COALESCE(p_days, 0) >= 7 THEN 3
        WHEN COALESCE(p_days, 0) >= 3 THEN 2
        ELSE 1
    END;
$$;

CREATE OR REPLACE FUNCTION public.dragon_reading_level(p_logs BIGINT, p_books BIGINT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT CASE
        WHEN COALESCE(p_logs, 0) >= 25 AND COALESCE(p_books, 0) >= 18 THEN 7
        WHEN COALESCE(p_logs, 0) >= 18 AND COALESCE(p_books, 0) >= 13 THEN 6
        WHEN COALESCE(p_logs, 0) >= 12 AND COALESCE(p_books, 0) >= 9 THEN 5
        WHEN COALESCE(p_logs, 0) >= 8 AND COALESCE(p_books, 0) >= 6 THEN 4
        WHEN COALESCE(p_logs, 0) >= 5 AND COALESCE(p_books, 0) >= 4 THEN 3
        WHEN COALESCE(p_logs, 0) >= 3 AND COALESCE(p_books, 0) >= 3 THEN 2
        ELSE 1
    END;
$$;

REVOKE ALL ON FUNCTION public.dragon_diary_level(BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dragon_reading_level(BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dragon_diary_level(BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.dragon_reading_level(BIGINT, BIGINT) TO service_role;

COMMIT;
