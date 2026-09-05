import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createShareDraft, moveShareWork, moveShareWorkOrder, prepareShareWorks, samlinkShareUrl } from '../src/modules/class-agit/public/sharingPolicy.js';
import { createClassAgitReleaseFixture } from '../src/dev/fixtures/classAgitReleaseFixture.js';
const rooms = [{ id: 'first', title: '봄', introduction: '', variant: 0 }, { id: 'second', title: '여름', introduction: '', variant: 1 }];
const data = (count = 2) => ({ rooms, candidates: Array.from({ length: count }, (_, i) => ({ itemId: `i-${i}`, title: `글 ${i}`, authorName: `학생 ${i}`, publicAlias: '옛 익명 이름', sourceRevision: 'v1', roomId: i === 0 ? 'first' : 'second' })) });
test('공개 편집은 원래 지은이를 채우고 저장한 수정 정보를 우선 복원한다', () => {
    const source = data();
    source.candidates[0] = { ...source.candidates[0], shareTitle: '전시용 제목', shareAuthor: '전시 지은이', shareRoomId: 'second' };
    const draft = createShareDraft(source);
    assert.equal(draft.items[0].title, '전시용 제목');
    assert.equal(draft.items[0].author, '전시 지은이');
    assert.equal(draft.items[0].roomId, 'second');
    assert.equal(draft.items[1].author, '학생 1');
    assert.equal(source.candidates[0].title, '글 0');
    assert.equal(prepareShareWorks(draft.items, draft.rooms)[0].author, '전시 지은이');
});
test('주제 이동은 20편 제한을 지키고 실패하면 원래 목록을 보존한다', () => {
    const draft = createShareDraft(data(21));
    const before = structuredClone(draft);
    assert.throws(() => moveShareWork(draft, 'i-0', 'second'), /20편/);
    assert.deepEqual(draft, before);
    const moved = moveShareWork(draft, 'i-2', 'first');
    assert.deepEqual(prepareShareWorks(moved.items, rooms).slice(0, 2).map((item) => item.itemId), ['i-0', 'i-2']);
    assert.throws(() => prepareShareWorks([{ ...moved.items[0], author: '' }], rooms), /지은이/);
    assert.throws(() => prepareShareWorks([{ ...moved.items[0], title: '글'.repeat(81) }], rooms), /제목/);
});
test('샘링크 주소는 지정 도메인과 안전한 경로만 표시한다', () => {
    assert.equal(samlinkShareUrl('https://xn--9y2br3k43n.kr/e-Ab_-123'), 'https://샘링크.kr/e-Ab_-123');
    for (const value of ['https://샘링크.kr.evil.test/a', 'javascript:alert(1)', 'http://샘링크.kr/a', 'https://user@샘링크.kr/a', 'https://샘링크.kr/a#token', 'https://샘링크.kr/a?q=secret', 'https://샘링크.kr:4430/a']) assert.equal(samlinkShareUrl(value), '');
});
test('표 편집→발행→재접속→방문자 감상에 수정 표시와 주제가 이어진다', async () => {
    const { api, sourceApi, publicApi } = await createClassAgitReleaseFixture();
    const workspace = await sourceApi.getWorkspace('sample-class-agit');
    const id = workspace.projects[0].id;
    await api.manageRollout({ expected_revision: 1, mode: 'pilot', external_enabled: true, class_ids: ['sample-class-agit'] });
    const initial = await api.getShare('sample-class-agit', id);
    const draft = createShareDraft(initial);
    draft.items[0].title = '내가 정한 제목'; draft.items[0].author = '내가 정한 지은이'; draft.rooms[0].title = '우리의 주제';
    const payload = { display_version: 2, layout_version: 2, expected_revision: 0, exhibition_revision: initial.exhibition_revision,
        title: '시험 전시', rooms: draft.rooms, items: prepareShareWorks(draft.items, draft.rooms), token: 'e'.repeat(64), starts_at: new Date(Date.now() - 100).toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() };
    const saved = await api.shareAction('sample-class-agit', id, 'publish', payload);
    assert.ok(samlinkShareUrl(saved.share.short_url));
    assert.deepEqual(await api.shareAction('sample-class-agit', id, 'publish', payload), saved);
    const reopened = createShareDraft(await api.getShare('sample-class-agit', id));
    assert.equal(reopened.items[0].author, '내가 정한 지은이');
    assert.equal(reopened.items[0].title, '내가 정한 제목');
    assert.equal(reopened.rooms[0].title, '우리의 주제');
    const publicRoom = await publicApi.read(payload.token, 1);
    assert.equal(publicRoom.items[0].author, '내가 정한 지은이');
    assert.equal(publicRoom.rooms[0].title, '우리의 주제');
    assert.notEqual((await sourceApi.getWorkspace('sample-class-agit', id)).draft.items[0].title, '내가 정한 제목');
});
test('전시실 안에서만 순서를 바꾸고 공개 순번은 전시실 차례대로 다시 매긴다', () => {
    const draft = createShareDraft(data(4));
    const moved = moveShareWorkOrder(draft, 'i-3', 1);
    assert.deepEqual(prepareShareWorks(moved.items, rooms).map((item) => item.itemId), ['i-0', 'i-3', 'i-1', 'i-2']);
    assert.deepEqual(moveShareWorkOrder(draft, 'i-1', 1).items, draft.items);
    for (const position of [0, 4, -1, NaN, Infinity]) assert.deepEqual(moveShareWorkOrder(draft, 'i-3', position).items, draft.items);
    assert.deepEqual(prepareShareWorks(draft.items, rooms).map((item) => item.itemId), ['i-0', 'i-1', 'i-2', 'i-3']);
});
test('공개 작품 확인은 전시실 카드와 모달로 나눠 순서까지 조절한다', () => {
    const source = readFileSync('src/modules/class-agit/public/ShareWorkTable.jsx', 'utf8');
    assert.match(source, /class-agit-share-room-cards/);
    assert.match(source, /aria-haspopup="dialog"/);
    assert.match(source, /<Modal isOpen=\{!!open\}/);
    assert.match(source, /moveShareWorkOrder\(draft, item.itemId, index\)/);
    assert.match(source, /moveShareWorkOrder\(draft, item.itemId, index \+ 2\)/);
    for (const column of ['작품 제목', '지은이', '전시 주제']) assert.ok(source.includes(column), `${column} 열이 없습니다.`);
});
test('샘링크 연결은 고정 목적지·비공개 도우미·기간 동기화를 지킨다', () => {
    const sql = readFileSync('supabase/migrations/20261248_class_agit_share_editor_samlink.sql', 'utf8');
    assert.match(sql, /INSERT INTO samlink\.short_links/);
    assert.match(sql, /https:\/\/xn--vz0ba242ncqcba79xhwx.site\/exhibition#/);
    assert.doesNotMatch(sql, /p_payload->>'destination'/);
    assert.match(sql, /DELETE FROM samlink\.short_links WHERE slug=OLD.samlink_slug/);
    assert.match(sql, /UPDATE samlink\.short_links SET expires_at=NEW.expires_at/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public.class_agit_create_samlink_v1\(UUID,UUID,TEXT\) FROM PUBLIC,anon,authenticated,service_role/);
    assert.match(sql, /mode='pilot' AND external_enabled IS FALSE/);
});
test('공유 주소는 샘링크가 쓰는 방식 그대로 4자로 발급하고 샘링크에 주인까지 남긴다', () => {
    const sql = readFileSync('supabase/migrations/20261250_class_agit_samlink_native_slug.sql', 'utf8');
    // 샘링크 원본(~/URL/lib/slug.ts)의 값을 여기 적어 둔다. 맥미니 밖 배포 관문에는 그 저장소가 없다.
    const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789', length = 4;
    assert.equal(alphabet.length, 32);
    assert.ok(sql.includes(`'${alphabet}'`), '샘링크 알파벳과 다릅니다.');
    assert.ok(sql.includes(`THEN ${length} ELSE 6 END`), '샘링크 기본 길이와 다릅니다.');
    // 샘링크 저장소가 있는 곳(맥미니)에서는 원본과 갈라졌는지까지 본다.
    const source = `${homedir()}/URL/lib/slug.ts`;
    // 경로는 홈 디렉터리 + 고정 문자열뿐이고 검사에서만 읽는다(사용자 입력이 섞이지 않는다).
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (existsSync(source)) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const samlink = readFileSync(source, 'utf8');
        assert.equal(samlink.match(/const ALPHABET = "([^"]+)"/)[1], alphabet);
        assert.equal(Number(samlink.match(/const DEFAULT_SLUG_LENGTH = (\d+)/)[1]), length);
    }
    for (const reserved of ['admin', 'api', 'present', 'expired', 'assets', 'public']) assert.ok(sql.includes(`'${reserved}'`), `${reserved} 예약어를 걸러야 합니다.`);
    // 옛 0인자 함수를 남기면 호출이 모호해진다.
    assert.match(sql, /DROP FUNCTION IF EXISTS public.class_agit_samlink_slug_v1\(\);/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public.class_agit_samlink_slug_v1\(INTEGER\) FROM PUBLIC,anon,authenticated,service_role/);
    assert.match(sql, /'https:\/\/xn--vz0ba242ncqcba79xhwx.site\/exhibition#'\|\|p_token/);
});
test('샘링크에 남기는 주인 표시자는 서명 기기 쿠키 형식과 겹치지 않는다', () => {
    const sql = readFileSync('supabase/migrations/20261250_class_agit_samlink_native_slug.sql', 'utf8');
    const marker = sql.match(/created_by='([^']+)'/)[1];
    // device_<uuid> 형식이면 브라우저가 쿠키로 주인 행세를 해 목적지(토큰)를 읽을 수 있다.
    assert.doesNotMatch(marker, /^device_[0-9a-f-]{36}$/);
    assert.match(sql, /INSERT INTO samlink\.short_link_device_access\(link_id,device_id\)/);
    assert.match(sql, /display_label='아지트 글 전시관'/);
});
