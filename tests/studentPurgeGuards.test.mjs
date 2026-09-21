import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

/*
 * 지운 학생이 실제로 지워지게 하는 장치들(2026-09-21 요청).
 *
 * 실제로 있었던 일: 3일이 지나면 영구 삭제하기로 해 놓고, 그 일을 **교사가 `복구함` 을 열 때만**
 * 했다. 실수로 지운 게 아니면 그 창을 열 일이 없으니 아무도 안 열면 영영 안 돌았다.
 * 2026-09-21 실측으로 16개 학급 23명이 남아 있었고 가장 오래된 것은 197일째였다.
 * 개인정보처리방침에 "삭제하는 즉시 영구 삭제" 라고 적어 둔 것과 어긋난다.
 *
 * 여기서 지키는 것은 넷이다.
 *   1. 교사가 창을 열지 않아도 저절로 돈다(cron).
 *   2. 한 명이 막혀도 나머지는 지워진다.
 *   3. 삭제를 막던 외래키 둘이 다시 살아나지 않는다.
 *   4. 정리에 실패해도 교사 화면에 "복구할 학생이 없어요" 로 보이지 않는다.
 */

const MIGRATION = 'supabase/migrations/20261330_purge_expired_students_cron_and_delete_mines.sql';

const [purge, manager, privacy] = await Promise.all([
  readFile(MIGRATION, 'utf8'),
  readFile('src/hooks/useStudentManager.js', 'utf8'),
  readFile('src/components/layout/PrivacyPolicy.jsx', 'utf8'),
]);

const bodyOf = (sql, name) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.notEqual(start, -1, `${name} 를 찾지 못했습니다.`);
  const end = sql.indexOf('\n$$;', start);
  assert.notEqual(end, -1, `${name} 의 끝을 찾지 못했습니다.`);
  return sql.slice(start, end);
};

