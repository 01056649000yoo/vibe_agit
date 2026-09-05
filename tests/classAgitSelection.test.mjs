import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addExhibitionSources, toggleSelection, moveSelected, sortSelectedWorks, replaceDraftItems, workKey } from '../src/modules/class-agit/selection/model.js';
import { createExhibitionDraft } from '../src/modules/class-agit/exhibitionDraft.js';
import { previewClass, previewSources, createPreviewDraft } from '../src/dev/fixtures/classAgitFixtures.js';
import { selectionMissions, selectionSources, createClassAgitSelectionFixture } from '../src/dev/fixtures/classAgitSelectionFixture.js';
import { CLASS_AGIT_LIMITS as limits } from '../src/modules/class-agit/policy.js';

// Test-only paths are literal callers below, never user input.
// eslint-disable-next-line security/detect-non-literal-fs-filename
const read = (path) => readFileSync(path, 'utf8');
const sql = read('supabase/migrations/20261244_class_agit_mission_selection.sql');
const fn = (name) => sql.split(`CREATE OR REPLACE FUNCTION public.${name}(`)[1]?.split('$$;')[0] || '';

test('여러 미션에서 선택한 순서를 유지하며 일괄 검토·잔여 용량 상한을 지킨다', () => {
    let selection = [];
    for (const source of selectionSources.slice(0, 50)) selection = toggleSelection(selection, source, 120);
    assert.equal(selection.length, limits.selectionBatch);
    assert.throws(() => toggleSelection(selection, selectionSources[51], 120), /50편/);
    const reduced = toggleSelection(selection, selectionSources[0], 120);
    assert.deepEqual(reduced.map((item) => item.id), selection.slice(1).map((item) => item.id));
    assert.throws(() => toggleSelection(selection.slice(0, 2), selectionSources[3], 2), /2편/);
    assert.equal(selection.length, 50);
});

test('일괄 담기는 기존 순서·별도 동의를 보존하고 실패한 묶음을 부분 적용하지 않는다', () => {
    const initial = createPreviewDraft(12);
    const next = addExhibitionSources(initial, previewSources.slice(12, 42));
    assert.deepEqual(next.items.slice(0, 12), initial.items);
    assert.deepEqual(next.items.slice(12).map((item) => item.sourceId), previewSources.slice(12, 42).map((item) => item.id));
    assert(next.items.every((item) => item.scopes.class && !item.scopes.external && !item.scopes.anthology));
    assert.equal(next.items.at(-1).missionId, previewSources[41].mission_id);
    for (const invalid of [[previewSources[12], { ...previewSources[13], is_submitted: false }], [previewSources[12], previewSources[0]], previewSources.slice(0, 51)]) {
        assert.throws(() => addExhibitionSources(initial, invalid));
        assert.equal(initial.items.length, 12);
    }
    assert.throws(() => addExhibitionSources(createPreviewDraft(119), previewSources.slice(119, 121)), /120편/);
});

test('120편 중 30편 이동은 선택 그룹 내부 순서·나머지 순서·열 개 방을 보존한다', () => {
    const original = createPreviewDraft(120).items;
    const selected = original.filter((_, index) => index % 4 === 0).map(workKey);
    const next = moveSelected(original, selected, 25);
    assert.equal(next.length, 120); assert.equal(new Set(next.map(workKey)).size, 120);
    assert.deepEqual(next.slice(24, 54).map(workKey), selected);
    assert.deepEqual(next.filter((item) => !selected.includes(workKey(item))), original.filter((item) => !selected.includes(workKey(item))));
    assert.equal(Math.ceil(next.length / limits.worksPerRoom), 10);
    assert.deepEqual(moveSelected(original, selected, 120).slice(-30).map(workKey), selected);
    assert.deepEqual(moveSelected(original, selected, 1).slice(0, 30).map(workKey), selected);
    assert.throws(() => moveSelected(original, selected, 0));
    assert.throws(() => moveSelected(original, selected, 121));
});

test('원글 삭제 항목도 itemId로 독립 이동·제거하며 잘못된 순서를 거부한다', () => {
    const draft = { ...createExhibitionDraft(previewClass.id), items: ['a', 'b', 'c'].map((itemId) => ({ itemId, sourceId: null })) };
    const moved = moveSelected(draft.items, ['b'], 1);
    assert.deepEqual(moved.map(workKey), ['b', 'a', 'c']);
    assert.deepEqual(replaceDraftItems(draft, moved.slice(0, 2)).items.map(workKey), ['b', 'a']);
    assert.throws(() => replaceDraftItems(draft, [moved[0], moved[0]]));
    assert.throws(() => replaceDraftItems(draft, [{ itemId: 'foreign' }]));
});

test('명시적 미션·학생 정렬 후 담은 순서 복원이 기존 작품을 바꾸지 않는다', () => {
    const items = createPreviewDraft(30).items; const added = items.map(workKey);
    const sorted = sortSelectedWorks(items, 'mission', added);
    assert.deepEqual(sortSelectedWorks(sorted, 'added', added), items);
    assert.deepEqual(sortSelectedWorks(items, 'student', added).map((item) => item.authorName), items.map((item) => item.authorName).sort((a, b) => a.localeCompare(b, 'ko')));
    assert.deepEqual(items.map(workKey), added);
});

