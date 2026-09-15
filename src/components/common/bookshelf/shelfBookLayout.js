/*
 * 책등의 크기·제목 규칙. 화면(.jsx) 밖에 둔 이유는 `node --test` 가 직접 부르기 위해서다.
 *
 * 책등은 세 화면이 같이 쓴다 — 학생의 내 서재, 선생님의 학생 아지트 보기, 친구 아지트의 공개 서재.
 * 전에는 세 화면이 각자 책을 그려서 한 곳을 고치면 나머지 둘은 옛 모양으로 남았다(2026-09-15).
 *
 * 2026-09-15 제보: "책 모양이 맘에 안 들고 제목도 부실하다."
 *   긴 제목이 세로로 두세 줄로 쪼개져 읽는 순서가 뒤엉켰다("계절과 그 이유 / 내가 좋아하는").
 *   실제 책등처럼 종이 라벨에 쓰고, 넘치면 줄인다.
 *
 * 지키는 원칙 셋
 *   1. 책 크기는 제목과 무관한 **고정 집합**이다(폭 3종 × 키 4종). 제목이 크기에 맞춰진다 — 반대가 아니다.
 *   2. 라벨 높이는 **모든 책에서 같다.** 그래서 "몇 자부터 줄어드는지" 를 한 줄로 말할 수 있다.
 *      (키 차이는 라벨 아래 여백으로 간다. 잠금 표시는 위 배지에 얹어 라벨 자리를 뺏지 않는다.)
 *   3. 줄이면 **앞과 뒤를 남긴다.** 아이들 제목은 끝에 뜻이 실린다 — `⋯을 읽고`, `⋯받지 말자!`, `⋯생긴다면?`
 *
 * 그래서 규칙은 이것뿐이다:
 *   · 8자까지        한 줄
 *   · 9~16자         두 줄 (책이 넓어진다)
 *   · 17자부터       앞 9자 ⋯ 뒤 6자  (모두 16자)
 */

/** 폭은 세 단계뿐. 제목이 길면 넓은 쪽을 고르지만 `wide` 가 끝이다 — 200자여도 62px. */
export const SHELF_BOOK_WIDTHS = Object.freeze({ slim: 46, regular: 54, wide: 62 });

/** 키는 제목과 무관하다. 책마다 정해진 네 단계 가운데 하나이고, 어떤 제목이 와도 바뀌지 않는다. */
export const SHELF_BOOK_HEIGHTS = Object.freeze([180, 186, 192, 198]);
export const SHELF_BOOK_MAX_HEIGHT = Math.max(...SHELF_BOOK_HEIGHTS);

/** 글자 바닥. 태블릿에서 아이가 읽는 화면이라 0.8rem 아래로 내리지 않는다. */
export const SHELF_BOOK_TITLE_FONT = 'var(--ui-text-xs)';

/** 세로쓰기 한 글자가 차지하는 높이(0.8rem ≈ 12.8px + 자간). */
export const SHELF_BOOK_CHAR_HEIGHT = 13.3;

/** 라벨 한 줄에 들어가는 글자 수. 이 하나가 모든 책에서 같다. */
export const SHELF_BOOK_CHARS_PER_COLUMN = 8;

/** 라벨의 세로 줄 수. 넓은 책만 두 줄이다. */
export const SHELF_BOOK_MAX_COLUMNS = 2;

/** 라벨 안쪽 여백(위아래 합). */
export const SHELF_BOOK_LABEL_INSET = 6;

/** 라벨 높이 — 모든 책에서 같다. 가장 작은 책(168)에도 들어가야 한다. */
export const SHELF_BOOK_LABEL_HEIGHT = Math.ceil(SHELF_BOOK_CHARS_PER_COLUMN * SHELF_BOOK_CHAR_HEIGHT + SHELF_BOOK_LABEL_INSET);

/** 라벨 위 자리(머리띠·배지). 라벨은 여기서 시작하고, 남는 키는 라벨 아래로 간다. */
export const SHELF_BOOK_LABEL_TOP = 38;

/**
 * 라벨 아래 쪽지 한 줄(친구 서재의 `♡ 3` 같은 것). 글자 바닥(0.8rem)을 지키는 높이이고,
 * 쪽지가 없는 책도 이 자리를 비워 둔다 — 그래야 쪽지 유무로 라벨 자리가 흔들리지 않는다.
 */
