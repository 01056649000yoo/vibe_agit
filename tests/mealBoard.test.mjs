import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getMealAllergenCodes,
  getStudentMealMatches,
  summarizeRoster
} from '../src/modules/tool/meal-board/mealBoardEngine.js';

const [manifest, entry, fullscreen, api, schoolApi, teacherSetup, teacherDashboardHook, edgeFunction, migration, privacyPolicy, deployment] = await Promise.all([
  readFile('src/modules/tool/meal-board/manifest.js', 'utf8'),
  readFile('src/modules/tool/meal-board/TeacherEntry.jsx', 'utf8'),
  readFile('src/modules/tool/meal-board/MealFullscreen.jsx', 'utf8'),
  readFile('src/modules/tool/meal-board/mealBoardApi.js', 'utf8'),
  readFile('src/utils/schoolApi.js', 'utf8'),
  readFile('src/components/teacher/TeacherProfileSetup.jsx', 'utf8'),
  readFile('src/hooks/useTeacherDashboard.js', 'utf8'),
  readFile('supabase/functions/neis-meal/index.ts', 'utf8'),
  readFile('supabase/migrations/20261175_meal_allergy_board.sql', 'utf8'),
  readFile('src/components/layout/PrivacyPolicy.jsx', 'utf8'),
  readFile('.github/workflows/deploy.yml', 'utf8')
]);

test('급식의 알레르기 코드와 학생별 오늘 일치 항목을 한 번에 계산한다', () => {
  const meals = [
    { dishes: [{ name: '우유', allergenCodes: [2] }], mealType: '중식' },
    { dishes: [{ name: '빵', allergenCodes: [6, 2, 99] }], mealType: '석식' }
  ];
  const codes = getMealAllergenCodes(meals);
  assert.deepEqual(codes, [2, 6]);
  assert.deepEqual(getStudentMealMatches({ allergenCodes: [1, 2, 6] }, codes), [2, 6]);
});

test('학급 요약은 미확인·등록·오늘 주의를 분리한다', () => {
  const summary = summarizeRoster([
    { confirmationStatus: 'unconfirmed', allergenCodes: [] },
    { confirmationStatus: 'confirmed_none', allergenCodes: [] },
    { confirmationStatus: 'has_items', allergenCodes: [2] },
    { confirmationStatus: 'has_items', allergenCodes: [3] }
  ], [2, 6]);
  assert.deepEqual(summary, {
    total: 4,
    unconfirmed: 1,
    confirmedNone: 1,
    hasItems: 2,
    mealMatches: 1
  });
});

test('교사 도구는 열 때만 최대 100명 RPC를 읽고 폴링·Realtime을 시작하지 않는다', () => {
  assert.match(manifest, /id: 'meal-board'/);
  assert.match(manifest, /home: 'none'/);
  assert.match(manifest, /load: 'on-open'/);
  assert.match(manifest, /writes: 'rpc'/);
  assert.match(manifest, /realtime: 'none'/);
  assert.match(manifest, /maxInitialRows: 100/);
  assert.doesNotMatch(entry, /setInterval|postgres_changes|\.channel\(/);
  assert.match(api, /get_teacher_meal_board_workspace_v1/);
  assert.doesNotMatch(api, /\.from\(/);
});

test('공개 전체화면은 급식만 받고 학생 명단이나 건강 프로필을 전달받지 않는다', () => {
  assert.match(entry, /<MealFullscreen school=\{workspace\?\.school\} date=\{date\} meals=\{meals\}/);
  assert.match(fullscreen, /function MealFullscreen\(\{ school, date, meals, allergenMap, onClose \}\)/);
  assert.doesNotMatch(fullscreen, /student|roster|healthAuthorization|allergenCodes\s*:\s*student/);
  assert.match(fullscreen, /학생 이름과 개인 건강 항목은 이 화면에 표시되지 않아요/);
});

test('나이스 키는 서버 환경변수에서만 읽고 브라우저는 Edge 함수를 호출한다', () => {
  assert.match(edgeFunction, /Deno\.env\.get\('NEIS_API_KEY'\)/);
  assert.doesNotMatch(edgeFunction, /NEIS_API_KEY\s*=\s*['"][A-Fa-f0-9]{20,}/);
  assert.match(edgeFunction, /Authorization/);
  assert.match(edgeFunction, /profile\?\.role === 'TEACHER'/);
  assert.match(edgeFunction, /profile\?\.is_approved === true/);
  assert.match(edgeFunction, /approval_revoked_at == null/);
  assert.match(edgeFunction, /SEARCH_MIN_INTERVAL_MS/);
  assert.match(edgeFunction, /MEAL_CACHE_TTL_MS/);
  assert.match(schoolApi, /functions\.invoke\('neis-meal'/);
  assert.doesNotMatch(schoolApi, /open\.neis\.go\.kr|NEIS_API_KEY/);
});

test('가입 학교 코드를 저장해 급식 기본 학교로 쓰고 프로필 변경도 같은 검색 원본을 쓴다', () => {
  assert.match(teacherSetup, /<SchoolSearchField/);
  assert.match(teacherSetup, /toTeacherSchoolColumns\(selectedSchool\)/);
  assert.match(teacherDashboardHook, /teacherSchoolToSelection/);
  assert.match(teacherDashboardHook, /school_office_code, school_code, school_address, school_verified_at/);
  assert.match(migration, /'source', 'teacher_default'/);
  assert.match(migration, /'source', 'class_override'/);
  assert.match(migration, /school_office_code = p_school_office_code/);
});

test('학생 건강 항목은 직접 공개하지 않고 담당 교사 RPC와 처리 근거 확인으로 잠근다', () => {
  assert.match(migration, /ALTER TABLE public\.student_meal_health_profiles ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.student_meal_health_profiles FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /class\.teacher_id = auth\.uid\(\)/);
  assert.match(migration, /class_meal_health_authorizations/);
  assert.match(migration, /민감정보 처리 근거와 학교 내부 절차를 먼저 확인/);
  assert.match(migration, /LIMIT 100/);
  assert.doesNotMatch(migration, /auth\.jwt|app_metadata/);
  assert.match(privacyPolicy, /학생별 급식 알레르기 항목/);
});

test('나이스 함수는 운영 동기화와 무인증 401 검증 대상이다', () => {
  assert.match(deployment, /volumes\/functions\/neis-meal/);
  assert.match(deployment, /functions\/v1\/neis-meal/);
  assert.match(deployment, /neis_edge_code" = "401"/);
});
