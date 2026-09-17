import test from 'node:test';
import assert from 'node:assert/strict';
import {
    fetchSeojiBookInfo,
    fetchSeojiPageCount,
    findSeojiRecord,
    parseSeojiPageCount
} from '../supabase/functions/book-search/nlSeoji.js';

// 실제 응답에서 확인한 표기들(2026-09-17). 표기가 제각각이라 파싱을 고정해 둔다.
test('쪽수 표기가 제각각이어도 본문 쪽수만 읽는다', () => {
    assert.equal(parseSeojiPageCount('170 p.'), 170);
    assert.equal(parseSeojiPageCount('100'), 100);
    assert.equal(parseSeojiPageCount('343 p. : 삽화 ; 23 cm'), 343);
    assert.equal(parseSeojiPageCount('99 쪽'), 99);
});

test('쪽수가 없거나 판형만 있으면 비워 둔다', () => {
    assert.equal(parseSeojiPageCount(''), null);
    assert.equal(parseSeojiPageCount(null), null);
    assert.equal(parseSeojiPageCount('210*297'), null);
    assert.equal(parseSeojiPageCount('99999 p.'), null);
});

test('요청한 ISBN과 정확히 같은 판본만 쓴다', () => {
    const payload = {
        docs: [
            { EA_ISBN: '9780000000001', PAGE: '999 p.', FORM: '종이책' },
            { EA_ISBN: '978-89-1234-567-8', PAGE: '248 p.', FORM: '종이책' }
        ]
    };
    assert.equal(findSeojiRecord(payload, '9788912345678').PAGE, '248 p.');
    assert.equal(findSeojiRecord(payload, '9788912345679'), null);
});

test('같은 ISBN이 전자책·종이책으로 갈리면 쪽수가 있는 종이책을 고른다', () => {
    const payload = {
        docs: [
            { EA_ISBN: '9788912345678', PAGE: '', FORM: '전자책' },
            { EA_ISBN: '9788912345678', PAGE: '132 p.', FORM: '종이책' }
        ]
    };
    assert.equal(findSeojiRecord(payload, '9788912345678').PAGE, '132 p.');
});

test('인증키나 ISBN이 없으면 도서관에 묻지 않는다', async () => {
    const neverCalled = () => { throw new Error('호출하면 안 된다'); };
    assert.equal(await fetchSeojiPageCount({ isbn: '9788912345678', certKey: '', fetchImpl: neverCalled }), null);
    assert.equal(await fetchSeojiPageCount({ isbn: '1234', certKey: 'k', fetchImpl: neverCalled }), null);
});

test('조회 주소에 인증키와 정규화된 ISBN을 담아 보낸다', async () => {
    let requestedUrl = null;
    await fetchSeojiPageCount({
        isbn: '978-89-1234-567-8',
        certKey: 'test-key',
        fetchImpl: (url) => {
            requestedUrl = url;
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ docs: [] }) });
        }
    });
    assert.equal(requestedUrl.searchParams.get('isbn'), '9788912345678');
    assert.equal(requestedUrl.searchParams.get('cert_key'), 'test-key');
    assert.equal(requestedUrl.searchParams.get('result_style'), 'json');
});

test('도서관이 응답하지 않으면 쪽수를 비워 둔다', async () => {
    const pageCount = await fetchSeojiPageCount({
        isbn: '9788912345678',
        certKey: 'test-key',
        fetchImpl: () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
    });
    assert.equal(pageCount, null);
});

test('서지 정보는 쪽수와 함께 제목·발행자도 돌려준다', async () => {
    const info = await fetchSeojiBookInfo({
        isbn: '9791192049380',
        certKey: 'test-key',
        fetchImpl: () => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
                docs: [{
                    EA_ISBN: '9791192049380',
                    PAGE: '170 p.',
                    TITLE: '우리가 사는 푸른 별 지구? No 플라스틱 지구!',
                    PUBLISHER: '풀빛',
                    PUBLISH_PREDATE: '20250310',
                    FORM: '종이책'
                }]
            })
        })
    });
    assert.equal(info.pageCount, 170);
    assert.equal(info.publisher, '풀빛');
    assert.equal(info.form, '종이책');
});
