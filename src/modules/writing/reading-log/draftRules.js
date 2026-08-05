/**
 * 독서록 초안 판정과 책 선택 규칙.
 *
 * 화면에서 빼낸 이유: 새 독서록은 `postId` 도 책 열쇠도 없어 모두 `new` 라는 초안 자리를
 * 함께 쓴다. 그래서 "무엇을 초안으로 볼 것인가" 를 조금만 헐겁게 잡아도 지난번에 검색한 책이
 * 다음 학생 화면에 그대로 되살아난다. 실제로 그 일이 있었고, 브라우저 없이도 확인할 수 있도록
 * 규칙만 따로 두고 테스트한다.
 */

/** 책을 고르면 대신 채워 주는 제목. */
export const autoTitleFor = (book) => `『${book.title}』을 읽고`;

/**
 * 지금 제목이 "학생이 쓴 것이 아니라 대신 채워 준 것"인가.
 *
 * `titleAutoFilled` 표시만 믿지 않고 제목 모양으로도 판별한다.
 * 이 표시가 생기기 전에 태블릿에 남은 초안에는 표시가 없어서, 표시만 보면
 * 자동 제목이 `학생이 지은 제목` 으로 취급돼 책을 바꿔도 옛 책 이름이 그대로 남았다.
 */
export const isAutoTitle = (title, book) => {
    const clean = String(title || '').trim();
    if (!clean) return true;
    return Boolean(book?.title) && clean === autoTitleFor(book);
};

/**
 * 이 화면 내용을 초안으로 남길 만한가.
 *
 * 책을 고를 때 자동으로 붙는 제목은 학생이 쓴 글이 아니므로 세지 않는다.
 * 이것을 세면 책만 검색해 보고 나가도 초안이 생겨 다음 진입 때 그 책이 올라온다.
 */
export const readingDraftHasContent = (candidate) => Boolean(
    candidate?.content?.trim()
    || (candidate?.title?.trim()
        && !candidate?.titleAutoFilled
        && !isAutoTitle(candidate.title, candidate.selectedBook))
);

/** 학생이 직접 지은 제목인가. 표시가 없어도 제목 모양으로 함께 판별한다. */
export const hasCustomTitle = (form) => Boolean(form?.title?.trim())
    && !form?.titleAutoFilled
    && !isAutoTitle(form.title, form.selectedBook);

/**
 * 책을 고르거나(`book`) 비울 때(`null`) 폼이 어떻게 바뀌는지.
 *
 * **책을 바꾸면 제목은 기본적으로 새 책 이름으로 갈아 끼운다.** 예전에는 `자동 제목인지` 를
 * 먼저 따졌는데, 그 판정이 한 군데라도 어긋나면 옛 책 이름이 그대로 남아 학생이 혼란스러웠다.
 * 판정을 조건으로 두지 않고, 학생이 직접 지은 제목일 때만 부르는 쪽에서 `keepCustomTitle` 로
 * 지키게 한다(화면에서는 물어보고 정한다). 책을 비울 때는 새 이름이 없으므로 늘 지킨다.
 */
export const applyBookSelection = (form, book, { keepCustomTitle = false } = {}) => {
    const keep = hasCustomTitle(form) && (keepCustomTitle || !book);

    return {
        ...form,
        selectedBook: book,
        title: keep ? form.title : (book ? autoTitleFor(book) : ''),
        titleAutoFilled: Boolean(book) && !keep
    };
};
