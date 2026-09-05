import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPreviewDraft } from '../src/dev/fixtures/classAgitFixtures.js';
import { createClassAgitReleaseFixture } from '../src/dev/fixtures/classAgitReleaseFixture.js';
import { assertRoomDraft, editRooms, newExhibitionRoom, normalizeRoomDraft, orderedRoomItems } from '../src/modules/class-agit/rooms.js';
import { createGalleryPresentation } from '../src/modules/class-agit/exhibitionDraft.js';
import { arrangeGalleryRooms, galleryRoomHeight, getGallerySlot } from '../src/modules/class-agit/gallery/roomLayout.js';
import { createPublicPreviewApi } from '../src/modules/class-agit/public/preview.js';
import { assertPublicGalleryResponse } from '../src/modules/class-agit/public/publicApi.js';
import { getRoomVariants, GALLERY_THEMES } from '../src/modules/class-agit/designs.js';
import { CLASS_AGIT_LIMITS as limits } from '../src/modules/class-agit/policy.js';
const themed = () => {
    const draft = createPreviewDraft(41);
    const rooms = ['봄', '여름', '가을'].map((name, i) => newExhibitionRoom(i, name, `season-${i}`));
    return { ...draft, rooms, items: draft.items.map((item, i) => ({ ...item, roomId: rooms[i < 13 ? 0 : i < 33 ? 1 : 2].id })) };
};
test('13+20+8 주제방은 저장·표시 순서를 유지하고 21편 이동은 원자적으로 거부한다', () => {
    const draft = assertRoomDraft(themed(), true);
    assert.deepEqual(arrangeGalleryRooms(createGalleryPresentation(draft).works, draft.rooms).map((r) => r.works.length), [13, 20, 8]);
    const before = structuredClone(draft);
    assert.throws(() => editRooms(draft, { type: 'room-assign', sourceIds: [draft.items[0].sourceId], roomId: draft.rooms[1].id }), /20편/);
    assert.deepEqual(draft, before);
    const moved = editRooms(draft, { type: 'room-move', id: draft.rooms[2].id, direction: -1 });
    assert.deepEqual(moved.rooms.map((r) => r.title), ['봄', '가을', '여름']);
    assert.equal(orderedRoomItems(moved)[13].sourceId, draft.items[33].sourceId);
});
test('방 삭제는 미배정으로 이동하고 미배정 발행·120편·10실 상한을 검증한다', () => {
    const draft = themed();
    const removed = editRooms(draft, { type: 'room-delete', id: draft.rooms[0].id });
    assert.equal(removed.items.length, 41); assert.equal(removed.items.filter((item) => item.roomId === null).length, 13);
    assert.throws(() => assertRoomDraft(removed, true), /미배정/);
    const assigned = editRooms(removed, { type: 'room-add', id: 'new-room', title: '다시 담기' });
    assert.doesNotThrow(() => assertRoomDraft(editRooms(assigned, { type: 'room-assign', sourceIds: removed.items.filter((i) => !i.roomId).map((i) => i.sourceId), roomId: 'new-room' }), true));
    assert.equal(assertRoomDraft(createPreviewDraft(120), true).rooms.length, 6);
    const legacy = createPreviewDraft(120); delete legacy.rooms;
    assert.equal(assertRoomDraft(legacy, true).rooms.length, 10);
    assert.throws(() => editRooms(normalizeRoomDraft(legacy), { type: 'room-add' }), /10개/);
    assert.throws(() => assertRoomDraft({ ...draft, items: Array(121).fill(draft.items[0]) }), /120편/);
});
test('원글 없는 작품 여러 개도 itemId로 하나만 다른 방에 배정한다', () => {
    const draft = themed();
    draft.items[0] = { ...draft.items[0], sourceId: null, itemId: 'gone-one' };
    draft.items[1] = { ...draft.items[1], sourceId: null, itemId: 'gone-two' };
    const changed = editRooms(draft, { type: 'room-assign', sourceIds: ['gone-one'], roomId: draft.rooms[2].id });
    assert.equal(changed.items.find((i) => i.itemId === 'gone-one').roomId, draft.rooms[2].id);
    assert.equal(changed.items.find((i) => i.itemId === 'gone-two').roomId, draft.rooms[0].id);
});
test('외부 DTO는 20편 요약과 주제만 전송하고 빈 방·회수 뒤 방 번호를 보존한다', async () => {
    const draft = themed(), view = createGalleryPresentation(draft, 'external');
    view.works = view.works.map((work, index) => ({ ...work, id: `published-${index + 1}` }));
    const api = createPublicPreviewApi(view);
    const room = await api.read('', 2);
    assert.equal(assertPublicGalleryResponse(room, 2), room);
    assert.equal(room.items.length, 20); assert.equal(room.rooms[1].title, '여름');
    assert.ok(room.items.every((item) => !('blocks' in item) && !('roomId' in item)));
    const after = await createPublicPreviewApi({ ...view, works: view.works.filter((w) => w.roomId !== draft.rooms[0].id) }).read('', 2);
    assert.equal(after.rooms[0].number, 2); assert.deepEqual(after.items, room.items);
    assertPublicGalleryResponse(after, 2);
    assert.throws(() => assertPublicGalleryResponse({ ...room, rooms: [{ ...room.rooms[1], count: 21 }], total_count: 21, items: Array(21).fill(room.items[0]) }, 2));
});
test('20편 장면은 5행의 액자와 바닥이 겹치지 않으며 네 디자인의 변형을 제공한다', () => {
    for (const count of [1, 13, 20]) {
        const height = galleryRoomHeight(count), slots = Array.from({ length: count }, (_, i) => getGallerySlot(i));
        for (const [i, slot] of slots.entries()) {
            assert.ok(slot.y + slot.height < height * .83);
            for (const other of slots.slice(i + 1)) assert.ok(slot.x + slot.width <= other.x || other.x + other.width <= slot.x || slot.y + slot.height <= other.y || other.y + other.height <= slot.y);
        }
    }
    for (const theme of GALLERY_THEMES) assert.equal(getRoomVariants(theme.id).length, 4);
});
test('모든 새 RPC·교사/학생/외부 경계가 같은 방 상한과 고정 목차를 사용한다', () => {
    const sql = readFileSync('supabase/migrations/20261247_class_agit_themed_rooms.sql', 'utf8');
    assert.equal(Number(sql.match(/class_agit_room_capacity_v1\(\)[\s\S]*?SELECT (\d+);/)[1]), limits.worksPerRoom);
    assert.equal(Number(sql.match(/class_agit_max_rooms_v1\(\)[\s\S]*?SELECT (\d+);/)[1]), limits.maxRooms);
    const reader = sql.split('CREATE OR REPLACE FUNCTION public.class_agit_read_layout_v1(')[1].split('$$;')[0];
    assert.doesNotMatch(reader, /student_posts|current_source|published_snapshot|blocks/);
    assert.match(reader, /room_no=p_room.*LIMIT 20/);
    for (const signature of ['get_my_class_agit_room_v1(UUID,INTEGER,INTEGER)', 'get_my_class_agit_work_v1(UUID,INTEGER,TEXT,INTEGER)', 'get_class_agit_publication_v1(UUID,UUID,INTEGER,INTEGER)', 'read_public_class_agit_v1(TEXT,INTEGER,TEXT,INTEGER,INTEGER)']) assert.ok(sql.includes(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC,anon,authenticated,service_role;`));
    assert.doesNotMatch(sql, /UPDATE public.class_agit_rollout|DELETE FROM public.class_agit_pilot_classes/);
});
test('저장/재접속과 공개판은 주제·배경·방 안 순서를 따로 보관한다', async () => {
    const { sourceApi } = await createClassAgitReleaseFixture();
    const ws = await sourceApi.getWorkspace('sample-class-agit');
    const id = ws.projects[0].id;
    let draft = (await sourceApi.getWorkspace('sample-class-agit', id)).draft;
    draft = editRooms(draft, { type: 'room-add', id: 'second', title: '둘째 주제' });
    draft = editRooms(draft, { type: 'room-assign', sourceIds: draft.items.slice(5).map((i) => i.sourceId), roomId: 'second' });
    const saved = await sourceApi.save(draft.classId, draft, 2);
    await sourceApi.runAction(draft.classId, 'set_enabled', { expected_enabled: false, enabled: true });
    await sourceApi.runAction(draft.classId, 'publish', { exhibition_id: id, expected_revision: saved.draft.revision });
    const frozen = await sourceApi.getPublication(draft.classId, id, 2);
    assert.equal(frozen.rooms[1].title, '둘째 주제'); assert.equal(frozen.exhibition.works.length, 7);
    const reopened = (await sourceApi.getWorkspace(draft.classId, id)).draft;
    const edited = editRooms(reopened, { type: 'room-edit', id: 'second', patch: { title: '다음 판', variant: 3 } });
    await sourceApi.save(draft.classId, edited, reopened.revision);
    assert.deepEqual(await sourceApi.getPublication(draft.classId, id, 2), frozen);
});

test('외부 Edge는 2번 표시 계약을 전달하고 예전 요청과 10실 경계를 유지한다', async () => {
    const { createPublicReadHandler } = await import('../supabase/functions/class-agit-public-read/handler.js');
    const calls = [];
    const handler = createPublicReadHandler({ rpc: async (name, payload) => { calls.push({ name, payload }); return name.startsWith('take_') ? { allowed: true } : { version: 1 }; } });
    const send = (fields) => handler(new Request('https://example.invalid/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_token: 'd'.repeat(64), ...fields }) }));
    assert.equal((await send({ p_room: limits.maxRooms, p_layout_version: 2 })).status, 200);
    assert.equal(calls.at(-1).payload.p_layout_version, 2);
    assert.equal((await send({ p_room: 1 })).status, 200);
    assert.equal(Object.hasOwn(calls.at(-1).payload, 'p_layout_version'), false);
    const count = calls.length;
    for (const fields of [{ p_room: 11 }, { p_layout_version: 3 }, { p_layout_version: '2' }, { p_work_id: 'published-121' }]) assert.equal((await send(fields)).status, 404);
    assert.equal(calls.length, count);
});