export const SHELF_BOOK_NOTE_GAP = 3;
export const SHELF_BOOK_NOTE_HEIGHT = 14;
/** 꼬리띠(3px)와 그 아래 여백(6px). */
export const SHELF_BOOK_TAIL = 9;
export const SHELF_BOOK_LABEL_MIN_BOTTOM = SHELF_BOOK_NOTE_GAP + SHELF_BOOK_NOTE_HEIGHT + SHELF_BOOK_TAIL;

/** 책을 꽂는 줄의 최소 높이 — 가장 큰 책 + 위 여백. 책장 세 곳이 같은 값을 쓴다. */
export const SHELF_ROW_PADDING_TOP = 14;
export const SHELF_ROW_MIN_HEIGHT = SHELF_BOOK_MAX_HEIGHT + SHELF_ROW_PADDING_TOP;

/** 말줄임 표시. 세로 곧추쓰기에서 "…" 는 점 세 개가 세로로 서서 쌍점처럼 보여, 가로 점 세 개(⋯)를 쓴다. */
export const SHELF_BOOK_ELLIPSIS = '⋯';

/** 줄일 때 앞뒤 비율. 앞은 주제, 뒤는 글의 종류·태도가 온다. */
export const SHELF_BOOK_HEAD_RATIO = 0.6;

export const stableBookVariant = (post) => String(post?.id || post?.title || '')
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

/** 책등에 실제로 쓰는 글자들 — 띄어쓰기·줄바꿈은 뺀다(세로쓰기에서 한 칸을 통째로 먹는다). */
export const shelfBookTitleChars = (title) => {
    const chars = Array.from(String(title ?? '').replace(/\s+/g, ''));
    return chars.length > 0 ? chars : Array.from('제목없는글');
};

export const shelfBookTitleLength = (title) => shelfBookTitleChars(title).length;

/** 한 줄에 들어가면 한 줄, 아니면 두 줄. 그 이상은 없다. */
export const shelfBookColumns = (title) => (
    shelfBookTitleLength(title) <= SHELF_BOOK_CHARS_PER_COLUMN ? 1 : SHELF_BOOK_MAX_COLUMNS
);

/** 라벨에 들어가는 최대 글자 수 = 줄 수 × 한 줄 글자 수. 책 키와 무관하다. */
export const shelfBookTitleCapacity = (columns = 1) => (
    Math.max(1, Math.min(columns, SHELF_BOOK_MAX_COLUMNS)) * SHELF_BOOK_CHARS_PER_COLUMN
);

/** 몇 자부터 줄어드는가 — 화면 밖에서도 같은 숫자를 쓰도록 한 곳에 둔다. */
export const SHELF_BOOK_TRUNCATE_FROM = shelfBookTitleCapacity(SHELF_BOOK_MAX_COLUMNS) + 1;

export const shelfBookWidth = (title) => {
    const length = shelfBookTitleLength(title);
    if (length > SHELF_BOOK_CHARS_PER_COLUMN) return SHELF_BOOK_WIDTHS.wide;
    if (length > 4) return SHELF_BOOK_WIDTHS.regular;
    return SHELF_BOOK_WIDTHS.slim;
};

export const shelfBookHeight = (variant) => SHELF_BOOK_HEIGHTS[Math.abs(variant) % SHELF_BOOK_HEIGHTS.length];

/**
 * 어떤 제목이 와도 라벨을 넘지 않는다.
 *  - 빈 제목·빈칸만 있는 제목 → "제목없는글"
 *  - 이모지·한자·영문은 글자 하나로 센다(Array.from 이 짝 문자를 한 글자로 본다)
 *  - 넘치면 **앞 9자 ⋯ 뒤 6자**. 200자든 2,000자든 같은 모양이다.
 *
 * 앞뒤를 남기는 까닭: 실제 제목을 보니 끝에 뜻이 실린다.
 *   앞만  『유현준의세계건축대모험2:프랑스에펠⋯   ← 뭘 한 건지 모름
 *   앞뒤  『유현준의세계건축⋯밀의방』을읽고     ← "읽고" 가 보임
 */
