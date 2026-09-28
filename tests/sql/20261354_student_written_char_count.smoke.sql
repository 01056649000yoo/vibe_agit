-- 글자 수가 학생이 쓴 글자만 세는지, 화면(tests/charCountParity.test.mjs)과 같은 답을 내는지 본다.
-- 반드시 ROLLBACK 트랜잭션에서 돌린다(npm run migrate:check 가 감싼다).
DO $$
DECLARE
  v_question TEXT := '이 실험을 하기 전에 내가 예상한 결과는 무엇이었고, 그렇게 생각한 까닭은 무엇인지 자세히 적어 봅시다.';
  v_sections JSONB;
  v_content TEXT;
  v_got INTEGER;
BEGIN
  -- 한 덩어리 글 — 화면 테스트 '줄바꿈은 세지 않고 띄어쓰기는 몇 칸이든 한 칸이다' 와 같은 예시
  IF public.writing_content_char_count(repeat(E'\n', 900)) <> 0 THEN RAISE EXCEPTION '엔터 900번이 0자가 아님'; END IF;
  IF public.writing_content_char_count(repeat(' ', 900)) <> 0 THEN RAISE EXCEPTION '빈칸 900개가 0자가 아님'; END IF;
  IF public.writing_content_char_count('가     나') <> 3 THEN RAISE EXCEPTION '연속 빈칸이 한 칸이 아님'; END IF;
  IF public.writing_content_char_count('가' || chr(12288) || chr(160) || ' 나') <> 3 THEN
    RAISE EXCEPTION '전각·줄바꿈없는 빈칸이 빈칸으로 안 셈';
  END IF;
  IF public.writing_content_char_count('  가 나  ') <> 3 THEN RAISE EXCEPTION '앞뒤 빈칸을 셈'; END IF;
  IF public.writing_content_char_count(E'끝.\r\n\r\n시작') <> 4 THEN RAISE EXCEPTION '줄바꿈을 셈'; END IF;
  IF public.writing_content_char_count('가' || chr(8203) || '나' || chr(65279)) <> 2 THEN
    RAISE EXCEPTION '보이지 않는 서식 문자를 셈';
  END IF;
  IF public.writing_content_char_count('좋아😀') <> 3 THEN RAISE EXCEPTION '이모지가 한 글자가 아님'; END IF;
  IF public.writing_content_char_count(NULL) <> 0 THEN RAISE EXCEPTION 'NULL 이 0자가 아님'; END IF;
  -- 옛 테스트 예시(writingPolicy.test.mjs)
  IF public.writing_content_char_count('한 줄' || chr(8203) || E' 글\n\n둘째 줄') <> 9 THEN
    RAISE EXCEPTION 'writingPolicy 예시와 다름';
  END IF;

  -- 보고서: 질문 12칸 중 첫 칸에만 5자
  SELECT jsonb_agg(jsonb_build_object('id', 'section-' || n, 'heading', v_question,
           'body', CASE WHEN n = 1 THEN '안녕하세요' ELSE '' END, 'image', NULL))
    INTO v_sections FROM generate_series(1, 12) AS n;
  SELECT string_agg(CASE WHEN n = 1 THEN v_question || E'\n안녕하세요' ELSE v_question END, E'\n\n' ORDER BY n)
    INTO v_content FROM generate_series(1, 12) AS n;
  IF public.writing_content_char_count(v_content) < 600 THEN RAISE EXCEPTION '재현 실패: 본문에 칸 제목이 없음'; END IF;
  v_got := public.writing_post_char_count(v_content, jsonb_build_object('template', 'report', 'version', 1, 'sections', v_sections));
  IF v_got <> 5 THEN RAISE EXCEPTION '보고서가 칸 제목을 셈: %', v_got; END IF;

  -- 보고서: 내용 없이 사진 설명만
  v_got := public.writing_post_char_count(E'관찰\n사진 설명: 잎이 노랗다', jsonb_build_object('template', 'report',
    'sections', jsonb_build_array(jsonb_build_object('heading', '관찰', 'body', '',
      'image', jsonb_build_object('path', 'a.jpg', 'caption', '잎이 노랗다')))));
  IF v_got <> 6 THEN RAISE EXCEPTION '사진 설명만 있는 보고서: %', v_got; END IF;

  -- 편지: `에게`·빈 줄 빼고 14자
  v_got := public.writing_post_char_count(E'엄마에게\n\n안녕하세요\n\n사랑해요\n\n안녕히',
    jsonb_build_object('template', 'letter', 'recipient', '엄마', 'greeting', '안녕하세요', 'body', '사랑해요', 'closing', '안녕히'));
  IF v_got <> 14 THEN RAISE EXCEPTION '편지: %', v_got; END IF;

  -- 시: 연 사이 빈 줄 빼고 12자
  v_got := public.writing_post_char_count(E'하늘이\n파랗다\n\n바람이 분다',
    jsonb_build_object('template', 'poem', 'version', 1, 'stanzas', jsonb_build_array(E'하늘이\n파랗다', '바람이 분다')));
  IF v_got <> 12 THEN RAISE EXCEPTION '시: %', v_got; END IF;

  -- 칸 값만 부풀려도 본문을 넘지 못한다
  v_got := public.writing_post_char_count('가나다', jsonb_build_object('template', 'letter', 'recipient', repeat('가', 900)));
  IF v_got <> 3 THEN RAISE EXCEPTION '칸 값 부풀리기가 통함: %', v_got; END IF;

  -- 칸이 없는 글은 본문
  IF public.writing_post_char_count(E'오늘은\n\n비가 왔다', NULL) <> 8 THEN RAISE EXCEPTION '자유 글'; END IF;
  IF public.writing_post_char_count('일기', '{"diaryDate":"2026-09-28"}'::JSONB) <> 2 THEN RAISE EXCEPTION '일기'; END IF;

  -- 저장 트리거·제출이 새 함수를 쓴다
  IF pg_get_functiondef('public.guard_student_post_server_columns()'::regprocedure) NOT LIKE '%writing_post_char_count(%' THEN
    RAISE EXCEPTION '저장 트리거가 새 글자 세기를 안 씀';
  END IF;
  IF pg_get_functiondef('public.writing_engine_submit_assignment(uuid,uuid,text,text,jsonb,jsonb)'::regprocedure)
     NOT LIKE '%writing_post_char_count(p_content, p_structured_content)%' THEN
    RAISE EXCEPTION '제출이 새 글자 세기를 안 씀';
  END IF;

  -- 학생(authenticated)이 트리거 안에서 부를 수 있어야 한다
  IF NOT has_function_privilege('authenticated', 'public.writing_post_char_count(text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated 가 writing_post_char_count 를 못 부름';
  END IF;
  IF has_function_privilege('anon', 'public.writing_post_char_count(text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon 에게 열려 있음';
  END IF;
END $$;
