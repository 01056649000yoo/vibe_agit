import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dragonPlazaManifest } from '../src/modules/game/dragon-plaza/manifest.js';
import {
    buildSeats, deskColumns, describeVisitors, markPostSeen, NEW_POST_DAYS, pickNewPosts, readSeenPosts
} from '../src/modules/game/dragon-plaza/plazaModel.js';

// 우리반 수호룡 광장(2026-10-24): 교실 자리·책상 장식·새 글 표시·이번 주 방문자 칠판.
const row = (id, name, extra = {}) => ({ id, name, pet_data: { species: 'star', equippedDecor: {} }, writer_total_chars: 0, writer_completed_posts: 0, ...extra });
const memoryStorage = () => {
    const data = new Map();
    return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

const orderOf = async (path) => Number((await readFile(path, 'utf8')).match(/playground: \{[\s\S]*?order: (\d+)/)?.[1]);

test('모듈: 기본 켜짐, 놀이터에서 `나의 작가 수호룡` 바로 아래, 학생 입구와 교사 화면이 있다', async () => {
    assert.equal(dragonPlazaManifest.id, 'dragon-plaza');
    assert.equal(dragonPlazaManifest.name, '우리반 수호룡 광장');
    assert.equal(dragonPlazaManifest.defaultEnabled, true);
    assert.equal(dragonPlazaManifest.performance.realtime, 'none');
    // 놀이터 화면은 economy 가 earn/spend 인 카드만 그린다(`free` 로 두면 카드가 어디에도 안 나온다 — 2026-10-24 실제로 겪음)
    assert.ok(['earn', 'spend'].includes(dragonPlazaManifest.playground.economy));
    const { validateManifest } = await import('../src/modules/types.js');
    assert.deepEqual(validateManifest(dragonPlazaManifest), []);
    const dragonOrder = await orderOf('src/modules/game/dragon/manifest.js');
    const towerOrder = await orderOf('src/modules/game/vocab-tower/manifest.js');
    assert.ok(dragonPlazaManifest.playground.order > dragonOrder, '`나의 작가 수호룡` 아래여야 합니다.');
    assert.ok(dragonPlazaManifest.playground.order < towerOrder, '어휘의 탑보다 위여야 합니다.');
    assert.equal(typeof dragonPlazaManifest.studentEntry, 'function');
    assert.equal(typeof dragonPlazaManifest.teacherEntry, 'function');
});

test('자리: 이름 가나다순으로 고정, 내 자리도 그 순서 안에, 단계가 높을수록 드래곤이 달라진다', () => {
    const me = row('me', '나나', { writer_total_chars: 3600, writer_completed_posts: 7 });
    const seats = buildSeats([row('b', '하준'), row('a', '가온', { writer_total_chars: 200000, writer_completed_posts: 40 }), row('me', '나나')], me);
    assert.deepEqual(seats.map((seat) => seat.name), ['가온', '나나', '하준']);
    assert.equal(seats.filter((seat) => seat.isMe).length, 1, '친구 목록에 내가 섞여 와도 내 자리는 한 번만');
    const high = seats.find((seat) => seat.id === 'a');
    const low = seats.find((seat) => seat.id === 'b');
    assert.ok(high.level > low.level);
    assert.notEqual(high.stage.image, low.stage.image);
    assert.equal(deskColumns(390), 3);
    assert.equal(deskColumns(1200), 6);
});

test('책상 장식: 프레임은 빛 테두리 색, 문패는 이름표 자리에 연결된다', () => {
    const decorated = buildSeats([row('a', '가온', { pet_data: { species: 'forest', equippedDecor: { wallpaper: 'sky', nameplate: 'nameplate-brass' } } })], null)[0];
    const plain = buildSeats([row('b', '나온')], null)[0];
    assert.equal(decorated.frame.border, '#81D4FA', '구름 프레임의 테두리 색이어야 합니다.');
    assert.notEqual(decorated.frame.border, plain.frame.border);
    assert.ok(decorated.nameplate?.image, '장착한 문패 그림이 있어야 합니다.');
    assert.match(plain.nameplate.image, /nameplate-simple/, '문패를 안 꾸민 친구도 기본 문패가 이름표 자리에 보인다');
    assert.notEqual(decorated.nameplate.image, plain.nameplate.image, '고른 문패가 기본 문패와 다르게 보여야 한다');
});

test('새 글: 이 기기에서 아직 안 연 최근 글만, 친구별 가장 최근 하나, 내 글·오래된 글은 제외', () => {
    const now = Date.parse('2026-10-24T12:00:00Z');
    const iso = (hoursAgo) => new Date(now - hoursAgo * 3600000).toISOString();
    const feed = [
        { id: 'p1', student_id: 'a', title: '최신', feed_published_at: iso(2) },
        { id: 'p2', student_id: 'a', title: '조금 전', feed_published_at: iso(30) },
        { id: 'p3', student_id: 'me', title: '내 글', feed_published_at: iso(1) },
        { id: 'p4', student_id: 'b', title: '오래됨', feed_published_at: iso((NEW_POST_DAYS + 1) * 24) },
        { id: 'p5', student_id: 'c', title: '읽음', feed_published_at: iso(3) }
    ];
    const picked = pickNewPosts(feed, { p5: now }, 'me', now);
    assert.equal(picked.get('a').id, 'p1');
    assert.equal(picked.has('me'), false);
    assert.equal(picked.has('b'), false);
    assert.equal(picked.has('c'), false);
});

test('읽은 글 기록: 저장하고 다시 읽고, 너무 많이 쌓이지 않으며, 저장소가 없어도 화면은 돈다', () => {
    const storage = memoryStorage();
    markPostSeen('s1', 'p1', storage, 1000);
    assert.deepEqual(readSeenPosts('s1', storage), { p1: 1000 });
    for (let index = 0; index < 400; index += 1) markPostSeen('s1', `x${index}`, storage, 2000 + index);
    assert.ok(Object.keys(readSeenPosts('s1', storage)).length <= 300);
    assert.deepEqual(readSeenPosts('s1', { getItem: () => { throw new Error('막힘'); } }), {});
    const blocked = markPostSeen('s1', 'p', { getItem: () => null, setItem: () => { throw new Error('막힘'); } });
    assert.ok(Reflect.has(blocked, 'p'), '저장이 막혀도 이번 화면의 읽은 기록은 돌려준다');
});

test('칠판: 이번 주 방문자는 이름만, 없으면 안내 문장', () => {
    assert.equal(describeVisitors([]).empty, true);
    const info = describeVisitors([{ name: '서연' }, { name: '하준' }, { name: null }]);
    assert.deepEqual(info.names, ['서연', '하준']);
    assert.match(info.title, /2명/);
});

test('서버: 방문 기록은 같은 학급·본인 제외·10분 안 재방문 한 번·이름 목록만, 친구 아지트를 여는 곳 한 군데에서 남긴다', async () => {
    const [migration, shell, host, dashboard, entry] = await Promise.all([
        readFile('supabase/migrations/20261413_dragon_plaza_visits.sql', 'utf8'),
        readFile('src/modules/community/friends-hideout/profile/FriendProfileShell.jsx', 'utf8'),
        readFile('src/modules/game/StudentGameModuleHost.jsx', 'utf8'),
        readFile('src/components/student/StudentDashboard.jsx', 'utf8'),
        readFile('src/modules/game/dragon-plaza/DragonPlazaEntry.jsx', 'utf8')
    ]);
    assert.match(migration, /CHECK \(owner_student_id <> visitor_student_id\)/);
    assert.match(migration, /INTERVAL '10 minutes'/);
    assert.match(migration, /owner_row\.class_id = v_class/);
    assert.match(migration, /REVOKE ALL ON public\.hideout_visits FROM PUBLIC, anon, authenticated/);
    assert.doesNotMatch(migration, /'visit_count', visit/, '방문 횟수는 돌려주지 않는다(신호일 뿐)');
    assert.match(shell, /record_hideout_visit_v1/);
    assert.match(host, /onNavigate/);
    assert.match(dashboard, /onNavigate=\{onNavigate\}/);
    assert.match(entry, /friends_hideout/);
    assert.match(entry, /initialPostId/);
});
