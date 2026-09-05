import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { classAgitRoute, normalizeClassAgitParams, getClassAgitBackDestination } from '../src/modules/class-agit/student/navigation.js';
import { assertStudentExhibitions, assertStudentRoom, assertStudentWork } from '../src/modules/class-agit/api/studentContract.js';
import { createClassAgitStudentFixture, studentExhibitionId as id } from '../src/dev/fixtures/classAgitStudentFixture.js';
import { getStudentBackDestination, createStudentHistoryState, readStudentHistoryParent, STUDENT_BOTTOM_NAV_TABS } from '../src/components/student/studentNavigation.js';

// eslint-disable-next-line security/detect-non-literal-fs-filename -- 저장소의 고정 경로와 manifest 목록만 읽는다.
const read = (file) => readFileSync(file, 'utf8');
const sql = read('supabase/migrations/20261241_class_agit_internal_publication.sql') + read('supabase/migrations/20261242_class_agit_120_works.sql') + read('supabase/migrations/20261243_class_agit_frozen_public_reads.sql');
const fn = (name) => sql.split(`CREATE OR REPLACE FUNCTION public.${name}(`).at(-1)?.split('$$;')[0] || '';

test('작품 → 같은 방/보기 → 로비 → 전시 목록 → 홈의 부모가 일정하다', () => {
    const work = classAgitRoute({ exhibitionId: id, mode: 'work', room: 5, view: 'list', workId: 'published-60', publicationNo: 9 });
    const room = classAgitRoute({ exhibitionId: id, mode: 'room', room: 5, view: 'list' });
    const lobby = classAgitRoute({ exhibitionId: id });
    assert.deepEqual(getStudentBackDestination(work), room);
    assert.deepEqual(getStudentBackDestination(room), lobby);
    assert.deepEqual(getStudentBackDestination(lobby), classAgitRoute());
    assert.deepEqual(getClassAgitBackDestination({}), { name: 'main', params: {} });
    const sibling = classAgitRoute({ ...room.params, room: 3 });
    const state = createStudentHistoryState(sibling.name, sibling.params, lobby);
    assert.deepEqual(readStudentHistoryParent(state), lobby);
    assert.equal(STUDENT_BOTTOM_NAV_TABS.length, 6);
});

test('기록은 전문·학급·학생 필드를 버리고 유효한 작은 주소만 남긴다', () => {
    assert.deepEqual(normalizeClassAgitParams(null), {});
    assert.deepEqual(normalizeClassAgitParams({ exhibitionId: '-'.repeat(36) }), {});
    assert.deepEqual(normalizeClassAgitParams({ exhibitionId: id, mode: 'work', workId: 'published-121', room: 11,
        publicationNo: 1, blocks: ['secret'], studentId: 'secret', classId: 'secret' }),
    { exhibitionId: id, mode: 'room', room: 1, view: 'room' });
    assert.equal(normalizeClassAgitParams({ exhibitionId: id, mode: 'work', workId: 'published-1', publicationNo: 0 }).mode, 'room');
});

test('0/1/12/60/120편은 방당 12편 요약과 선택한 전문 1편으로 읽는다', async () => {
    for (const count of [0, 1, 12, 60, 120]) {
        const { api } = createClassAgitStudentFixture(count);
        const list = await api.getExhibitions();
        assert.equal(list.exhibitions.length, count ? 1 : 0);
        const lobby = await api.getRoom(id, 0);
        assert.equal(lobby.items.length, 0);
        assert.equal(lobby.rooms.length, Math.ceil(count / 12));
        let seen = 0;
        for (const room of lobby.rooms) {
            const page = await api.getRoom(id, room.number);
            seen += page.items.length;
            assert.ok(page.items.length <= 12);
            assert.ok(page.items.every((item) => !Object.hasOwn(item, 'blocks')));
            const work = await api.getWork(id, 1, page.items[0].id);
            assert.ok(work.work.blocks.length > 0);
        }
        assert.equal(seen, count);
    }
});

test('응답의 내부 필드·전문 선조회·다른 판·중복·과대한 방을 거부한다', async () => {
    const { api } = createClassAgitStudentFixture(12);
    const list = await api.getExhibitions();
    assert.equal(assertStudentExhibitions(list), list);
    assert.throws(() => assertStudentExhibitions({ ...list, exhibitions: Array(21).fill(list.exhibitions[0]) }));
    assert.throws(() => assertStudentExhibitions({ ...list, students: ['private'] }));
    const page = await api.getRoom(id, 1);
    for (const invalid of [
        { ...page, items: [{ ...page.items[0], blocks: ['leak'] }, ...page.items.slice(1)] },
        { ...page, items: [{ ...page.items[0], studentId: 'private' }, ...page.items.slice(1)] },
        { ...page, items: [page.items[1], ...page.items.slice(1)] },
        { ...page, items: page.items.slice(1) }, { ...page, total_count: 61 }, { ...page, raw_snapshot: {} },
    ]) assert.throws(() => assertStudentRoom(invalid, id, 1));
    assert.throws(() => assertStudentRoom(page, id, 2));
    assert.throws(() => assertStudentRoom(page, 'other-class-exhibition', 1));
    const detail = await api.getWork(id, 1, 'published-1');
    assert.throws(() => assertStudentWork(detail, 'published-2', 1));
    assert.throws(() => assertStudentWork(detail, 'published-1', 2));
    assert.throws(() => assertStudentWork({ ...detail, work: { ...detail.work, sourceId: 'private' } }, 'published-1', 1));
    assert.throws(() => assertStudentWork({ ...detail, work: { ...detail.work, blocks: ['가'.repeat(20001)] } }, 'published-1', 1));
    assertStudentWork({ ...detail, work: { ...detail.work, title: '🌱'.repeat(200), blocks: ['🌱'.repeat(20000)] } }, 'published-1', 1);
});

