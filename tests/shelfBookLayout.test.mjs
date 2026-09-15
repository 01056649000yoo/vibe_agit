import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    SHELF_BOOK_CHARS_PER_COLUMN,
    SHELF_BOOK_ELLIPSIS,
    SHELF_BOOK_HEIGHTS,
    SHELF_BOOK_LABEL_HEIGHT,
    SHELF_BOOK_LABEL_MIN_BOTTOM,
    SHELF_BOOK_LABEL_TOP,
    SHELF_BOOK_MAX_COLUMNS,
    SHELF_BOOK_TITLE_FONT,
    SHELF_BOOK_TRUNCATE_FROM,
    SHELF_BOOK_WIDTHS,
    shelfBookColumns,
    shelfBookHeight,
    shelfBookPalette,
    shelfBookTitle,
    shelfBookTitleCapacity,
    shelfBookWidth,
    stableBookVariant,
} from '../src/components/student/shelfBookLayout.js';

/*
 * 2026-09-15 제보: "서재의 책 모양이 맘에 안 들고 제목도 부실하다."
 * 긴 제목이 세로로 두세 줄로 쪼개져 읽는 순서가 뒤엉켰고("계절과 그 이유 / 내가 좋아하는"),
 * 글자는 태블릿 바닥(0.8rem) 아래였다. 그림 문제는 눈이 아니라 값으로 검사한다.
 *
 * 규칙은 세 줄이다:  8자까지 한 줄 / 9~16자 두 줄 / 17자부터 앞 9자 ⋯ 뒤 6자.
 * 이 숫자들이 바뀌면 도움말·안내도 함께 바꿔야 하므로 여기서 못 박는다.
 */
test('규칙은 세 줄이다 — 8자까지 한 줄, 9~16자 두 줄, 17자부터 앞뒤 남기고 줄임', () => {
    assert.equal(SHELF_BOOK_CHARS_PER_COLUMN, 8);
    assert.equal(SHELF_BOOK_MAX_COLUMNS, 2);
    assert.equal(SHELF_BOOK_TRUNCATE_FROM, 17);

    // 8자까지 한 줄
    assert.equal(shelfBookColumns('우리가족이야기'), 1);          // 7자
    assert.equal(shelfBookColumns('나의여름방학일기'), 1);        // 8자
    // 9자부터 두 줄
    assert.equal(shelfBookColumns('친구와다툰날의일기'), 2);      // 9자
    assert.equal(shelfBookColumns('가'.repeat(16)), 2);
    assert.equal(shelfBookColumns('가'.repeat(200)), 2, '두 줄이 끝이다');

    // 16자까지는 그대로, 17자부터 줄어든다
    const cap = shelfBookTitleCapacity(2);
    assert.equal(cap, 16);
    assert.equal(shelfBookTitle('가'.repeat(16), cap), '가'.repeat(16));
    const cut = shelfBookTitle('가'.repeat(17), cap);
    assert.equal(Array.from(cut).length, 16, '줄여도 16자 안이다');
    assert.ok(cut.includes(SHELF_BOOK_ELLIPSIS));
});

