import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    KAKAO_BOOK_COVER_HOST,
    KAKAO_BOOK_COVER_TRANSFORM,
    normalizeBookCoverUrl,
} from '../src/modules/writing/reading-log/bookCoverUrl.js';

test('Kakao 책 표지는 화면 크기에 맞는 웹용 썸네일로 고정한다', () => {
    const original = 'https://search1.kakaocdn.net/thumb/C640x800.q100/?fname=http%3A%2F%2Ft1.daumcdn.net%2Flbook%2Fimage%2F541005';
    const optimized = new URL(normalizeBookCoverUrl(original));

    assert.equal(optimized.hostname, KAKAO_BOOK_COVER_HOST);
    assert.equal(optimized.pathname, `/thumb/${KAKAO_BOOK_COVER_TRANSFORM}/`);
    assert.equal(
        optimized.searchParams.get('fname'),
        'http://t1.daumcdn.net/lbook/image/541005',
    );
});

test('책 표지는 HTTPS만 허용하고 다른 HTTPS 출처는 훼손하지 않는다', () => {
    assert.equal(normalizeBookCoverUrl('http://example.test/cover.jpg'), '');
    assert.equal(normalizeBookCoverUrl('not-a-url'), '');
    assert.equal(
        normalizeBookCoverUrl('https://example.test/cover.jpg'),
        'https://example.test/cover.jpg',
    );
});

test('독서록 표지는 지연 로딩과 비동기 디코딩을 사용한다', async () => {
    const [bookCover, postDetail, shelfDetail] = await Promise.all([
        readFile('src/modules/writing/reading-log/BookCover.jsx', 'utf8'),
        readFile('src/components/student/PostDetailModal.jsx', 'utf8'),
        readFile('src/components/student/MyShelfPostDetail.jsx', 'utf8'),
    ]);

    [bookCover, postDetail, shelfDetail].forEach((source) => {
        assert.match(source, /normalizeBookCoverUrl/);
        assert.match(source, /loading="lazy"/);
        assert.match(source, /decoding="async"/);
        assert.match(source, /referrerPolicy="no-referrer"/);
    });
});