test('철회·판 갱신·조회 실패 후 예전 전문을 응답으로 재사용하지 않는다', async () => {
    const { api, controls } = createClassAgitStudentFixture(12);
    await api.getWork(id, 1, 'published-1');
    controls.withdrawFirst();
    await assert.rejects(api.getWork(id, 1, 'published-1'), /지금 읽을 수/);
    const room = await api.getRoom(id, 1);
    assert.equal(room.total_count, 11);
    assert.equal(room.items[0].id, 'published-2');
    controls.republish();
    await assert.rejects(api.getWork(id, 1, 'published-2'), /전시가 새로/);
    controls.failNext();
    await assert.rejects(api.getWork(id, 2, 'published-2'), /불러오지 못/);
    assert.equal((await api.getWork(id, 2, 'published-2')).work.id, 'published-2');
    controls.close();
    await assert.rejects(api.getRoom(id, 1), /볼 수 없/);
});

test('학급 초기 메뉴는 공용 매니페스트를 쓰고 설정된 서버 목록을 덮지 않는다', () => {
    // 새 legacy flag가 생기면 서버 작업공간 필드도 함께 갱신해야 한다.
    const fields = readdirSync('src/modules', { recursive: true }).filter((file) => file.endsWith('manifest.js'))
        .flatMap((file) => [...read(`src/modules/${file}`).matchAll(/legacyFlag:\s*'([^']+)'/g)].map((match) => match[1]));
    assert.deepEqual(fields, ['vocab_tower_enabled']);
    for (const field of fields) assert.ok(fn('get_class_agit_workspace_v1').includes(`'${field}'`));
    assert.match(read('src/modules/class-agit/teacher/TeacherEntry.jsx'), /resolveEnabledModuleIds\(workspace\.class\.enabled_modules, workspace\.class\)/);
    assert.match(fn('run_class_agit_action_v1'), /COALESCE\(cardinality\(v_modules\),0\)=0 THEN/);
    assert.match(fn('run_class_agit_action_v1'), /initial_vocab_tower_enabled'\)::BOOLEAN IS DISTINCT FROM v_legacy_enabled/);
});

test('학생 RPC는 현재 실제 학생 학급·공개 상태·판을 재검증하고 요약과 전문을 분리한다', () => {
    const reader = fn('class_agit_reader_class_v1');
    assert.match(reader, /s\.auth_id=auth\.uid\(\)/);
    assert.match(reader, /s\.is_active IS DISTINCT FROM FALSE AND s\.deleted_at IS NULL/);
    assert.match(fn('class_agit_class_is_open_v1'), /class_agit_class_is_allowed_v1\(p_class_id\)/);
    assert.match(fn('class_agit_class_is_allowed_v1'), /p\.is_approved IS TRUE/);
    assert.match(fn('get_my_class_agit_exhibitions_v1'), /e\.class_id=v_class AND e\.state='published'.*LIMIT 20/);
    const room = fn('get_my_class_agit_room_v1');
    assert.match(room, /c.class_id=v_class AND c.exhibition_id=p_exhibition_id AND c.scope='class' AND e.state='published'/);
    assert.match(room, /STABLE SECURITY DEFINER/);
    assert.doesNotMatch(room, /'blocks'|'studentId'|'sourceId'/);
    assert.match(room, /s.room_no=p_room/);
    assert.match(room, /LIMIT 12/);
    assert.match(fn('get_my_class_agit_work_v1'), /p_publication_no IS DISTINCT FROM v_catalog\.publication_no/);
    assert.match(sql, /DROP FUNCTION IF EXISTS public.class_agit_visible_works_v1/);
    assert.match(fn('class_agit_sync_published_consent_v1'), /n.consent_id IS DISTINCT FROM p.consent_id/);
    const api = read('src/modules/class-agit/api/studentApi.js');
    assert.equal((api.match(/call\('get_my_class_agit_/g) || []).length, 3);
    assert.doesNotMatch(api, /p_class_id|p_student_id|\.from\(|dataCache|setInterval|\.channel\(/);
});

test('홈은 기존 bootstrap의 존재 신호만 받고 상세는 지연 로딩하며 닫힌 요청을 무시한다', () => {
    const bootstrap = fn('get_student_home_bootstrap_v1');
    assert.match(bootstrap, /get_student_home_bootstrap_core_20261199/);
    assert.match(bootstrap, /'neighbor_agit_available'/);
    const addition = bootstrap.split("'class_agit_available'")[1];
    assert.match(addition, /EXISTS/);
    assert.doesNotMatch(addition, /class_agit_visible_works|published_snapshot|class_agit_items/);
    const app = read('src/App.jsx');
    assert.match(app, /lazy\(getModule\('class-agit'\)\.studentEntry\)/);
    assert.match(app, /studentHomeBootstrap\?\.home\?\.class_agit_available === true/);
    assert.match(app, /preserveParent: true/);
    const hook = read('src/modules/class-agit/student/useGalleryRead.js');
    assert.match(hook, /return \(\) => \{ active = false; \}/);
    assert.match(hook, /data: null, loading: false, error:/);
    assert.match(hook, /state\.request === request/);
    const guide = read('src/components/student/StudentGuideModal.jsx');
    assert.match(guide, /visibilityKey/);
    assert.match(guide, /enabledModules/);
});
