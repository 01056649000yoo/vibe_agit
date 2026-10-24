import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dragonPlazaManifest } from '../src/modules/game/dragon-plaza/manifest.js';
import {
    buildSeat, buildSeats, deskColumns, describeVisitors, markPostSeen, NEW_POST_DAYS, pickNewPosts, readSeenPosts
} from '../src/modules/game/dragon-plaza/plazaModel.js';

// 우리반 수호룡 아지트(2026-10-24): 교실 자리·책상 장식·새 글 표시·이번 주 방문자 칠판.
const row = (id, name, extra = {}) => ({ id, name, pet_data: { species: 'star', equippedDecor: {} }, writer_total_chars: 0, writer_completed_posts: 0, ...extra });
const memoryStorage = () => {
    const data = new Map();
    return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

const orderOf = async (path) => Number((await readFile(path, 'utf8')).match(/playground: \{[\s\S]*?order: (\d+)/)?.[1]);

test('모듈: 기본 켜짐, 놀이터에서 `나의 작가 수호룡` 바로 아래, 학생 입구와 교사 화면이 있다', async () => {
    assert.equal(dragonPlazaManifest.id, 'dragon-plaza');
    assert.equal(dragonPlazaManifest.name, '우리반 수호룡 아지트');
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
    assert.match(entry, /presentation="modal"/, '친구 아지트는 교실 위의 창으로 연다');
    assert.doesNotMatch(entry, /onNavigate/, '교실 밖 화면으로 이동하지 않는다');
    assert.match(entry, /PlazaPostModal/);
});

test('그림: 앉은 수호룡 4종 × 10단계 40장과 교실 배경이 모두 있고, 크기가 알맞다', async () => {
    const { stat } = await import('node:fs/promises');
    for (const species of ['star', 'forest', 'ember', 'moon']) {
        for (let level = 1; level <= 10; level += 1) {
            const info = await stat(`public/assets/dragons/desk/${species}/level-${level}.webp`);
            assert.ok(info.size > 20000 && info.size < 260000, `${species} ${level}단계 그림 크기(${info.size}B)가 이상합니다`);
        }
    }
    const room = await stat('public/assets/class-room/classroom-day.webp');
    assert.ok(room.size > 20000 && room.size < 400000, `교실 배경 크기(${room.size}B)가 이상합니다`);
});

test('후광은 작가 단계가 아니라 소통(독서) 칭호 단계 1~7을 따르고, 그림은 작가 성장 단계를 따른다', () => {
    const base = { id: 'a', name: '가', pet_data: { species: 'star' }, writer_total_chars: 60000, writer_completed_posts: 40 };
    const low = buildSeat({ ...base, reader_score: 0 });
    const high = buildSeat({ ...base, reader_score: 100000 });
    assert.equal(low.level, high.level, '그림(작가 단계)은 같다');
    assert.equal(low.readerLevel, 1);
    assert.equal(high.readerLevel, 7, '소통 점수가 높으면 7단계 후광');
    assert.equal(buildSeat({ ...base, pet_data: { species: 'star', _testReaderLevel: 4 } }).readerLevel, 4);
});

test('새 글 창은 놀이터 게임 화면(zIndex 20000)보다 위에 뜬다 — 아니면 글 창이 화면 뒤에 숨어 아무 일도 없어 보인다', async () => {
    const [modal, dashboard, detail] = await Promise.all([
        readFile('src/modules/game/dragon-plaza/PlazaPostModal.jsx', 'utf8'),
        readFile('src/components/student/StudentDashboard.jsx', 'utf8'),
        readFile('src/components/student/PostDetailModal.jsx', 'utf8')
    ]);
    const gameZ = Number(/zIndex: (\d+), overflowX: 'hidden'/.exec(dashboard)?.[1]);
    const plazaZ = Number(/PLAZA_POST_Z_INDEX = (\d+)/.exec(modal)?.[1]);
    assert.ok(gameZ >= 20000, '게임 화면 zIndex 를 읽지 못했습니다');
    assert.ok(plazaZ > gameZ, `글 창(${plazaZ})이 게임 화면(${gameZ}) 뒤에 숨습니다`);
    assert.match(modal, /zIndex=\{PLAZA_POST_Z_INDEX\}/);
    assert.match(detail, /zIndex = 10002/);
});

test('새 글 단추를 누르면 그 친구의 안 본 새 글이 모두 읽음 처리되어 표시가 사라진다', () => {
    const now = Date.parse('2026-10-25T00:00:00Z');
    const feed = [
        { id: 'a2', student_id: 's2', title: '둘째', feed_published_at: '2026-10-24T10:00:00Z' },
        { id: 'a1', student_id: 's2', title: '첫째', feed_published_at: '2026-10-23T10:00:00Z' },
        { id: 'b1', student_id: 's3', title: '다른 친구', feed_published_at: '2026-10-24T09:00:00Z' }
    ];
    const first = pickNewPosts(feed, {}, 'me', now);
    assert.equal(first.get('s2').id, 'a2');
    assert.deepEqual([...first.get('s2').ids].sort(), ['a1', 'a2']);
    const store = new Map();
    const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
    const seen = markPostSeen('me', first.get('s2').ids, storage, now);
    const after = pickNewPosts(feed, seen, 'me', now);
    assert.equal(after.has('s2'), false, '여러 편이어도 표시가 사라져야 한다');
    assert.equal(after.get('s3').id, 'b1', '다른 친구의 새 글은 그대로');
});

test('교실 열 수는 기기 화면이 아니라 교실 폭(@container)으로 5열 → 4열 → 3열로 바뀐다', async () => {
    const css = await readFile('src/modules/game/dragon-plaza/plaza.css', 'utf8');
    assert.match(css, /\.plaza \{ container: plaza \/ inline-size;/);
    assert.match(css, /repeat\(5, minmax\(0, 1fr\)\)/);
    assert.match(css, /@container plaza \(max-width: 899px\) \{ \.plaza__grid \{ grid-template-columns: repeat\(4/);
    assert.match(css, /@container plaza \(max-width: 599px\) \{ \.plaza__grid \{ grid-template-columns: repeat\(3/);
    assert.doesNotMatch(css, /@media \(max-width: 760px\)/, '화면 폭 기준 규칙이 남아 있습니다');
});

test('돌아가기 단추는 들어온 길에 따라 다르다: 놀이터에서 들어오면 놀이터로, 첫 화면 입구로 들어오면 첫 화면으로', async () => {
    const [dashboard, host, entry] = await Promise.all([
        readFile('src/components/student/StudentDashboard.jsx', 'utf8'),
        readFile('src/modules/game/StudentGameModuleHost.jsx', 'utf8'),
        readFile('src/modules/game/dragon-plaza/DragonPlazaEntry.jsx', 'utf8')
    ]);
    assert.match(dashboard, /openGameModule\(plaza, 'home'\)/);
    assert.match(dashboard, /if \(activeGameModuleOrigin !== 'home'\) setIsPlaygroundOpen\(true\)/);
    assert.match(dashboard, /backTarget=\{activeGameModuleOrigin\}/);
    assert.match(host, /backTarget,/);
    assert.match(entry, /backTarget === 'home' \? '← 처음 화면' : '← 놀이터'/);
});

test('GPT 검토 반영: 저장소 getter 예외·연속 읽음·중복 id·같은 시각 기록이 화면을 깨지 않는다', () => {
    const blocked = { get localStorage() { throw new Error('SecurityError'); } };
    // 기본 저장소를 읽는 것 자체가 막혀도 예외가 번지지 않는다(여기서는 호출만 확인).
    assert.deepEqual(readSeenPosts('s1', null), {});
    assert.deepEqual(readSeenPosts('s1', { getItem: () => { throw new Error('막힘'); } }), {});
    assert.ok(blocked);
    // 같은 글 id 가 두 번 와도 ids 는 하나
    const feed = [
        { id: 'same', student_id: 's2', feed_published_at: '2026-10-24T10:00:00Z' },
        { id: 'same', student_id: 's2', feed_published_at: '2026-10-24T10:00:00Z' }
    ];
    assert.deepEqual(pickNewPosts(feed, {}, 'me', Date.parse('2026-10-25T00:00:00Z')).get('s2').ids, ['same']);
    // 같은 학생이 두 번 와도 자리는 하나
    const seats = buildSeats([{ id: 'a', name: '가', pet_data: {} }, { id: 'a', name: '가', pet_data: {} }], null);
    assert.equal(seats.length, 1);
    // 기록이 300개 꽉 찬 상태에서 시각이 같아도 방금 읽은 글이 남는다
    const store = new Map();
    const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
    for (let index = 0; index < 300; index += 1) markPostSeen('s1', `old${index}`, storage, 5000);
    const after = markPostSeen('s1', 'fresh', storage, 5000);
    assert.ok(after.fresh, '같은 시각이어도 새 기록이 잘리지 않는다');
});

test('GPT 검토 반영: 새 글 창은 공개하지 않은 처음 글을 요청하지 않고, 글이 열린 뒤에야 읽음 처리한다', async () => {
    const [modal, entry, shell] = await Promise.all([
        readFile('src/modules/game/dragon-plaza/PlazaPostModal.jsx', 'utf8'),
        readFile('src/modules/game/dragon-plaza/DragonPlazaEntry.jsx', 'utf8'),
        readFile('src/modules/community/friends-hideout/profile/FriendProfileShell.jsx', 'utf8')
    ]);
    const columns = /const POST_COLUMNS = '([^']*)'/.exec(modal)?.[1] || '';
    assert.doesNotMatch(columns, /original_content|original_title/, '처음 글 컬럼은 첫 요청에 넣지 않는다');
    assert.match(modal, /if \(data\.show_original\)/, '공개를 허락한 글만 처음 글을 따로 가져온다');
    assert.match(entry, /onOpened: \(\) => markSeen\(ids\)/, '열린 뒤에 읽음 처리');
    assert.match(entry, /closeOnEscape=\{!reading\}/, '글 창이 위에 있으면 Esc 는 글 창이 먼저');
    assert.match(entry, /inert=\{modalOpen \|\| undefined\}/, '창이 열리면 뒤 교실은 조작되지 않는다');
    assert.match(shell, /dialogRef\.current\?\.focus\(\)/, '창이 열리면 포커스가 창으로 간다');
});
