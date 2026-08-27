import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  DEFAULT_MEAL_VIEW,
  MEAL_COLUMN_OPTIONS,
  MEAL_TEXT_STEPS,
  findUniqueSchoolMatch,
  formatMealDate,
  getSeoulDateString,
  mealTextScale,
  normalizeMealView,
  summarizeRoster
} from '../src/modules/tool/meal-board/mealBoardEngine.js';

const [manifest, entry, noteModal, mealCss, schoolModal, fullscreen, api, schoolApi, teacherSetup, teacherDashboard, teachingToolsHub, teacherDashboardHook, edgeFunction, migration, privacyPolicy, deployment,
  teacherGuides
] = await Promise.all([
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
  readFile('.github/workflows/deploy.yml', 'utf8'),
  readFile('src/constants/teacherGuides.js', 'utf8')
]);

test('급식 날짜는 서울 날짜와 한국어 표시를 사용한다', () => {
  assert.equal(getSeoulDateString(new Date('2026-08-25T15:30:00Z')), '2026-08-26');
  assert.match(formatMealDate('2026-08-26'), /8월 26일/);
});

test('학교 자동 연결은 요청 순번 가드를 거치고 실패해도 다시 시도할 수 있다', () => {
  // ⓓ 자동 연결이 직접 setWorkspace 하면 요청 순번 가드를 건너뛰어, 먼저 떠 있던 조회 응답이
  // 뒤늦게 도착할 때 방금 연결한 학교가 연결 전 상태로 덮여 사라진다.
  const autoLink = entry.slice(entry.indexOf('const linkTeacherSchool'), entry.indexOf('void linkTeacherSchool'));
  assert.match(autoLink, /await loadWorkspace\(\)/, '자동 연결도 loadWorkspace 로 다시 읽어야 한다');
  assert.doesNotMatch(autoLink, /setWorkspace\(/, '자동 연결이 작업공간을 직접 덮어쓰면 안 된다');
  assert.match(autoLink, /await mealBoardApi\.saveSchool\(activeClassId, 'default', matchedSchool\)/);
  // 요청 순번 가드는 loadWorkspace 안에만 있어야 하고 계속 살아 있어야 한다.
  assert.match(entry, /const requestId = workspaceRequestRef\.current \+ 1/);
  assert.match(entry, /if \(requestId !== workspaceRequestRef\.current\) return/);

  // ⓐ 일시적 실패(속도 제한·나이스 지연) 뒤에도 다시 시도할 수 있어야 한다.
  assert.match(autoLink, /autoLinkAttemptRef\.current = ''/, '실패하면 시도 표시를 지워야 한다');
  assert.match(entry, /schoolAutoLinkRetry/, '다시 시도 열쇠가 효과의 의존 값에 있어야 한다');
  assert.match(entry, /`\$\{activeClassId\}:\$\{teacherSchoolName\}:\$\{schoolAutoLinkRetry\}`/);
  assert.match(entry, /setSchoolAutoLinkRetry\(\(value\) => value \+ 1\)/);
  assert.match(entry, /자동 연결 다시 시도/);
});

test('학교 검색은 넉넉히 받아 거른 뒤 자르고 정확히 같은 이름을 앞에 둔다', () => {
  // ⓑ 예전에는 20개만 받아 거른 뒤 또 20개로 잘라, 흔한 이름이면 선생님 학교가 목록에서 빠졌다.
  assert.match(edgeFunction, /const SCHOOL_FETCH_SIZE = 100/);
  assert.match(edgeFunction, /const SCHOOL_RESULT_MAX = 20/);
  assert.match(edgeFunction, /pSize', String\(SCHOOL_FETCH_SIZE\)/);
  assert.doesNotMatch(edgeFunction, /pSize', '20'/);
  // 거르기가 자르기보다 먼저여야 한다.
  const search = edgeFunction.slice(edgeFunction.indexOf('async function searchSchools'));
  assert.ok(search.indexOf('validSchoolCodes(school.officeCode') < search.indexOf('SCHOOL_RESULT_MAX)'),
    '거른 뒤에 잘라야 상한이 유효한 결과에 적용된다');

  // ⓒ 정확히 같은 이름을 앞으로 올려야, 동명 학교가 둘 이상일 때 둘 다 남아
  // 클라이언트의 "정확히 한 곳일 때만 연결"이 엉뚱한 학교를 고르지 않는다.
  assert.match(edgeFunction, /\.replace\(\/초등학교\$\/, '초'\)/, '클라이언트와 같은 정규화 규칙을 써야 한다');
  assert.ok(search.indexOf('.sort(') < search.indexOf('.slice(0, SCHOOL_RESULT_MAX)'),
    '정렬이 자르기보다 먼저여야 정확히 같은 이름이 살아남는다');
  // 정렬이 실제로 "검색어와 정확히 같은 이름"을 앞으로 보내는지 본다.
  // 순서만 보면 비교식을 망가뜨려도 통과한다(2026-08-27 변이 검사로 확인).
  assert.match(search, /const target = normalizeSchoolName\(query\)/);
  const sortBody = search.slice(search.indexOf('.sort('), search.indexOf('.slice(0, SCHOOL_RESULT_MAX)'));
  assert.match(sortBody, /normalizeSchoolName\(a\.schoolName\) !== target/);
  assert.match(sortBody, /normalizeSchoolName\(b\.schoolName\) !== target/);
  assert.doesNotMatch(sortBody, /0\s*\*/, '비교식을 0 으로 눌러 두면 정렬이 무의미해진다');
});

test('전체화면 급식판의 글자 크기·열 선택은 브라우저에 자동 저장된다', () => {
  // 교실마다 프로젝터와 뒷자리 거리가 달라 알맞은 크기가 하나로 정해지지 않는다.
  assert.deepEqual(MEAL_COLUMN_OPTIONS, [2, 3]);
  assert.equal(MEAL_TEXT_STEPS.length, 4);
  assert.equal(MEAL_TEXT_STEPS[0].scale, 1, '첫 단계는 기본 크기 그대로여야 한다');
  assert.ok(MEAL_TEXT_STEPS.every((step, index, all) => index === 0 || step.scale > all[index - 1].scale),
    '단계는 갈수록 커져야 한다');

  // 저장된 값이 깨졌거나 예전 판이어도 화면이 망가지지 않고 기본값으로 돌아간다.
  assert.deepEqual(normalizeMealView(null), DEFAULT_MEAL_VIEW);
  assert.deepEqual(normalizeMealView('깨진값'), DEFAULT_MEAL_VIEW);
  assert.deepEqual(normalizeMealView({ textStep: '없는단계', columns: 99 }), DEFAULT_MEAL_VIEW);
  assert.deepEqual(normalizeMealView({ textStep: 'xxlarge', columns: 2 }), { textStep: 'xxlarge', columns: 2 });
  assert.equal(mealTextScale('xxlarge'), 1.5);
  assert.equal(mealTextScale('없는단계'), 1, '모르는 단계는 기본 배율로 되돌린다');

  // 화면이 저장하고 다시 읽어야 다음에 열 때 그대로 나온다.
  assert.match(fullscreen, /window\.localStorage\.setItem\(MEAL_VIEW_STORAGE_KEY/);
  assert.match(fullscreen, /normalizeMealView\(readLocalStorageJson\(MEAL_VIEW_STORAGE_KEY/);
  // 고른 값은 카드에 붙어 CSS 가 쓴다.
  assert.match(fullscreen, /'--dish-cols': view\.columns/);
  assert.match(fullscreen, /'--dish-scale': mealTextScale\(view\.textStep\)/);
  assert.match(mealCss, /font-size: calc\(var\(--dish-name\) \* var\(--dish-scale, 1\)\)/);
  // 보기 설정일 뿐이므로 DB 나 RPC 를 건드리지 않는다.
  assert.doesNotMatch(fullscreen, /supabase|rpc\(|mealBoardApi/);
});

test('전체화면 급식판은 기본 3열과 높이 안전장치를 유지한다', () => {
  // 2열 고정이던 때 9개부터 카드가 화면 밖으로 나갔다. 기본은 3열로 두되
  // 선생님이 2열을 고를 수 있고, 선택값에 맞춰 간격과 넘침 처리를 안전하게 바꾼다.
  assert.match(mealCss, /\.meal-display-card \{[^}]*--dish-cols: 3/);
  assert.match(mealCss, /grid-template-columns: repeat\(var\(--dish-cols\)/);
  assert.doesNotMatch(mealCss, /\.meal-display-dishes \{[^}]*grid-template-columns: repeat\(2,/);
  // 급식이 여럿이면 카드가 좁아지므로 그때만 2열로 준다.
  assert.match(mealCss, /\.has-multiple \.meal-display-card \{[^}]*--dish-cols: 2/);
  // 음식 이름 길이가 제각각이라 왼쪽 정렬이면 오른쪽 끝이 들쭉날쭉해 불안해 보인다.
  assert.match(mealCss, /\.meal-display-dishes div \{[^}]*text-align: center/);

  // 카드가 칸을 정확히 채우게 한다. place-items:center 로 두면 카드가 내용만큼 커지는데,
  // 1fr 칸은 높이가 확정되지 않아 카드의 max-height:100% 가 무효가 된다(백분율 기준이 없다).
  // 실제로 카드가 칸보다 62px 커져 글자 옆에 사이드바가 생겼다(2026-08-27 실측).
  assert.match(mealCss, /\.meal-fullscreen-grid \{[^}]*align-items: stretch;[^}]*min-height: 0/);
  assert.match(mealCss, /\.meal-display-card \{[^}]*min-height: 0/);
  assert.doesNotMatch(mealCss, /\.meal-display-card \{[^}]*max-height: 100%/,
    '백분율 max-height 는 1fr 칸에서 무효라 stretch 로 대신한다');
  assert.match(mealCss, /\.meal-display-dishes \{[^}]*overflow: auto/);
  assert.match(mealCss, /\.meal-display-dishes \{[^}]*align-content: safe center/);
  assert.match(fullscreen, /data-columns=\{view\.columns\}/);
  assert.match(fullscreen, /data-text-step=\{view\.textStep\}/);
  assert.match(mealCss, /\.meal-display-card\[data-columns="2"\] \.meal-display-dishes \{[^}]*gap: clamp\(4px, \.7vh, 10px\)/);

  // 화면이 낮을 때는 여백과 제목만 줄여 급식 칸에 자리를 넘긴다.
  // 글자는 아래 min(vw, vh) 가 알아서 줄이므로 여기서 또 줄이면 경계에서 뚝 떨어진다.
  assert.match(mealCss, /@media \(max-height: 950px\)/);
  const shortScreen = mealCss.slice(mealCss.indexOf('@media (max-height: 950px)'));
  assert.match(shortScreen, /\.meal-fullscreen-grid \{[^}]*padding: clamp\(8px/);
  assert.match(shortScreen, /\.meal-fullscreen-header h2 \{[^}]*font-size/);
  assert.doesNotMatch(shortScreen, /--dish-name/, '글자를 계단으로 줄이면 경계에서 뚝 떨어진다');

  // 글자는 폭과 높이 중 작은 쪽을 따른다. 높이 기준 계단으로 나눴을 때 경계 바로 위 구간
  // (1600x900)이 큰 글자를 그대로 받아 오히려 가장 많이 넘쳤다(2026-08-27 실측).
  assert.match(mealCss, /--dish-name: clamp\(1\.25rem, min\(3\.2vw, 4\.4vh\), 3\.3rem\)/);
  assert.match(mealCss, /--dish-allergen: clamp\(\.88rem, min\(1\.6vw, 2\.2vh\), 1\.38rem\)/);
  // 아이가 태블릿에서 읽을 수 있는 바닥(0.8rem) 아래로 내려가지 않는다.
  const floors = [...mealCss.matchAll(/--dish-(?:name|allergen): clamp\(([\d.]+)rem/g)].map((m) => Number(m[1]));
  assert.ok(floors.length >= 2, '음식명·알레르기 두 글자 크기의 바닥이 모두 있어야 한다');
  assert.ok(Math.min(...floors) >= 0.8, `가장 작은 글자 ${Math.min(...floors)}rem 이 0.8rem 아래다`);
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
  // 카드 폭을 1080px 로 묶어 두었더니 1920 화면에서 좌우 762px 이 통째로 놀았다(화면의 40%).
  // 교실 프로젝터 전용 화면이므로 화면을 최대한 쓴다(2026-08-27 실측으로 1720px 까지 넓혔다).
  assert.match(mealCss, /\.meal-display-card \{[^}]*width: min\(1720px, 100%\); min-height: 0;/);
  assert.doesNotMatch(mealCss, /width: min\(1080px, 100%\)/, '좁은 폭으로 되돌리면 화면 40%가 논다');
  assert.match(mealCss, /\.meal-display-dishes \{[^}]*flex: 1;[^}]*align-content: safe center;/);
  assert.match(mealCss, /\.meal-display-dishes small \{[^}]*font-weight: 750; line-height: 1\.45/);
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

test('학교 변경 검색은 선택 해제와 학급 전환의 늦은 응답을 안전하게 처리한다', () => {
  assert.match(schoolModal, /import ModalCloseButton from ['"]\.\.\/\.\.\/\.\.\/components\/common\/ModalCloseButton['"]/);
  assert.match(schoolModal, /<ModalCloseButton onClick=\{onClose\} disabled=\{saving\} label="급식 학교 설정 닫기" \/>/);
  assert.match(schoolModal, /onSelect=\{setSelectedSchool\}/);
  assert.doesNotMatch(schoolModal, /setSchoolName\(school\.schoolName\)/);
  assert.doesNotMatch(schoolModal, />×<|meal-icon-button/);
  assert.match(entry, /const workspaceRequestRef = useRef\(0\)/);
  assert.match(entry, /const requestId = workspaceRequestRef\.current \+ 1[\s\S]*mealBoardApi\.getWorkspace\(activeClass\.id\)[\s\S]*requestId !== workspaceRequestRef\.current/);
  assert.match(entry, /return \(\) => \{ workspaceRequestRef\.current \+= 1; \}/);
  assert.match(entry, /onClose=\{closeSchoolModal\}/);
  assert.match(entry, /onClose=\{closeFullscreen\}/);
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

test('교사 도움말이 전체화면 조작과 자동 연결 다시 시도를 안내한다', () => {
  // 기능만 넣고 도움말을 두면 선생님은 있는 줄 모르고 못 쓴다.
  // 교실 프로젝터에 맞추라고 만든 조작이라 특히 그렇다(2026-08-27 미반영 상태로 발견).
  const guide = teacherGuides.slice(
    teacherGuides.indexOf("'meal-board': {"),
    teacherGuides.indexOf("    tools: {")
  );
  assert.match(guide, /글자.*보통·크게·더 크게·가장 크게/);
  assert.match(guide, /열.*2열·3열/);
  assert.match(guide, /고른 값은 그 기기에 남아/);
  // 실패해도 다시 시도할 수 있게 바뀌었으므로 `첫 실행에서만` 이라는 옛 설명은 남아 있으면 안 된다.
  assert.match(guide, /자동 연결 다시 시도/);
  assert.doesNotMatch(guide, /첫 실행에서 자동 연결/);
  // 화면의 실제 단추 이름과 어긋나면 안내가 거짓말이 된다.
  assert.match(fullscreen, /aria-label="글자 크기"/);
  assert.match(fullscreen, /aria-label="열 수"/);
  assert.match(entry, /자동 연결 다시 시도/);
});
