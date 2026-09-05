import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertClassAgitWorkspace, buildClassAgitSavePayload } from '../src/modules/class-agit/api/contract.js';
import { createExhibitionDraft, editExhibition } from '../src/modules/class-agit/exhibitionDraft.js';
import { getSourceExclusion, presentSource } from '../src/modules/class-agit/sourceContract.js';

const sql = readFileSync('supabase/migrations/20261241_class_agit_internal_publication.sql', 'utf8');
const smoke = readFileSync('tests/sql/20261241_class_agit_internal_publication.smoke.sql', 'utf8');
const source = { id: 'source', class_id: 'class', student_id: 'student', student_name: '학생', title: '작품', content: '첫 문단\n\n다음 문단',
    source_revision: 'old', writing_context: 'assignment', visibility: 'class', is_submitted: true, is_confirmed: true, input_template: 'freeform' };
const initial = () => ({ ...editExhibition(createExhibitionDraft('class'), { type: 'add', source }), id: 'exhibition' });

test('저장 요청은 원문과 개인정보·권한 필드를 보내지 않고 서버 revision만 사용한다', () => {
    const draft = initial();
    const payload = buildClassAgitSavePayload({ ...draft, revision: 999, state: 'published' }, 7);
    assert.deepEqual(payload, { exhibition_id: 'exhibition', expected_revision: 7, title: draft.title, introduction: draft.introduction, theme: 'garden',
        items: [{ sourceId: 'source', sourceRevision: 'old', publicAlias: '새싹 작가 01' }] });
    assert.doesNotMatch(JSON.stringify(payload), /student|authorName|blocks|published|999|첫 문단/);
    draft.items[0].scopes.class = false;
    assert.equal('classAcknowledged' in buildClassAgitSavePayload(draft, 7).items[0], false);
});

test('다른 학급·과대한 작업공간 응답을 화면에 섞지 않는다', () => {
    const workspace = { version: 1, class: { id: 'class' }, projects: [], students: [], draft: initial() };
    assert.equal(assertClassAgitWorkspace(workspace, 'class'), workspace);
    for (const invalid of [{ ...workspace, version: 2 }, { ...workspace, class: { id: 'other' } },
        { ...workspace, projects: Array(21) }, { ...workspace, students: Array(101) },
        { ...workspace, draft: { ...workspace.draft, classId: 'other' } }, { ...workspace, draft: { ...workspace.draft, items: Array(121) } }]) {
        assert.throws(() => assertClassAgitWorkspace(invalid, 'class'), /응답/);
    }
});

test('실제 freeform 과제와 재확인은 본문·버전·철회 상태를 함께 갱신한다', () => {
    assert.equal(getSourceExclusion(source, 'class'), '');
    assert.deepEqual(presentSource({ ...source, content: '  첫 문단  \r\n\r\n 다음 문단  ' }).blocks, ['첫 문단', '다음 문단']);
    const draft = initial();
    draft.items[0] = { ...draft.items[0], itemId: 'item', sourceChanged: true, unavailable: true, revoked: true, scopes: { class: false, anthology: false, external: false } };
    const change = { type: 'refresh', source: { ...source, source_revision: 'new', content: '새 본문' } };
    const refreshed = editExhibition(draft, change);
    assert.equal(refreshed.items[0].sourceRevision, 'new');
    assert.deepEqual(refreshed.items[0].blocks, ['새 본문']);
    assert.equal(refreshed.items[0].itemId, 'item');
    assert.equal(refreshed.items[0].revoked, false);
    assert.equal(refreshed.items[0].scopes.class, true);
    assert.equal(draft.items[0].revoked, true);
});

test('원글이 삭제되어 sourceId가 같은 null이어도 지정 작품 하나만 옮기고 뺀다', () => {
    const draft = { ...initial(), items: ['a', 'b', 'c'].map((itemId) => ({ ...initial().items[0], itemId, sourceId: null })) };
    const moved = editExhibition(draft, { type: 'move', sourceId: null, itemId: 'b', direction: 1 });
    assert.deepEqual(moved.items.map((item) => item.itemId), ['a', 'c', 'b']);
    assert.deepEqual(editExhibition(moved, { type: 'remove', sourceId: null, itemId: 'c' }).items.map((item) => item.itemId), ['a', 'b']);
});

