import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLASS_AGIT_LIMITS as limits, isClassAgitWorkId } from '../src/modules/class-agit/policy.js';
import { assertClassAgitWorkspace, assertClassAgitShareWorkspace, buildClassAgitSavePayload } from '../src/modules/class-agit/api/contract.js';
import { assertStudentRoom, assertStudentWork } from '../src/modules/class-agit/api/studentContract.js';
import { assertPublicGalleryResponse } from '../src/modules/class-agit/public/publicApi.js';
import { normalizeClassAgitParams, getClassAgitBackDestination } from '../src/modules/class-agit/student/navigation.js';
import { createPreviewDraft, previewClass } from '../src/dev/fixtures/classAgitFixtures.js';
import { createClassAgitStudentFixture, studentExhibitionId as id } from '../src/dev/fixtures/classAgitStudentFixture.js';

const sql = readFileSync('supabase/migrations/20261242_class_agit_120_works.sql', 'utf8');
const fn = (name) => sql.split(`CREATE OR REPLACE FUNCTION public.${name}(`)[1]?.split('$$;')[0] || '';

test('화면·DB 정본이 120편/10실로 일치하고 목록·문집 상한은 독립적으로 유지된다', () => {
    assert.equal(limits.maxWorks, 120);
    assert.equal(limits.worksPerRoom, 20);
    assert.equal(limits.maxRooms, 10);
    assert.equal(limits.maxCandidates, 100);
    assert.equal(limits.anthologyWorks, 100);
    assert.equal(Number(fn('class_agit_max_works_v1').match(/SELECT (\d+);/)[1]), limits.maxWorks);
    assert.equal((sql.match(/CHECK\(position BETWEEN 1 AND public.class_agit_max_works_v1\(\)\)/g) || []).length, 2);
    assert.match(sql, /octet_length\(published_snapshot::TEXT\) <= public.class_agit_max_works_v1\(\)\*100000\+500000/);
    for (const name of ['class_agit_max_works_v1()', 'class_agit_valid_work_id_v1(TEXT)']) {
        assert.ok(sql.includes(`REVOKE ALL ON FUNCTION public.${name} FROM PUBLIC,anon,authenticated,service_role;`));
        assert.ok(!sql.includes(`GRANT EXECUTE ON FUNCTION public.${name}`));
    }
});

test('저장·학급 공개·학생·외부 공유의 9개 서버 경로를 같은 검사에서 점검한다', () => {
    for (const name of ['get_class_agit_workspace_v1', 'run_class_agit_action_v1', 'get_class_agit_publication_v1',
        'class_agit_visible_works_v1', 'get_my_class_agit_room_v1', 'get_class_agit_share_workspace_v1',
        'run_class_agit_share_action_v1', 'read_public_class_agit_v1']) {
        assert.match(fn(name), /public.class_agit_max_works_v1\(\)/, name);
        assert.doesNotMatch(fn(name), /LIMIT 60\b|BETWEEN [01] AND (?:5|60)\b|> 60\b/, name);
    }
    for (const name of ['get_my_class_agit_work_v1', 'read_public_class_agit_v1']) {
        assert.match(fn(name), /NOT public.class_agit_valid_work_id_v1\(p_work_id\)/, name);
    }
    for (const name of ['run_class_agit_action_v1', 'run_class_agit_share_action_v1']) {
        assert.match(fn(name), /octet_length\(p_payload::TEXT\)\s*>\s*public.class_agit_max_works_v1\(\)\*500/, name);
        assert.match(fn(name), /assert_class_agit_manager_v1\(p_class_id\)/, name);
    }
    assert.match(fn('class_agit_valid_work_id_v1'), /BETWEEN 1 AND public.class_agit_max_works_v1\(\)/);
});

test('120편 초안과 외부 공유 응답은 허용하고 121편은 거부한다', () => {
    const draft = createPreviewDraft(120);
    const workspace = { version: 1, class: { id: previewClass.id }, projects: [], students: [], draft };
    assert.equal(assertClassAgitWorkspace(workspace, previewClass.id), workspace);
    assert.equal(buildClassAgitSavePayload(draft, 1).items.length, 120);
    assert.throws(() => assertClassAgitWorkspace({ ...workspace, draft: { ...draft, items: [...draft.items, draft.items[0]] } }, previewClass.id));
    const share = { version: 1, candidates: draft.items, published_items: draft.items };
    assert.equal(assertClassAgitShareWorkspace(share), share);
    assert.throws(() => assertClassAgitShareWorkspace({ ...share, candidates: [...draft.items, draft.items[0]] }));
    assert.throws(() => assertClassAgitShareWorkspace({ ...share, published_items: [...draft.items, draft.items[0]] }));
});

test('61·100·120번 작품과 10실 주소를 보존하며 잘못된 번호는 거부한다', () => {
    for (const number of [1, 60, 61, 99, 100, 119, 120]) {
        const route = { exhibitionId: id, mode: 'work', room: Math.ceil(number / 12), view: 'list', workId: `published-${number}`, publicationNo: 1 };
        assert.ok(isClassAgitWorkId(route.workId));
        assert.deepEqual(normalizeClassAgitParams(route), route);
        assert.equal(getClassAgitBackDestination(route).params.room, route.room);
    }
    for (const invalid of [null, 120, 'published-0', 'published-01', 'published-121', 'published-1000', 'published--1', 'published-120 ', 'published-120\n']) {
        assert.equal(isClassAgitWorkId(invalid), false, String(invalid));
    }
    assert.equal(normalizeClassAgitParams({ exhibitionId: id, mode: 'room', room: 11 }).room, 1);
});

test('학생·외부 방문자는 10실의 12편 요약과 120번째 전문을 읽는다', async () => {
    const { api } = createClassAgitStudentFixture(120);
    const room = await api.getRoom(id, 10);
    assert.equal(room.total_count, 120);
    assert.equal(room.rooms.length, 10);
    assert.equal(room.items.length, 12);
    assert.equal(room.items.at(-1).id, 'published-120');
    assert.ok(room.items.every((item) => !Object.hasOwn(item, 'blocks')));
    const work = await api.getWork(id, 1, 'published-120');
    assert.equal(work.previous_id, 'published-119');
    assert.equal(work.next_id, null);
    assert.ok(work.work.blocks.length);
    const { exhibition_id: _id, ...publicRoom } = room;
    const external = { ...publicRoom, work: null };
    assert.equal(assertPublicGalleryResponse(external, 10), external);
    const externalWork = { ...external, items: [], work: work.work };
    assert.equal(assertPublicGalleryResponse(externalWork, 10, 'published-120', 1), externalWork);
    assert.throws(() => assertStudentRoom({ ...room, total_count: 121 }, id, 10));
    assert.throws(() => assertStudentRoom({ ...room, items: [...room.items, room.items[0]] }, id, 10));
    assert.throws(() => assertStudentWork({ ...work, next_id: 'published-121' }, 'published-120', 1));
    assert.throws(() => assertPublicGalleryResponse({ ...external, total_count: 121 }, 10));
});