test('줄일 때는 앞 9자 ⋯ 뒤 6자를 남긴다 — 아이들 제목은 끝에 뜻이 실린다', () => {
    // 실제 운영 제목(띄어쓰기 뺀 것).
    const cases = [
        ['『유현준의세계건축대모험2:프랑스에펠탑과비밀의방』을읽고', '『유현준의세계건축⋯의방』을읽고'],
        ['박물관,미술관,체험관등에서아이들에게입장료를받지말자!', '박물관,미술관,체⋯를받지말자!'],
        ['내스마트폰에미래의날씨가아니라미래의나의운세를알려주는앱이생긴다면?', '내스마트폰에미래의⋯이생긴다면?'],
        ['선생님,오늘본격적으로만들기시작했는데내일이발표라고요?', '선생님,오늘본격적⋯발표라고요?'],
    ];
    for (const [title, expected] of cases) {
        const shown = shelfBookTitle(title);
        assert.equal(shown, expected);
        assert.equal(Array.from(shown).length, 16);
        // 끝 글자가 살아 있어야 한다 — "읽고", "말자!", "면?" 이 글의 종류를 말해 준다.
        assert.ok(shown.endsWith(Array.from(title).slice(-3).join('')), `끝이 안 보인다: ${shown}`);
    }

    // 세로 곧추쓰기에서 "…" 는 점이 세로로 서서 쌍점처럼 보인다. 가로 점(⋯)을 쓴다.
    assert.equal(SHELF_BOOK_ELLIPSIS, '⋯');

    // 띄어쓰기는 세로쓰기에서 한 칸을 통째로 먹는다. 실제 책등처럼 붙여 쓴다.
    assert.equal(shelfBookTitle('우리 가족 이야기'), '우리가족이야기');
});

/*
 * "여러 상황을 고려해서 책이 길어지거나 줄어들지 않게."
 * 운영 데이터: 제목의 40% 가 11자 이상, 가장 긴 것은 200자.
 * 책 크기는 제목과 무관한 **고정 집합**이어야 하고, 제목이 크기에 맞춰진다 — 반대가 아니다.
 */
test('어떤 제목이 와도 책은 폭 3종·키 4종 안에 있고, 라벨 높이는 모든 책에서 같다', () => {
    const titles = [
        '', '   ', '  \n\t  ', null, undefined, '봄',
        '우리 가족 이야기',
        'My Summer Vacation Story',
        '🌈 무지개를 본 날 🌈',
        '오늘은 정말 특별한 날이었다 '.repeat(20),
        'a'.repeat(2000),
        '한'.repeat(500),
    ];
    const widths = new Set(Object.values(SHELF_BOOK_WIDTHS));
    for (const title of titles) {
        assert.ok(widths.has(shelfBookWidth(title)), `폭이 집합 밖: ${String(title).slice(0, 20)}`);
        // 제목은 라벨을 절대 넘지 않는다.
        const shown = shelfBookTitle(title, shelfBookTitleCapacity(shelfBookColumns(title)));
        assert.ok(Array.from(shown).length <= 16, `라벨을 넘침: ${shown}`);
        assert.ok(Array.from(shown).length >= 1);
    }
    for (let variant = 0; variant < 12; variant += 1) {
        assert.ok(SHELF_BOOK_HEIGHTS.includes(shelfBookHeight(variant)), '키가 집합 밖');
    }
    // 키는 제목을 아예 받지 않는다.
    assert.equal(shelfBookHeight.length, 1, '키 계산이 제목을 받으면 크기가 흔들린다');
    assert.equal(shelfBookWidth('한'.repeat(500)), SHELF_BOOK_WIDTHS.wide, '200자여도 wide 가 끝');

    // 라벨은 모든 책에서 같은 높이이고, 가장 작은 책에도 들어간다.
    const smallest = Math.min(...SHELF_BOOK_HEIGHTS);
    assert.ok(
        SHELF_BOOK_LABEL_TOP + SHELF_BOOK_LABEL_HEIGHT + SHELF_BOOK_LABEL_MIN_BOTTOM <= smallest,
        `가장 작은 책(${smallest})에 라벨(${SHELF_BOOK_LABEL_HEIGHT})이 안 들어간다`
    );
});

test('제목의 별난 값을 모두 받아 낸다', () => {
    assert.equal(shelfBookTitle('  \n\t  '), '제목없는글');
    assert.equal(shelfBookTitle(undefined), '제목없는글');
    assert.equal(shelfBookTitle(null), '제목없는글');
    // 이모지는 한 글자로 센다 — 짝 문자를 반으로 잘라 깨진 글자를 만들지 않는다.
    assert.equal(shelfBookTitle('🌈무지개'), '🌈무지개');
    assert.equal(Array.from(shelfBookTitle('🌈'.repeat(30))).length, 16);
    // 용량이 터무니없이 작아도 두 글자는 남긴다(하나는 제목, 하나는 ⋯).
    assert.equal(shelfBookTitle('안녕하세요', 1), '안⋯');
    assert.equal(shelfBookTitle('안녕하세요', 0), '안⋯');
});

