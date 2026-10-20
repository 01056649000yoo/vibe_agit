import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isPhotoBlock, photoIdOfBlock, photoIdsOfBlocks, textBlocks, PHOTO_BLOCK_PREFIX } from '../src/modules/class-agit/photoBlocks.js';
import { applyPhotoGate, needsPhotoReview, registerPhotoGate } from '../src/modules/class-agit/photoGate.js';

/*
 * 보고서 사진을 전시·문집에 담기 2c(2026-10-20): 사진 자리표를 알아보는 도우미, 담기 전 선생님 확인 장치, 읽기·인쇄 연결.
 * 서버 쪽 규칙은 tests/sql/20261401·20261402 스모크가 본다.
 */
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const ID = '11111111-1111-4111-8111-111111111111';
const marker = `${PHOTO_BLOCK_PREFIX}${ID}`;

test('사진 자리표는 제어 문자로 시작하는 정확한 모양만 알아본다', () => {
    assert.equal(photoIdOfBlock(marker), ID);
    assert.equal(isPhotoBlock(marker), true);
    // 학생이 글로 쓸 수 있는 비슷한 문자열은 자리표가 아니다
    for (const fake of ['photo:' + ID, ' ' + marker, marker + ' ', `\u001fphoto:not-a-uuid`, '', null, undefined, 42]) {
        assert.equal(isPhotoBlock(fake), false, String(fake));
    }
    assert.deepEqual(textBlocks(['첫 문단', marker, '둘째 문단']), ['첫 문단', '둘째 문단']);
    assert.deepEqual(photoIdsOfBlocks([marker, '글', marker]), [ID]);
    assert.deepEqual(textBlocks(null), []);
});

test('사진을 확인해야 하는 글은 사진이 든 칸이 있는데 아직 모두 담기지 않은 글이다', () => {
    assert.equal(needsPhotoReview({ photo_sections: ['a', 'b'], photos_included: 0 }), true);
    assert.equal(needsPhotoReview({ photo_sections: ['a', 'b'], photos_included: 1 }), true);
    assert.equal(needsPhotoReview({ photo_sections: ['a', 'b'], photos_included: 2 }), false);
    assert.equal(needsPhotoReview({ photo_sections: [], photos_included: 0 }), false);
    assert.equal(needsPhotoReview({}), false);
    assert.equal(needsPhotoReview(null), false);
});

test('확인 장치가 없으면 사진 없이 글만 담긴다(받은 그대로)', async () => {
    const items = [{ id: 'p1', source: { photo_sections: ['a'], photos_included: 0 } }];
    assert.deepEqual(await applyPhotoGate('c', items, async () => []), items);
});

test('확인 장치는 확인할 글만 받고, 다시 받은 글로 바꿔 돌려주며, 취소하면 던진다', async () => {
    const needs = { id: 'p1', source: { id: 'p1', photo_sections: ['a'], photos_included: 0 } };
    const plain = { id: 'p2', source: { id: 'p2', photo_sections: [], photos_included: 0 } };
    const received = [];
    const unregister = registerPhotoGate(async ({ classId, sources, reloadSources }) => {
        received.push({ classId, ids: sources.map((source) => source.id), reload: typeof reloadSources });
        return new Map([['p1', { id: 'p1', source: { id: 'p1', photo_sections: ['a'], photos_included: 1 } }]]);
    });
    const result = await applyPhotoGate('c1', [needs, plain], async () => []);
    assert.deepEqual(received, [{ classId: 'c1', ids: ['p1'], reload: 'function' }]);
    assert.equal(result[0].source.photos_included, 1);
    assert.equal(result[1], plain, '확인이 필요 없는 글은 그대로입니다.');
    unregister();
    // 사진 없이 담기(빈 Map)면 받은 그대로
    registerPhotoGate(async () => new Map());
    assert.deepEqual(await applyPhotoGate('c1', [needs], async () => []), [needs]);
    // 취소는 던진다
    registerPhotoGate(async () => { throw new Error('취소'); });
    await assert.rejects(() => applyPhotoGate('c1', [needs], async () => []), /취소/);
    registerPhotoGate(null);
});

test('글을 받는 길은 모두 확인 장치를 거치고, 장치는 DB 클라이언트를 모른다', async () => {
    const api = await read('src/modules/class-agit/api/classAgitApi.js');
    assert.match(api, /async getSources\(classId, ids\) \{\s*const items = await fetchSources\(classId, ids\);[\s\S]*?applyPhotoGate\(classId, items, fetchSources\)/);
    const gate = await read('src/modules/class-agit/photoGate.js');
    assert.doesNotMatch(gate, /supabase|\.rpc\(|import /);
    const host = await read('src/modules/class-agit/teacher/PhotoConfirmHost.jsx');
    assert.match(host, /TEACHER_PHOTO_CHECK_STATEMENT/);
    assert.match(host, /disabled=\{!checked \|\| !item\.url/);
    assert.match(host, /confirmPhotoUse[\s\S]*copyConfirmedPhotos[\s\S]*reloadSources/);
    const entry = await read('src/modules/class-agit/teacher/TeacherEntry.jsx');
    assert.match(entry, /<PhotoConfirmHost \/>/);
});

test('읽는 화면은 사진 찾는 방법을 주입받고(공개 화면은 DB 를 가져오지 않는다), 인쇄는 사진을 쪼개지 않는다', async () => {
    const blocks = await read('src/modules/class-agit/gallery/WorkBlocks.jsx');
    assert.match(blocks, /useContext\(PhotoResolverContext\)/);
    assert.doesNotMatch(blocks, /photoApi|supabase/);
    const reader = await read('src/modules/class-agit/gallery/ArtworkReader.jsx');
    assert.match(reader, /<WorkBlocks blocks=\{work\.blocks\} \/>/);
    for (const path of ['src/modules/class-agit/student/StudentEntry.jsx', 'src/modules/class-agit/teacher/TeacherEntry.jsx']) {
        assert.match(await read(path), /<PhotoResolverContext\.Provider value=\{resolvePhotoUrls\}>/, path);
    }
    const print = await read('src/modules/class-agit/anthology/print.js');
    assert.match(print, /id="anthology-photos"/);
    assert.match(print, /\.anthology-photo\{[^}]*break-inside:avoid/);
    assert.match(print, /await import\('\.\.\/api\/photoApi\.js'\)/, '인쇄는 사진이 있을 때만 사진 API 를 불러온다');
    const pagination = await read('src/modules/class-agit/anthology/pagination.js');
    assert.match(pagination, /photoIdOfBlock\(text\.trim\(\)\)/);
    assert.match(pagination, /export async function settleAnthologyPhotos/);
    // 인쇄·교정 화면 모두 사진이 풀린 뒤에 쪽 높이를 잰다
    for (const path of ['src/modules/class-agit/anthology/print.js', 'src/modules/class-agit/anthology/PageTuner.jsx']) {
        const source = await read(path);
        assert.ok(source.indexOf('settleAnthologyPhotos(') < source.indexOf('paginateAnthology('), path);
    }
});

test('글 내보내기(구글 문서·엑셀)는 사진 자리표를 글로 쓰지 않는다', async () => {
    assert.match(await read('src/modules/class-agit/anthology/googleDocExport.js'), /textBlocks\(work\.blocks\)\.forEach/);
    assert.match(await read('src/modules/class-agit/anthology/AnthologyManager.jsx'), /textBlocks\(work\.blocks\)\.join/);
});
