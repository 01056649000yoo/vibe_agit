import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLASS_AGIT_LIMITS, CLASS_AGIT_LIMITS as limits, isClassAgitChapterId, isClassAgitWorkId } from '../src/modules/class-agit/policy.js';
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

test('상한 숫자는 policy.js 한 곳에서만 나온다', () => {
    // 2026-09-07 코드 점검: 문집 100편이 정규식 두 개를 포함해 다섯 곳에 흩어져 있었다.
    // policy.js 만 올리면 101번째부터 학생 화면이 조용히 되돌아가고 원인이 어디에도 남지 않았다.
    const files = [
        ['anthology/studentContract.js', readFileSync('src/modules/class-agit/anthology/studentContract.js', 'utf8')],
        ['anthology/contract.js', readFileSync('src/modules/class-agit/anthology/contract.js', 'utf8')],
        ['api/contract.js', readFileSync('src/modules/class-agit/api/contract.js', 'utf8')],
        ['student/navigation.js', readFileSync('src/modules/class-agit/student/navigation.js', 'utf8')],
        ['selection/OrderList.jsx', readFileSync('src/modules/class-agit/selection/OrderList.jsx', 'utf8')],
    ];
    for (const [name, source] of files) {
        const stripped = source.replace(/\/\/[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
        // policy.js 에 정본이 있는 상한(문집 100편·전시 120편)만 본다.
        // 문집 권수·판 수의 20 처럼 정본이 따로 없는 값은 대상이 아니다.
        assert.doesNotMatch(stripped, /length\s*>\s*(100|120)\b/, `${name} 에 상한 숫자가 박혀 있습니다.`);
        assert.doesNotMatch(stripped, /chapter-\(\[1-9\]/, `${name} 에 문집 차례 정규식이 박혀 있습니다.`);
        assert.doesNotMatch(stripped, /\/20편|\/100편|\/120편/, `${name} 에 정원 문구가 박혀 있습니다.`);
    }
    // 정본이 실제로 상한을 따르는지 본다.
    assert.equal(isClassAgitChapterId(`chapter-${CLASS_AGIT_LIMITS.anthologyWorks}`), true);
    assert.equal(isClassAgitChapterId(`chapter-${CLASS_AGIT_LIMITS.anthologyWorks + 1}`), false);
    assert.equal(isClassAgitChapterId('chapter-0'), false);
    assert.equal(isClassAgitChapterId('chapter-01'), false);
    assert.equal(isClassAgitChapterId(' chapter-1'), false);
});
test('외부 공유 30일 상한은 화면 상수와 SQL 이 같은 값에서 나온다', () => {
    // 전에는 검사가 화면 쪽 자기참조와 SQL 의 '720 hours' 를 따로 봐서, 상수만 올리면
    // 둘 다 통과한 채 화면이 허락한 날짜를 서버가 거절했다.
    const sql = readFileSync('supabase/migrations/20261243_class_agit_frozen_public_reads.sql', 'utf8');
    assert.ok(sql.includes(`INTERVAL '${CLASS_AGIT_LIMITS.externalExpiryDays * 24} hours'`),
        `SQL 의 기간 상한이 externalExpiryDays(${CLASS_AGIT_LIMITS.externalExpiryDays}일)와 다릅니다.`);
});