test('대량 시안은 실제 미션 목록을 별도로 제공하고 빈·보관·미지원 미션도 찾는다', async () => {
    const { api } = await createClassAgitSelectionFixture(); const classId = previewClass.id;
    assert.equal(selectionMissions.length, 66); assert.equal(selectionSources.length, 1040);
    const first = await api.getMissions(classId); assert.equal(first.items.length, 50);
    const last = await api.getMissions(classId, { cursor: first.next_cursor }); assert.equal(last.items.length, 16);
    assert.equal(last.items.at(-1).review_count, 0); assert.equal(last.items.at(-2).supported, false);
    assert.equal((await api.getMissions(classId, { query: '66', scope: 'archived' })).items.length, 1);
    const old = await api.getCandidates(classId, { mission_id: selectionMissions[60].id, sort: 'student' });
    assert.equal(old.items.length, 16); assert(!JSON.stringify(old).includes('source_revision'));
    assert.equal((await api.getCandidates(classId, { query: '61 새로운 시작 · 1번째' })).items.length, 1);
    const page = await api.getCandidates(classId); const next = await api.getCandidates(classId, { cursor: page.next_cursor });
    assert(!next.items.some((item) => page.items.some((row) => row.id === item.id)));
});

test('묶음 검토 실패는 이유와 원래 선택 순서를 돌려주며 잘못된 ID는 본문을 받지 못한다', async () => {
    const { api } = await createClassAgitSelectionFixture(); const ids = [selectionSources[1].id, 'unknown', selectionSources[0].id];
    const result = await api.getSources(previewClass.id, ids);
    assert.deepEqual(result.map((item) => item.id), ids);
    assert.equal(result[1].source, null); assert(result[1].reason);
    assert.equal(result[2].source.id, ids[2]);
    await assert.rejects(api.getSources(previewClass.id, Array(51).fill('x')));
});

test('새 RPC들은 담당 교사 범위·상한·안정 커서를 갖고 구형 RPC를 같은 SQL에서 닫는다', () => {
    for (const name of ['get_class_agit_missions_v1', 'get_class_agit_candidates_v2', 'get_class_agit_sources_v1']) {
        assert.match(fn(name), /assert_class_agit_manager_v1\(p_class_id\)/);
        assert.match(fn(name), /statement_timeout='3s'/);
        assert(sql.split(`REVOKE ALL ON FUNCTION public.${name}(`)[1].split(';')[0].includes('FROM PUBLIC,anon,authenticated,service_role'));
    }
    assert.match(sql, /DROP FUNCTION IF EXISTS public.get_class_agit_candidates_v1/);
    assert.match(fn('get_class_agit_candidates_v2'), /p\.class_id=p_class_id/);
    assert.match(fn('get_class_agit_candidates_v2'), /m\.class_id=p\.class_id/);
    assert.match(fn('get_class_agit_candidates_v2'), /s\.class_id=p\.class_id/);
    for (const name of ['get_class_agit_missions_v1', 'get_class_agit_candidates_v2']) {
        assert.doesNotMatch(fn(name), /class_agit_source_data|class_agit_current_source|digest\(/);
        assert.match(fn(name), /LIMIT v_limit\+1/);
    }
    assert(fn('get_class_agit_sources_v1').includes(`NOT BETWEEN 1 AND ${limits.selectionBatch}`));
    assert(fn('get_class_agit_candidates_v2').includes(`INTEGER,${limits.candidatePage})`));
    assert(fn('get_class_agit_missions_v1').includes(`DEFAULT ${limits.missionPage}`));
    assert.match(fn('get_class_agit_sources_v1'), /WITH checked AS MATERIALIZED/);
    assert.match(fn('get_class_agit_sources_v1'), /ORDER BY n/);
});

test('전시·문집은 공용 탐색을 사용하고 열기 전 조회·영구 저장·N+1 검증을 추가하지 않는다', () => {
    const host = read('src/modules/class-agit/teacher/TeacherEntry.jsx');
    const workbench = read('src/modules/class-agit/teacher/ExhibitionWorkbench.jsx');
    const browser = read('src/modules/class-agit/selection/SourceBrowser.jsx');
    const api = read('src/modules/class-agit/api/classAgitApi.js');
    assert.doesNotMatch(host, /getCandidates/);
    assert.match(host, /key=\{props.activeClass.id\}/);
    assert.match(workbench, /worksVisited && <SelectionWorkspace/);
    assert.match(read('src/modules/class-agit/anthology/SourcePicker.jsx'), /SourceBrowser[\s\S]*maximum=\{limits.anthologyWorks\} scope="학급 문집"/);
    assert.match(browser, /api.getSources\(classId, pending.map/);
    assert.doesNotMatch(browser, /Promise.all|localStorage|setInterval|postgres_changes/);
    assert.match(api, /classKey\(classId/); assert.match(api, /dataCache.get/);
    assert.match(api, /if \(result.error\).*throw result.error/);
    const paging = read('src/modules/class-agit/selection/useBrowsePage.js');
    assert.match(paging, /serial.current === ticket/); assert.match(paging, /cursors.slice\(0, position.index \+ 1\)/);
});
