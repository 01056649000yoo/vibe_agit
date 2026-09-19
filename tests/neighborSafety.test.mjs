import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const review = readFileSync('supabase/migrations/20261264_neighbor_comments_join_ai_review.sql', 'utf8');
const noSave = readFileSync('supabase/migrations/20261265_neighbor_drop_saving_other_class_posts.sql', 'utf8');
const api = readFileSync('src/modules/community/neighbor-agit/api.js', 'utf8');
const student = readFileSync('src/modules/community/neighbor-agit/StudentEntry.jsx', 'utf8');
const readme = readFileSync('src/modules/community/neighbor-agit/README.md', 'utf8');
const worker = readFileSync('supabase/functions/vibe-ai/index.ts', 'utf8');

test('이웃으로 가는 댓글도 우리 반 댓글과 같은 검사를 지난다', () => {
    // 2026-09-07 점검: 우리 반 댓글은 `pending` 으로 들어가 AI 검사를 거쳤지만(실제 79건 차단),
    // 다른 학교 아이에게 가는 이웃 댓글은 `visible` 로 바로 게시됐다. 위험이 큰 쪽에 안전장치가 없었다.
    assert.match(review, /v_content, 'pending'/, '이웃 댓글이 검사 없이 게시됩니다.');
    // 고쳐 쓴 댓글도 다시 검사받아야 한다 — 통과 뒤 몰래 바꿔치기하지 못하게.
    assert.match(review, /SET content = v_content, status = 'pending'/);

    // 같은 대기열을 쓰므로 작업기(Edge Function)는 고치지 않는다.
    assert.match(review, /FROM public\.neighbor_comments\s+WHERE status = 'pending'/);
    assert.match(review, /UPDATE public\.neighbor_comments SET\s+status = CASE WHEN p_is_appropriate THEN 'visible'/);
    assert.doesNotMatch(worker, /neighbor_comments/,
        '작업기가 표 이름을 알면 안 된다 — 대기열 RPC 가 두 표를 모두 본다.');

    // 화면은 검사 중임을 알려 줘야 아이가 댓글이 사라진 줄 알지 않는다.
    assert.match(api, /'pending', 'visible', 'deleted'/);
    assert.match(student, /댓글을 확인하는 중이에요/);
});

test('이웃 댓글을 저장하면 검사 큐를 깨운다 — 표 이름은 여전히 작업기 밖에 둔다', () => {
    /*
     * 2026-09-17 증상: 저장은 pending 으로 들어가는데 그 큐를 도는 드레인을 아무도 부르지 않아
     * **학급 댓글 검사가 우연히 일어날 때까지 갇혀** 있었다(운영에서 실제로 2건).
     * 고침: 학급 댓글과 대칭으로, 저장 뒤 표 이름 없는 일반 드레인을 부른다.
     */
    assert.match(api, /type: 'COMMENT_QUEUE_DRAIN'/, '이웃 댓글 저장이 검사 큐를 깨우지 않습니다.');
    // pending 일 때만 깨운다 — 이미 끝난 저장·삭제로 AI 를 부르지 않는다.
    const pendingGuard = api.indexOf("if (data.status === 'pending')");
    const drainCall = api.indexOf("type: 'COMMENT_QUEUE_DRAIN'");
    assert.ok(pendingGuard >= 0 && drainCall > pendingGuard && drainCall - pendingGuard < 220,
        '드레인 호출이 pending 확인 안에 있어야 합니다.');
    // 저장은 이미 끝났으므로 드레인 실패를 사용자 오류로 보이지 않는다.
    assert.ok(api.slice(drainCall, drainCall + 140).includes('catch(() => {})'),
        '드레인 실패가 사용자 오류로 올라갑니다.');

    // 작업기는 이 요청을 받아 큐만 비운다. 여전히 표 이름을 몰라야 한다.
    const workerBranch = worker.indexOf("type === 'COMMENT_QUEUE_DRAIN'");
    assert.ok(workerBranch >= 0, '작업기에 큐 비우기 분기가 없습니다.');
    assert.ok(worker.slice(workerBranch, workerBranch + 220).includes('drainCommentSafetyQueue'),
        '큐 비우기 분기가 실제로 드레인을 부르지 않습니다.');
    assert.doesNotMatch(worker, /neighbor_comments/);
});