test('C1은 기본 OFF·DB 관리자 본인 학급·권한 닫힌 표와 전용 RPC로 제한한다', () => {
    assert.match(sql, /r\.mode='internal' AND p\.role='ADMIN'/);
    assert.match(sql, /p\.is_approved IS TRUE/);
    assert.match(sql, /class_agit_class_is_allowed_v1\(c\.id\)/);
    assert.match(sql, /c\.teacher_id\s*=\s*auth\.uid\(\)/);
    assert.match(sql, /r\.mode='pilot'.*p\.role IN/);
    assert.doesNotMatch(sql, /app_metadata/);
    for (const table of ['class_agit_rollout', 'class_agit_exhibitions', 'class_agit_items', 'class_agit_consent_events']) {
        assert.ok(sql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`));
    }
    assert.match(sql, /class_agit_consent_events FROM PUBLIC, anon, authenticated, service_role/);
    assert.match(sql, /FOREIGN KEY\(class_id, post_id\) REFERENCES public\.student_posts\(class_id, id\)/);
    assert.match(sql, /p\.class_id = p_class_id AND p\.id = p_post_id/);
    assert.match(sql, /s\.id = p\.student_id AND s\.class_id = p\.class_id/);
    assert.match(sql, /m\.id = p\.mission_id AND m\.class_id = p\.class_id/);
});

test('서버 정본·원글 잠금·수록 확인·판 고정·철회 세대가 같은 저장 계약을 지킨다', () => {
    assert.match(sql, /v_item->>'sourceRevision' IS DISTINCT FROM v_data->>'source_revision'/);
    assert.match(sql, /v_item->'classAcknowledged' IS DISTINCT FROM 'true'::JSONB/);
    assert.match(sql, /ORDER BY p\.id FOR SHARE/);
    assert.match(sql, /expected_revision'\)::INTEGER IS DISTINCT FROM v_ex\.revision/);
    assert.match(sql, /jsonb_array_length\(p_payload->'items'\) > 60/);
    assert.match(sql, /ORDER BY p\.updated_at DESC,p\.id DESC LIMIT v_limit \+ 1/);
    assert.match(sql, /n BETWEEN \(p_room-1\)\*12\+1 AND p_room\*12/);
    assert.match(sql, /i\.consent_id=\(w\.value->>'consentId'\)::UUID/);
    assert.match(sql, /consent_id=CASE WHEN v_existing\.revoked_at IS NOT NULL THEN gen_random_uuid\(\)/);
    assert.match(sql, /class_agit_post_revoke BEFORE DELETE OR UPDATE OF/);
    assert.match(sql, /class_agit_student_revoke BEFORE DELETE OR UPDATE OF/);
    assert.match(smoke, /server trusted client content/);
    assert.match(smoke, /reconfirmation revived old publication/);
    assert.match(smoke, /source recall did not revoke/);
    assert.match(smoke, /cross-class student read/);
});

test('화면 충돌은 편집을 보존하고 공개판 이동·재조회에서 암묵적으로 버리지 않는다', () => {
    const editor = readFileSync('src/modules/class-agit/teacher/ExhibitionWorkbench.jsx', 'utf8');
    const host = readFileSync('src/modules/class-agit/teacher/TeacherEntry.jsx', 'utf8');
    const reader = readFileSync('src/modules/class-agit/teacher/PublishedExhibition.jsx', 'utf8');
    assert.match(editor, /disabled=\{dirty\} onClick=\{\(\) => setPreviewMode\('published'\)\}/);
    assert.match(editor, /persistence\.save\(draft, savedDraft\.revision\)/);
    assert.match(editor, /if \(!dirty \|\| await ask/);
    assert.match(editor, /current = await saveDraft\(\); if \(!current\) return/);
    assert.match(editor, /hidden=\{step !== 'share'\}/);
    assert.match(editor, /shareState\.dirty \|\| shareState\.hasLink/);
    for (const step of ['settings', 'works', 'preview', 'share']) assert(editor.includes(`id: '${step}'`));
    assert.match(editor, /role="tablist" aria-label="전시 준비 단계"/);
    assert.match(host, /renderShare:[\s\S]*embedded onStateChange=/);
    assert.match(host, /!workspace\?\.draft && <Button/);
    assert.match(reader, /setPage\(null\); setError\(reason\.message\)/);
    assert.match(readFileSync('src/components/teacher/TeacherDashboard.jsx', 'utf8'), /TeacherClassAgitHub activeClass=\{activeClass\} allowInternal=\{isAdmin\}/);
});
