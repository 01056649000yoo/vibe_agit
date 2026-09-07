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
    assert.match(teacher, /applyGenrePreset, describePresetResult, getGenreEntries/);
    assert.doesNotMatch(teacher, /const GENRES = \[|const 글종류 = \[/, '글 종류 목록을 따로 만들면 안 됩니다.');

    const sql = readFileSync('supabase/migrations/20261266_neighbor_topic_uses_mission_form.sql', 'utf8');
    // 실제로 쓰이는 길은 래퍼다. 여기서 안 넘기면 core 를 고쳐도 값이 전달되지 않는다(처음에 그렇게 틀렸다).
    const wrapper = sql.slice(sql.indexOf('FUNCTION public.run_neighbor_teacher_action_v1'));
    assert.match(wrapper, /p_payload->>'genre'/, '래퍼가 글 종류를 안 넘기면 과제에 반영되지 않습니다.');
    assert.match(wrapper, /p_payload->>'mission_type_id'/);
    // 전용 틀은 운영 자료와 같은 모양으로 저장한다(genre=시, mission_type=poem, input_template=poem).
    assert.match(sql, /COALESCE\(v_type_id, v_genre, '글쓰기'\)/);
    assert.match(sql, /COALESCE\(v_type_id, 'freeform'\)/);
});