test('교사가 복구함을 열지 않아도 매일 저절로 돈다', () => {
  assert.match(purge, /cron\.schedule\(\s*'purge-expired-students'/,
    '자동 실행 등록이 없습니다. 이러면 교사가 창을 열 때만 지워집니다.');
  // 다했니 정리(03:00)와 겹치지 않게 둔다.
  assert.match(purge, /'purge-expired-students',\s*'20 3 \* \* \*'/);
  assert.match(purge, /SELECT public\.purge_expired_students_all_v1\(\)/);
  // 두 번 적용해도 job 이 겹치지 않아야 한다.
  assert.match(purge, /cron\.unschedule\('purge-expired-students'\)/);
});

test('자동 실행 함수는 브라우저에서 부를 수 없다', () => {
  const body = bodyOf(purge, 'purge_expired_students_all_v1');
  /*
   * 학급을 가리지 않고 지우는 함수다. 로그인한 사람이 부를 수 있으면 남의 학급 학생까지 지워진다.
   * 판별은 session_user 로 한다 — current_setting('role') 은 대개 'none' 이라 크론까지 막힌다(20261328).
   */
  assert.match(body, /auth\.uid\(\) IS NOT NULL/, '로그인 사용자를 막지 않습니다.');
  assert.match(body, /session_user NOT IN \('service_role', 'supabase_admin', 'postgres'\)/);
  // 주석에는 적어 둘 수 있으므로 주석을 뺀 실제 코드만 본다.
  const code = body.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(code, /current_setting\('role'\)/,
    "current_setting('role') 로 판별하면 크론도 막힙니다(20261328 에서 겪었습니다).");
  assert.match(purge, /REVOKE ALL ON FUNCTION public\.purge_expired_students_all_v1\(\) FROM PUBLIC, anon, authenticated/);
  assert.match(purge, /GRANT EXECUTE ON FUNCTION public\.purge_expired_students_all_v1\(\) TO service_role/);
  assert.doesNotMatch(purge, /GRANT EXECUTE ON FUNCTION public\.purge_expired_students_all_v1\(\)[^;]*authenticated/);
});

test('한 명이 막혀도 나머지 학생은 지운다', () => {
  /*
   * 예전에는 `DELETE ... WHERE class_id=...` 한 문장이라, 한 학생이 무언가에 걸리면
   * 그 학급의 대기 학생이 **모두** 안 지워졌다.
   */
  for (const name of ['purge_expired_students', 'purge_expired_students_all_v1']) {
    const body = bodyOf(purge, name);
    assert.match(body, /FOR v_student_id IN/, `${name} 가 한 명씩 돌지 않습니다.`);
    assert.match(body, /EXCEPTION WHEN OTHERS THEN[\s\S]*RAISE WARNING/,
      `${name} 가 실패한 학생을 건너뛰지 않습니다.`);
    assert.match(body, /DELETE FROM public\.students WHERE id = v_student_id/);
  }
  // 학급용은 남의 학급을 지우지 않는다.
  const classScoped = bodyOf(purge, 'purge_expired_students');
  assert.match(classScoped, /class\.teacher_id = auth\.uid\(\)/, '담임 확인이 사라졌습니다.');
  assert.match(classScoped, /student\.class_id = p_class_id/, '학급 범위가 사라졌습니다.');
});

test('삭제를 막던 외래키 둘이 다시 살아나지 않는다', () => {
  /*
   * ⚠️ RESTRICT 는 NO ACTION 과 달리 **연쇄 삭제 중에도 즉시** 막는다. 학생을 지우면
   * point_logs 와 칭호 보상이 나란히 딸려 지워지는데 순서가 정해져 있지 않아,
   * 같은 조건인데 되기도 하고 안 되기도 한다.
   */
  assert.match(purge, /student_title_reward_claims_point_log_id_fkey[\s\S]*?ON DELETE NO ACTION/,
    '칭호 보상이 아직 즉시 막는 방식입니다.');
  // 개인 문집은 그 학생의 것이므로 학생과 함께 사라진다(학급 문집은 주인이 비어 있어 안 걸린다).
  assert.match(purge, /class_agit_books_owner_student_fkey[\s\S]*?ON DELETE CASCADE/,
    '개인 문집이 아직 학생 삭제를 막습니다.');
  assert.doesNotMatch(purge, /ADD CONSTRAINT[\s\S]*?ON DELETE RESTRICT/,
    '이 마이그레이션이 RESTRICT 를 새로 만들고 있습니다.');
});

test('정리에 실패해도 복구함 목록은 그대로 보여 준다', () => {
  /*
   * 예전에는 정리와 목록 조회가 같은 try 안에 있어, 정리가 막히면 조회까지 건너뛰고
   * catch 가 빈 배열을 돌려줬다. 교사 화면에는 "복구할 학생이 없어요" 로 보였다.
   */
  const fetchBlock = manager.slice(
    manager.indexOf('const fetchDeletedStudents'),
    manager.indexOf('const handleRestoreStudent')
  );
  assert.match(fetchBlock, /const \{ error: purgeError \} = await supabase\.rpc\('purge_expired_students'/,
    '정리 실패를 따로 받지 않습니다.');
  assert.doesNotMatch(fetchBlock, /await supabase\.rpc\('purge_expired_students'[^)]*\);\s*\n\s*(?!.*purgeError)/,
    '정리 결과를 버리고 있습니다.');
  assert.match(fetchBlock, /purgeError\) console\.error/, '정리 실패를 조용히 삼킵니다.');
});

test('이 마이그레이션 파일은 하나뿐이다', async () => {
  // 같은 번호로 두 벌이 생기면 적용 순서가 뒤바뀐다(이 저장소는 같은 날짜에 여러 개를 두므로
  // 날짜가 아니라 이 번호 하나만 본다).
  const files = (await readdir('supabase/migrations')).filter((f) => f.startsWith('20261330'));
  assert.equal(files.length, 1, `20261330 로 시작하는 파일이 ${files.length}개입니다.`);
});

test('개인정보처리방침이 약속한 대로 실제로 지워진다', () => {
  // 방침에 "즉시 영구 삭제" 라고 적어 두었으므로, 그 일을 하는 자동 실행이 반드시 있어야 한다.
  assert.match(privacy, /영구 삭제/);
  assert.match(purge, /cron\.schedule\(\s*'purge-expired-students'/);
});
