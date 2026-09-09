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

test('교사 화면은 세 단계를 따라가는 길로 보여 주고 활동은 두 탭으로 나뉜다', () => {
    // 선생님 요청(2026-09-07): 순서대로 따라하기만 하면 되게, 활동하기 안은 두 탭으로.
    const teacher = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8');
    const css = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.css', 'utf8');

    // 지금 어디까지 왔는지 보이게 끝난 단계에 ✓ 를, 다음 할 일을 한 줄로 적는다.
    assert.match(teacher, /neighbor-teacher__steps/);
    assert.match(teacher, /step\.done \? '✓' : index \+ 1/);
    assert.match(teacher, /hint: hasPartner \? '이웃 학급과 연결됨'/);

    // 활동은 둘뿐이라 큰 카드 두 장 대신 내용 폭만 쓰는 얇은 전환 바로 둔다.
    const activityTabRule = css.slice(css.indexOf('.neighbor-teacher__activity-tabs {'));
    assert.match(activityTabRule.slice(0, 260), /width: fit-content/);
    assert.match(css, /activity-tabs button[^}]*min-height: 36px/);

    // 좁은 화면에서도 단계는 세 칸을 지킨다 — 세로로 쌓으면 순서가 흐름으로 안 읽힌다.
    assert.match(css, /단계는 순서가 뜻이라 좁아져도 세 칸을 유지/);
});

test('주제 만들기는 넓은 화면에서 두 열로 모으고 질문만 내부 스크롤한다', () => {
    const teacher = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8');
    const css = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.css', 'utf8');

    assert.match(teacher, /neighbor-teacher__composer-grid/);
    assert.match(teacher, /neighbor-teacher__composer-main/);
    assert.match(teacher, /neighbor-teacher__composer-settings/);
    assert.match(teacher, /neighbor-teacher__setting-groups/);
    assert.match(css, /\.neighbor-teacher__composer-grid\s*\{[^}]*grid-template-columns:/);
    assert.match(css, /\.neighbor-teacher__composer-settings \.neighbor-teacher__questions\s*\{[^}]*max-height:[^}]*overflow-y: auto/);
    assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.neighbor-teacher__composer-settings \.neighbor-teacher__questions\s*\{\s*grid-template-columns: 1fr/);
});

test('활동 화면은 중복 머리말을 없애고 얇은 메뉴와 한 줄 도구막대를 쓴다', () => {
    const teacher = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8');
    const css = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.css', 'utf8');

    assert.doesNotMatch(teacher, /<small>활동 \{index \+ 1\}<\/small>/);
    assert.doesNotMatch(teacher, /한 화면에서 과제를 준비하세요/);
    assert.match(teacher, /neighbor-teacher__gallery-intro/);
    assert.match(css, /neighbor-teacher__activity-panel[^}]*padding: 13px/);
});

test('두 활동은 데스크톱에서 주 작업과 관리·결과를 좌우로 함께 보여 준다', () => {
    const teacher = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8');
    const css = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.css', 'utf8');

    assert.match(teacher, /neighbor-teacher__activity-workspace/);
    assert.match(teacher, /neighbor-teacher__management-column/);
    assert.match(css, /activity-workspace[^}]*grid-template-columns: minmax\(0, 1\.2fr\) minmax\(340px, \.8fr\)/);
    assert.match(css, /@media \(max-width: 1050px\)[\s\S]*activity-workspace\s*\{\s*grid-template-columns: 1fr/);
    assert.doesNotMatch(teacher, /topicView|setTopicView|neighbor-teacher__subtabs/);
    assert.ok(teacher.indexOf('새 주제 제안') < teacher.indexOf('진행 현황'), '주제 만들기와 활동 결과 순서가 잘못됐습니다.');
});

test('함께 쓰는 주제는 만들기·결과를 함께 보이고 글 종류 칸이 화면에 녹아 있다', () => {
    // 선생님 지적(2026-09-07): 글 종류 고르기를 모듈만 가져다 놓아 성의 없어 보였다.
    // 실제로 `.neighbor-teacher__genre` 에 스타일이 하나도 없어 맨 요소가 그대로 나오고 있었다.
    const teacher = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8');
    const css = readFileSync('src/modules/community/neighbor-agit/TeacherEntry.css', 'utf8');

    // 주제를 내는 일과 결과 확인을 좌우에서 동시에 본다.
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