export const shelfBookTitle = (title, maxChars = shelfBookTitleCapacity(SHELF_BOOK_MAX_COLUMNS)) => {
    const chars = shelfBookTitleChars(title);
    const limit = Math.max(2, Math.floor(maxChars));
    if (chars.length <= limit) return chars.join('');
    const keep = limit - 1;                                   // ⋯ 한 자리를 뺀 나머지
    const head = Math.max(1, Math.ceil(keep * SHELF_BOOK_HEAD_RATIO));
    const tail = Math.max(0, keep - head);
    return `${chars.slice(0, head).join('')}${SHELF_BOOK_ELLIPSIS}${tail > 0 ? chars.slice(-tail).join('') : ''}`;
};

/**
 * 같은 갈래 안에서도 책이 서로 달라 보이게 세 벌의 색 가운데 하나를 고르고,
 * 라벨(종이 띠)은 밝은 크림색으로 두어 어느 색 위에서든 제목이 읽히게 한다.
 */
export const shelfBookPalette = (colors, variant) => {
    const [light, middle, dark] = colors[variant % colors.length];
    return {
        light, middle, dark,
        label: variant % 2 === 0 ? '#FFF8E7' : '#FBF3DF',
        band: variant % 3 === 0 ? '#E9C97A' : '#F3DFA6',
    };
};

/*
 * 책장 넘기기(2026-09-15). "밀어서 다음 책을 보는 애니메이션."
 * 한 칸에는 **그 책장 폭에 들어가는 만큼** 꽂는다 — 처음엔 12권 상한을 뒀더니 선생님 화면처럼 넓은 책장에서
 * 오른쪽이 비었다("빈칸 없도록"). 책은 절대 줄이지 않고 잘리지도 않으므로, 칸 나누기는 책 폭의 합으로 정한다.
 * 폭을 아직 못 쟀을 때만 12권씩 끊는다.
 */
export const SHELF_PAGE_FALLBACK_BOOKS = 12;
export const SHELF_ROW_GAP = 5;
export const SHELF_ROW_PADDING_X = 12;

const shelfUsableWidth = (innerWidth) => (innerWidth > 0 ? innerWidth - SHELF_ROW_PADDING_X * 2 : Infinity);

/**
 * 책들을 칸(page)으로 나눈다. 앞에서부터 차례로 채우고, 폭이 차면 다음 칸.
 * @param items      책이 될 것들(글)
 * @param innerWidth 책을 꽂는 줄의 안쪽 폭(px). 0 이하(아직 못 잼)면 폭은 무시하고 12권씩 끊는다
 * @param widthOf    책 한 권의 폭을 주는 함수. 기본은 제목으로 정하는 규칙
 */
export const shelfPages = (items, innerWidth, widthOf = (item) => shelfBookWidth(item?.title)) => {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) return [];
    const usable = shelfUsableWidth(innerWidth);
    const cap = innerWidth > 0 ? Infinity : SHELF_PAGE_FALLBACK_BOOKS;
    const pages = [];
    let page = [];
    let filled = 0;
    for (const item of list) {
        const width = widthOf(item);
        const next = page.length === 0 ? width : filled + SHELF_ROW_GAP + width;
        if (page.length > 0 && (page.length >= cap || next > usable)) {
            pages.push(page);
            page = [];
            filled = width;
        } else {
            filled = next;
        }
        page.push(item);
    }
    if (page.length > 0) pages.push(page);
    return pages;
};

/**
 * 칸이 꽉 찼는가 — 가장 얇은 책 한 권도 더 못 들어가면 꽉 찬 것이다.
 * 꽉 찬 칸은 남는 몇 px 를 책 사이에 고르게 나눠 오른쪽에 빈자리가 없게 하고, 덜 찬 마지막 칸은 왼쪽부터 붙여 꽂는다.
 */
export const shelfPageIsFull = (page, innerWidth, widthOf = (item) => shelfBookWidth(item?.title)) => {
    const list = Array.isArray(page) ? page : [];
    if (list.length === 0 || !(innerWidth > 0)) return false;
    const filled = list.reduce((sum, item, index) => sum + widthOf(item) + (index > 0 ? SHELF_ROW_GAP : 0), 0);
    return filled + SHELF_ROW_GAP + SHELF_BOOK_WIDTHS.slim > shelfUsableWidth(innerWidth);
};
