import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  findUniqueSchoolMatch,
  formatMealDate,
  getSeoulDateString,
  summarizeRoster
} from '../src/modules/tool/meal-board/mealBoardEngine.js';

const [manifest, entry, noteModal, mealCss, schoolModal, fullscreen, api, schoolApi, teacherSetup, teacherDashboard, teachingToolsHub, teacherDashboardHook, edgeFunction, migration, privacyPolicy, deployment] = await Promise.all([
  readFile('src/modules/tool/meal-board/manifest.js', 'utf8'),
  readFile('src/modules/tool/meal-board/TeacherEntry.jsx', 'utf8'),
  readFile('src/modules/tool/meal-board/StudentNoteModal.jsx', 'utf8'),
  readFile('src/modules/tool/meal-board/mealBoard.css', 'utf8'),
  readFile('src/modules/tool/meal-board/SchoolChangeModal.jsx', 'utf8'),
  readFile('src/modules/tool/meal-board/MealFullscreen.jsx', 'utf8'),
  readFile('src/modules/tool/meal-board/mealBoardApi.js', 'utf8'),
  readFile('src/utils/schoolApi.js', 'utf8'),
  readFile('src/components/teacher/TeacherProfileSetup.jsx', 'utf8'),
  readFile('src/components/teacher/TeacherDashboard.jsx', 'utf8'),
  readFile('src/components/teacher/TeachingToolsHub.jsx', 'utf8'),
  readFile('src/hooks/useTeacherDashboard.js', 'utf8'),
  readFile('supabase/functions/neis-meal/index.ts', 'utf8'),
  readFile('supabase/migrations/20261175_meal_allergy_board.sql', 'utf8'),
  readFile('src/components/layout/PrivacyPolicy.jsx', 'utf8'),
  readFile('.github/workflows/deploy.yml', 'utf8')
]);

test('급식 날짜는 서울 날짜와 한국어 표시를 사용한다', () => {
  assert.equal(getSeoulDateString(new Date('2026-08-25T15:30:00Z')), '2026-08-26');
  assert.match(formatMealDate('2026-08-26'), /8월 26일/);
});