test('상대 학급 글은 보관하지 않고, 내가 쓴 글만 우리 학급에 남는다', () => {
    // 선생님 결정(2026-09-07): 같은 주제로 쓴 글은 그 학급 학생 글만 보관한다.
    assert.match(noSave, /이웃 학급 글은 간직할 수 없습니다/);
    assert.match(noSave, /REVOKE ALL ON FUNCTION public\.toggle_neighbor_save_v1/);
    assert.doesNotMatch(api, /toggle_neighbor_save_v1/, '화면이 아직 간직하기를 부릅니다.');
    assert.doesNotMatch(student, /간직/, '학생 화면에 간직하기가 남아 있습니다.');
});

test('이웃 아지트는 실명 기준이며 옛 필명 기준을 되살리지 않는다', () => {
    // 선생님 결정: 가명을 쓰면 누가 썼는지 확인할 수 없어 생활지도가 안 된다.
    assert.match(readme, /이 앱은 실명으로 활동한다/);
    assert.match(readme, /폐기된 옛 기준/);
    // 학생 화면은 서버가 준 이름을 그대로 쓴다(가명으로 바꾸지 않는다).
    assert.match(student, /author_name/);
});

test('함께 쓰는 주제는 과제 만들기 모듈을 그대로 쓴다', () => {
    // 선생님 요청(2026-09-07): 글쓰기 양식을 불러와 미션을 만드는 방식으로 맞춘다.
    // 화면은 새 목록을 만들지 않고 `genreCatalog`·`MissionTypePicker` 를 그대로 쓴다 — 목록을 두 곳에
    // 두면 새 글 종류를 넣을 때 한쪽만 고쳐 갈라진다.
    const teacher = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8');
    assert.match(teacher, /import MissionTypePicker from/);
    assert.match(teacher, /applyGenreToMissionDraft/);
    assert.match(teacher, /createNeighborTopicDraft, toNeighborTopicProposal/);
    assert.doesNotMatch(teacher, /const GENRES = \[|const 글종류 = \[/, '글 종류 목록을 따로 만들면 안 됩니다.');

    const sql = readFileSync('supabase/migrations/20261266_neighbor_topic_uses_mission_form.sql', 'utf8');
    // 실제로 쓰이는 길은 래퍼다. 여기서 안 넘기면 core 를 고쳐도 값이 전달되지 않는다(처음에 그렇게 틀렸다).
    const wrapper = sql.slice(sql.indexOf('FUNCTION public.run_neighbor_teacher_action_v1'));
    assert.match(wrapper, /p_payload->>'genre'/, '래퍼가 글 종류를 안 넘기면 과제에 반영되지 않습니다.');
    assert.match(wrapper, /p_payload->>'mission_type_id'/);
    // 전용 틀은 운영 자료와 같은 모양으로 저장한다(genre=시, mission_type=poem, input_template=poem).
    assert.match(sql, /COALESCE\(v_type_id, v_genre, '글쓰기'\)/);
    assert.match(sql, /COALESCE\(v_type_id, 'freeform'\)/);

    // 포인트는 학급 과제와 같게, 우리 반 댓글도 연다(2026-09-07 결정).
    // 예전에는 `0, 0, 0, FALSE` 로 박혀 있어 이웃 주제만 포인트가 없고 같은 반 댓글도 못 달았다.
    const rewards = readFileSync('supabase/migrations/20261267_neighbor_topic_rewards_and_comments.sql', 'utf8');
    assert.match(rewards, /v_base_reward, v_bonus_threshold, v_bonus_reward/);
    assert.doesNotMatch(rewards, /v_min_paragraphs, 0, 0, 0, FALSE/, '포인트·댓글이 다시 박혔습니다.');
    const rewardWrapper = rewards.slice(rewards.indexOf('FUNCTION public.run_neighbor_teacher_action_v1'));
    assert.match(rewardWrapper, /p_payload->>'base_reward'/, '래퍼가 포인트를 안 넘깁니다.');
    const proposalAdapter = readFileSync('src/modules/community/neighbor-agit/topicProposalAdapter.js', 'utf8');
    assert.match(proposalAdapter, /base_reward: mission\.base_reward/);
    assert.match(readFileSync('src/modules/community/neighbor-agit/TeacherEntry.css', 'utf8'),
        /neighbor-teacher__reward-grid/);
});

test('준비는 진행형 마법사로 안내하고, 운영은 요약 바 + 활동 두 탭으로 나뉜다', () => {
    // 2026-09-17 재구성: 3단계 탭을 걷어내고 준비(참여 2학급 전)는 진행형 마법사로,
    // 운영은 얇은 요약 바 + 최상위 탭 2개로 바꿨다.
    const teacher = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8');
    const css = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.css', 'utf8');

    // 준비 마법사: 끝난 단계 ✓(is-done), 지금 단계 강조(is-current).
    assert.match(teacher, /neighbor-teacher__wizard-steps/);
    assert.match(teacher, /className="is-done"/);
    assert.match(teacher, /is-current/);
    // 옛 3단계 탭 nav 는 없앴다.
    assert.doesNotMatch(teacher, /neighbor-teacher__steps\b/);

    // 운영: 얇은 요약 바로 학생 공개·검토함·공간 관리를 어느 탭에서든 연다.
    assert.match(teacher, /neighbor-teacher__bar/);

    // 활동은 둘뿐이라 내용 폭만 쓰는 얇은 전환 바로 둔다.
    const activityTabRule = css.slice(css.indexOf('.neighbor-teacher__activity-tabs {'));
    assert.match(activityTabRule.slice(0, 260), /width: fit-content/);
    assert.match(css, /activity-tabs button[^}]*min-height: 36px/);

    // 좁은 화면에서는 마법사 단계가 한 열로 접힌다.
    assert.match(css, /\.neighbor-teacher__wizard-steps \{ grid-template-columns: 1fr/);
});

test('주제 만들기 모달은 위→아래 세로 흐름으로 크게 쓰고 AI 질문 추천을 쓴다', () => {
    // 선생님 요청(2026-09-18): 모달이 좁아 두 열이 답답했다 → 세로 한 흐름으로, 질문 칸도 넓게.
    // 길잡이 질문은 미션 만들기 모듈과 같은 방식으로 AI 추천을 붙인다.
    const teacher = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8');
    const css = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.css', 'utf8');

    assert.match(teacher, /neighbor-teacher__composer-flow/);
    assert.match(teacher, /neighbor-teacher__form-step/);
    assert.match(teacher, /neighbor-teacher__setting-groups/);
    assert.match(css, /\.neighbor-teacher__composer-flow\s*\{[^}]*display: grid/);
    // AI 질문 추천(미션 모듈과 같은 callAI 경로 재사용).
    assert.match(teacher, /generateGuideQuestions/);
    assert.match(teacher, /callAI/);
    assert.match(teacher, /AI 추천/);
});

test('활동 화면은 중복 머리말을 없애고 얇은 메뉴와 한 줄 도구막대를 쓴다', () => {
    const teacher = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8');
    const css = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.css', 'utf8');

    assert.doesNotMatch(teacher, /<small>활동 \{index \+ 1\}<\/small>/);
    assert.doesNotMatch(teacher, /한 화면에서 과제를 준비하세요/);
    assert.match(teacher, /neighbor-teacher__gallery-intro/);
    assert.match(css, /neighbor-teacher__activity-panel[^}]*padding: 13px/);
});

test('두 활동은 각자 3스텝(모으기·관리·반응)으로 나뉘고 반응은 모달로 크게 본다', () => {
    // 선생님 요청(2026-09-18): 불러오기/만들기 버튼 블록이 공간을 잡아먹었다 → 각 탭을 스텝 흐름으로,
    // 댓글·반응은 모달로 크게. 좌우 2단 배치(activity-workspace)와 관리 열(management-column)은 없앴다.
    const teacher = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8');
    const css = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.css', 'utf8');

    assert.match(teacher, /neighbor-teacher__stepbar/);
    assert.match(teacher, /renderStepBar/);
    assert.match(teacher, /galleryStep === 'collect'/);
    assert.match(teacher, /galleryStep === 'manage'/);
    assert.match(teacher, /galleryStep === 'engage'/);
    assert.match(teacher, /topicStep === 'topics'/);
    // 댓글·반응은 공개 글을 눌러 모달로 크게 본다(공용 부품 재사용).
    assert.match(teacher, /renderEngageStep/);
    assert.match(teacher, /neighbor-teacher__engage-card/);
    assert.match(css, /\.neighbor-teacher__engage-list\b/);
    // 옛 좌우 2단·관리 열은 제거.
    assert.doesNotMatch(teacher, /neighbor-teacher__activity-workspace|neighbor-teacher__management-column/);
});

test('함께 쓰는 주제는 만들기를 모달로 열고 화면은 활동 결과만 넓게 쓴다', () => {
    // 선생님 요청(2026-09-18): 만들기와 결과가 한 화면에 같이 나와 좁았다 → 만들기는 모달,
    // 화면은 활동 결과만. 머리 행의 "주제 만들기" 버튼으로 모달을 연다.
    const teacher = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8');
    const css = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.css', 'utf8');

    // 만들기는 모달(topicCreateOpen), 버튼으로 연다.
    assert.match(teacher, /topicCreateOpen/);
    assert.match(teacher, /setTopicCreateOpen\(true\)/);
    assert.match(teacher, /<Modal isOpen=\{topicCreateOpen\}/);
    assert.match(teacher, /neighbor-teacher__activity-head/);
    assert.match(css, /\.neighbor-teacher__activity-head\b/);
    // 하위 전환 탭은 더 두지 않는다(모달로 대체).
    assert.doesNotMatch(teacher, /neighbor-teacher__subtabs/);
    assert.match(teacher, /주제 만들기/);
    assert.match(teacher, /진행 현황/);

    // 고르기 전·후 모양이 달라야 지금 무엇이 정해졌는지 보인다.
    assert.match(teacher, /neighbor-teacher__genre is-picked/);
    assert.match(teacher, /neighbor-teacher__genre is-empty/);

    // 글 종류 고르기는 **창으로** 뜬다. 그 자리에 펼치면 주제 입력 아래로 밀려난다(2026-09-07).
    const portal = teacher.slice(teacher.indexOf('<ModalPortal>'), teacher.indexOf('</ModalPortal>'));
    assert.ok(portal.includes('<Modal'), '글 종류 고르기가 창 안에 없습니다.');
    assert.ok(portal.includes('<MissionTypePicker'), '고르기 판이 창 밖에 있습니다.');
    // 창 안에서는 자기 머리말을 그리지 않는다 — 제목·닫기 단추가 두 번 나오면 안 된다.
    assert.match(teacher, /<MissionTypePicker\s+embedded/);
    // 고르면 바로 닫힌다.
    assert.match(teacher, /const selectGenre = \(genreId, missionTypeId = ''\) => \{\s*setGenrePickerOpen\(false\);/);

    // 과제 만들기 화면은 예전처럼 그 자리에 펼치는 판을 그대로 쓴다(기본값을 바꾸지 않았다).
    const picker = readFileSync('src/components/teacher/MissionTypePicker.jsx', 'utf8');
    assert.match(picker, /embedded = false/);

    // 화면에 쓰는 class 는 모두 스타일이 있어야 한다 — 없으면 맨 요소가 그대로 나온다.
    for (const name of ['__genre', '__genre-mark', '__genre-body', '__genre-go',
        '__preset-notice', '__form-step']) {
        assert.ok(css.includes(`.neighbor-teacher${name}`), `neighbor-teacher${name} 스타일이 없습니다.`);
    }
});
