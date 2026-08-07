import test from 'node:test';
import assert from 'node:assert/strict';
import {
    fetchGoogleBooksPageCount,
    findExactGoogleBooksPageCount,
    normalizeGoogleBooksIsbn
} from '../supabase/functions/book-search/googleBooks.js';

test('ISBN은 숫자와 X만 남기고 10자리·13자리만 허용한다', () => {
    assert.equal(normalizeGoogleBooksIsbn('978-89-1234-567-8'), '9788912345678');
    assert.equal(normalizeGoogleBooksIsbn('0-123456-78-X'), '012345678X');
    assert.equal(normalizeGoogleBooksIsbn('1234'), '');
});

test('Google 결과는 ISBN이 정확히 일치하는 판본의 쪽수만 사용한다', () => {
    const payload = {
        items: [
            { volumeInfo: { industryIdentifiers: [{ identifier: '9780000000001' }], pageCount: 999 } },
            { volumeInfo: { industryIdentifiers: [{ identifier: '978-89-1234-567-8' }], pageCount: 248 } }
        ]
    };
    assert.equal(findExactGoogleBooksPageCount(payload, '9788912345678'), 248);
    assert.equal(findExactGoogleBooksPageCount(payload, '9788912345679'), null);
});

test('비정상 쪽수는 마라톤 집계에 사용하지 않는다', () => {
    const payload = {
        items: [{ volumeInfo: { industryIdentifiers: [{ identifier: '9788912345678' }], pageCount: 0 } }]
    };
    assert.equal(findExactGoogleBooksPageCount(payload, '9788912345678'), null);
});

test('Google 요청은 ISBN 검색을 사용하고 정확한 쪽수를 반환한다', async () => {
    let requestedUrl = '';
    const pageCount = await fetchGoogleBooksPageCount({
        isbn: '9788912345678',
        apiKey: 'test-key',
        fetchImpl: async (url) => {
            requestedUrl = String(url);
            return {
                ok: true,
                json: async () => ({
                    items: [{ volumeInfo: { industryIdentifiers: [{ identifier: '9788912345678' }], pageCount: 321 } }]
                })
            };
        }
    });
    const url = new URL(requestedUrl);
    assert.equal(url.searchParams.get('q'), 'isbn:9788912345678');
    assert.equal(pageCount, 321);
});