test('같은 책은 늘 같은 모양이고, 라벨은 어느 색 위에서도 읽히는 크림색이다', () => {
    const post = { id: 'abc-123', title: '봄 소풍' };
    assert.equal(stableBookVariant(post), stableBookVariant({ ...post }));
    // 같은 책장 안에서도 조금 들쭉날쭉해 벽돌담처럼 보이지 않는다.
    assert.notEqual(shelfBookHeight(0), shelfBookHeight(1));

    const colors = [['#111', '#222', '#333'], ['#444', '#555', '#666']];
    for (const palette of [shelfBookPalette(colors, 0), shelfBookPalette(colors, 1)]) {
        assert.match(palette.label, /^#F/i, '라벨은 밝은 크림색');
        assert.match(palette.band, /^#[EF]/i, '띠는 밝은 금색');
    }
});

test('글자 바닥을 지키고, 화면은 이 규칙만 쓴다', async () => {
    assert.equal(SHELF_BOOK_TITLE_FONT, 'var(--ui-text-xs)');

    const [book, panel] = await Promise.all([
        readFile('src/components/student/ShelfBook.jsx', 'utf8'),
        readFile('src/components/student/MyAgitPanel.jsx', 'utf8'),
    ]);
    // 제목이 뒤엉켰던 진짜 원인은 줄이 오른쪽부터 시작한 것(vertical-rl). 왼쪽부터(vertical-lr) 쓴다.
    assert.match(book, /writingMode: 'vertical-lr'/);
    assert.doesNotMatch(book, /writingMode: 'vertical-rl'/);
    // 영어 제목은 글자 사이에서 끊어야 두 번째 줄로 넘어간다.
    assert.match(book, /wordBreak: 'break-all'/);
    // 둘째 줄은 위에서 시작한다. 가운데 맞춤이면 "…의일 / 기" 의 "기" 가 허공에 뜬다.
    assert.match(book, /textAlign: 'start'/);
    // 글꼴이 세로쓰기에서 ⋯ 를 세로 점으로 바꿔 그린다. 줄임표만 세로 대체를 꺼서 가로 점으로 둔다.
    assert.match(book, /fontFeatureSettings: '"vert" 0, "vrt2" 0' }}>{SHELF_BOOK_ELLIPSIS}/);
    // 줄 수·용량은 공용 규칙에서 받는다. 화면이 따로 정하면 두 벌이 된다.
    assert.match(book, /shelfBookColumns\(fullTitle\)/);
    assert.match(book, /shelfBookTitle\(fullTitle, shelfBookTitleCapacity\(columns\)\)/);
    // 키는 제목과 무관하다.
    assert.match(book, /shelfBookHeight\(variant\)/);
    // 라벨 높이는 상수 하나다 — 책마다 다르게 계산하면 "몇 자부터" 를 말할 수 없다.
    assert.match(book, /height: `\$\{SHELF_BOOK_LABEL_HEIGHT\}px`/);
    // 잠금은 배지 위에 얹는다. 라벨 아래에 두면 라벨 자리를 뺏는다.
    assert.doesNotMatch(book, /bottom: `\$\{isPrivate/);
    assert.doesNotMatch(book, /fontSize: '\.7rem'/);
    // 패널은 책등을 여기서 가져다 쓴다.
    assert.match(panel, /import ShelfBook, \{ SHELF_SECTIONS \} from '\.\/ShelfBook'/);
    assert.doesNotMatch(panel, /const ShelfBook = /);
});