test('학급 요약은 비고 유무만 집계한다', () => {
  const summary = summarizeRoster([
    { note: '' },
    { note: '도시락 지참' },
    { note: '   ' },
    { note: '급식 후 상담' }
  ]);
  assert.deepEqual(summary, {
    total: 4,
    withNote: 2,
    withoutNote: 2
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

test('공개 전체화면은 급식만 받고 학생 명단이나 비고를 전달받지 않는다', () => {
  assert.match(entry, /<MealFullscreen school=\{workspace\?\.school\} date=\{date\} meals=\{meals\}/);
  assert.match(fullscreen, /function MealFullscreen\(\{ school, date, meals, allergenMap, onClose \}\)/);
  assert.match(fullscreen, /import ModalCloseButton from ['"]\.\.\/\.\.\/\.\.\/components\/common\/ModalCloseButton['"]/);
  assert.match(fullscreen, /<ModalCloseButton onClick=\{onClose\} label="전체화면 급식판 닫기" tone="onDark" \/>/);
  assert.doesNotMatch(fullscreen, /meal-icon-button|>×<|>횞</);
  assert.doesNotMatch(fullscreen, /student|roster|studentNote|healthAuthorization|allergenCodes\s*:\s*student/);
  assert.match(fullscreen, /학생 이름과 비고는 이 화면에 표시되지 않아요/);
  assert.match(mealCss, /\.meal-display-card \{[^}]*width: min\(1080px, 100%\); min-height: clamp\(440px, 62vh, 680px\);/);
  assert.match(mealCss, /\.meal-display-dishes \{[^}]*flex: 1;[^}]*align-content: center;/);
  assert.match(mealCss, /\.meal-display-dishes strong \{[^}]*font-size: clamp\(1\.65rem, 3\.1vw, 2\.85rem\)/);
  assert.match(mealCss, /\.meal-display-dishes small \{[^}]*font-size: clamp\(1rem, 1\.6vw, 1\.28rem\); font-weight: 750; line-height: 1\.45/);
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

test('기존 교사 학교 이름은 고유한 정확 일치일 때만 기본 학교로 자동 연결한다', () => {
  const first = { officeCode: 'B10', schoolCode: '7010001', schoolName: '서울미래초등학교' };
  const duplicate = { officeCode: 'C10', schoolCode: '7020001', schoolName: '서울미래초등학교' };
  assert.equal(findUniqueSchoolMatch('서울 미래 초', [first]), first);
  assert.equal(findUniqueSchoolMatch('서울미래초등학교', [first, duplicate]), null);
  assert.match(teacherDashboard, /<TeachingToolsHub[^>]*teacherInfo=\{teacherInfo\}/);
  assert.match(teachingToolsHub, /<selected\.Entry[^>]*teacherInfo=\{teacherInfo\}/);
  assert.match(entry, /searchSchools\(teacherSchoolName\)/);
  assert.match(entry, /saveSchool\(activeClassId, 'default', matchedSchool\)/);
  assert.match(schoolModal, /initialSchoolName/);
});

test('우리 반 비고는 기본으로 접혀 있고 접근 가능한 버튼으로 펼친다', () => {
  assert.match(entry, /const \[notesExpanded, setNotesExpanded\] = useState\(false\)/);
  assert.match(entry, /aria-expanded=\{notesExpanded\}/);
  assert.match(entry, /aria-controls="meal-roster-content"/);
  assert.match(entry, /setNotesExpanded\(\(expanded\) => !expanded\)/);
  assert.match(entry, /notesExpanded \? <div id="meal-roster-content">/);
  assert.match(entry, /student\.note \? '수정' : '비고 입력'/);
  assert.match(mealCss, /\.meal-student-edit \{[^}]*color: var\(--meal-green-deep\); background: #edf6f0;/);
  assert.doesNotMatch(mealCss, /\.meal-student-edit \{ display: none; \}/);
});

test('학생 비고 입력창은 작은 전용 크기와 공용 닫기 버튼을 사용한다', () => {
  assert.match(noteModal, /import ModalCloseButton from ['"]\.\.\/\.\.\/\.\.\/components\/common\/ModalCloseButton['"]/);
  assert.match(noteModal, /<ModalCloseButton onClick=\{onClose\} disabled=\{saving\}/);
  assert.match(noteModal, /aria-describedby="meal-note-help"/);
  assert.match(noteModal, /rows=\{3\}/);
  assert.match(mealCss, /\.meal-note-modal \{ width: min\(440px, 100%\);/);
  assert.match(mealCss, /\.meal-note-modal \.meal-note-field textarea \{ min-height: 88px; max-height: 180px;/);
});

test('학생 비고는 선택적 최소 수집이며 담당 교사 RPC로만 읽고 쓴다', () => {
  assert.match(migration, /ALTER TABLE public\.student_meal_notes ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.student_meal_notes FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /class\.teacher_id = auth\.uid\(\)/);
  assert.match(migration, /save_teacher_student_meal_note_v1/);
  assert.match(migration, /CHAR_LENGTH\(v_note\) > 300/);
  assert.match(migration, /IF v_note = '' THEN[\s\S]*DELETE FROM public\.student_meal_notes/);
  assert.match(migration, /LIMIT 100/);
  assert.doesNotMatch(migration, /student_meal_health_profiles|class_meal_health_authorizations|allergen_codes/);
  assert.doesNotMatch(migration, /auth\.jwt|app_metadata/);
  assert.match(noteModal, /알레르기·질병 등 민감한 건강정보는 입력하지 마세요/);
  assert.match(noteModal, /maxLength=\{NOTE_MAX_LENGTH\}/);
  assert.match(privacyPolicy, /학생별 짧은 비고/);
  assert.doesNotMatch(entry, /개인 건강 항목|건강 항목을 관리/);
});

test('나이스 함수는 운영 동기화와 무인증 401 검증 대상이다', () => {
  assert.match(deployment, /volumes\/functions\/neis-meal/);
  assert.match(deployment, /functions\/v1\/neis-meal/);
  assert.match(deployment, /neis_edge_code" = "401"/);
});
