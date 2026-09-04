import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [baseMigration, activityMigration, smoke, api, entry, manifest, performance, security] = await Promise.all([
    readFile('supabase/migrations/20261199_neighbor_agit_data_foundation.sql', 'utf8'),
    readFile('supabase/migrations/20261237_neighbor_activity_spaces.sql', 'utf8'),
    readFile('tests/sql/20261199_neighbor_agit_data_foundation.smoke.sql', 'utf8'),
    readFile('src/modules/community/neighbor-agit/api.js', 'utf8'),
    readFile('src/modules/community/neighbor-agit/StudentEntry.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/manifest.js', 'utf8'),
    readFile('PERFORMANCE_HARNESS.md', 'utf8'),
    readFile('SECURITY_HARNESS.md', 'utf8')
]);
const migration = `${baseMigration}\n${activityMigration}`;

const functionSource = (name) => {
    const start = migration.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    assert.ok(start >= 0, `${name} 함수가 없습니다.`);
    const next = migration.indexOf('\nCREATE OR REPLACE FUNCTION public.', start + 1);
    return migration.slice(start, next < 0 ? migration.length : next);
};

test('한 학생은 한 글에 줄바꿈 없는 댓글 하나만 저장하고 자기 댓글만 고치거나 삭제한다', () => {
    const comment = functionSource('save_neighbor_comment_v1');
    assert.match(migration, /UNIQUE \(shared_post_id, student_id\)/);
    assert.match(migration, /char_length\(btrim\(content\)\) BETWEEN 1 AND 300/);
    assert.match(migration, /content !~ E'\[\\\\r\\\\n\]'/);
    assert.match(comment, /comment\.student_id = v_student_id/);
    assert.match(comment, /p_action NOT IN \('save', 'delete'\)/);
    assert.match(comment, /v_comment\.status = 'hidden'/);
    assert.match(comment, /SET content = '', status = 'deleted'/);
    assert.doesNotMatch(comment, /p_student_id|p_class_id|p_comment_id/);
});

test('공감과 간직하기는 학생·공개 글을 다시 확인하는 한 번의 토글 RPC만 사용한다', () => {
    const access = functionSource('assert_neighbor_student_post_access_v1');
    const reaction = functionSource('toggle_neighbor_reaction_v1');
    const saved = functionSource('toggle_neighbor_save_v1');
    assert.match(access, /assert_neighbor_student_access_v1\(p_space_id\)/);
    assert.match(access, /shared\.status = 'published'/);
    assert.match(access, /post\.is_submitted IS TRUE/);
    assert.match(reaction, /reaction_type', 'empathy'/);
    assert.match(reaction, /DELETE FROM public\.neighbor_reactions/);
    assert.match(saved, /v_owner_student_id = v_student_id/);
    assert.match(saved, /DELETE FROM public\.neighbor_saves/);
    assert.doesNotMatch(`${commentSafe(reaction)}\n${commentSafe(saved)}`, /point_engine|point_logs|increment_student_points/);
});

test('상세는 보이는 댓글 최대 100개와 현재 합계·내 상태만 등록 이름으로 반환한다', () => {
    const detail = functionSource('get_neighbor_shared_post_v1');
    assert.match(detail, /comment\.status = 'visible'/);
    assert.match(detail, /LIMIT 100/);
    assert.match(detail, /'comments_truncated', v_comment_count > 100/);
    assert.match(detail, /'reaction_count'/);
    assert.match(detail, /'my_reaction'/);
    assert.match(detail, /'my_saved'/);
    assert.match(detail, /JOIN public\.students comment_student/);
    assert.match(detail, /left\(btrim\(comment_student\.name\), 30\)/);
    assert.doesNotMatch(detail, /comment\.student_id'|comment\.class_id'/);
});

test('학생 화면은 쓰기 RPC 응답으로 댓글·공감·간직하기를 갱신하고 추가 목록 재조회하지 않는다', () => {
    assert.equal((api.match(/supabase\.rpc\(/g) || []).length, 10);
    assert.match(api, /save_neighbor_comment_v1/);
    assert.match(api, /toggle_neighbor_reaction_v1/);
    assert.match(api, /toggle_neighbor_save_v1/);
    assert.match(entry, /setDetail\(\(current\) => \(\{ \.\.\.current, \.\.\.patch \}\)\)/);
    assert.match(entry, /comments: \[\.\.\.withoutMine, result\.comment\]/);
    assert.match(entry, /maxLength=\{300\}/);
    assert.match(entry, /한 글에 댓글 하나만 남길 수 있어요/);
    assert.match(entry, /detail\.is_mine/);
    assert.doesNotMatch(entry, /await openDetail|loadFirstPage\(\).*saveComment|setInterval|postgres_changes/);
});

test('교사 집계는 공개 댓글·공감만 네 참여 학급 이하로 묶고 학생 순위·포인트를 만들지 않는다', () => {
    const summary = functionSource('get_neighbor_teacher_post_engagement_v1');
    assert.match(summary, /assert_neighbor_participating_teacher_v1/);
    assert.match(summary, /comment\.status = 'visible'/);
    assert.match(summary, /membership\.status = 'active'/);
    assert.match(summary, /'class_name'/);
    assert.match(summary, /'visible_comment_count'/);
    assert.match(summary, /'reaction_count'/);
    assert.doesNotMatch(summary, /student_name|ranking|rank\(|point/);
    assert.match(manifest, /writes: 'rpc'/);
    assert.match(performance, /이웃 아지트.*댓글.*100/);
    assert.match(security, /이웃 아지트[\s\S]*한 줄 댓글/);
});

test('숨김·회수·종료 뒤 본문 차단과 상호작용 원장 보존은 실제 역할 스모크가 확인한다', () => {
    assert.match(smoke, /neighbor comment accepted a second physical row/);
    assert.match(smoke, /hidden neighbor comment remained in the student detail/);
    assert.match(smoke, /another class teacher restored the hidden comment/);
    assert.match(smoke, /own neighbor post was saved as an external reference/);
    assert.match(smoke, /neighbor interaction rows disappeared after source recall/);
    assert.match(smoke, /neighbor interaction rows disappeared after space close/);
});

function commentSafe(source) {
    return source.replace(/--.*$/gm, '');
}
