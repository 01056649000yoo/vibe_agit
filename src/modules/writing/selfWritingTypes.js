/**
 * 자율 글쓰기 유형의 화면 표현을 한 곳에 모은다.
 *
 * 예전에는 화면마다 `self_writing_type === 'reading_log'` 를 직접 적었다. 그래서 유형이 하나 늘 때
 * 서재·글 상세·친구 아지트·교사 화면을 전부 찾아다녀야 했고, 한 곳만 빠뜨려도 그 화면에서만
 * 새 글이 `자유글` 로 보였다. 새 유형을 붙일 때는 이 파일에만 항목을 추가한다.
 *
 * 서버 짝은 `public.writing_types` 이고, 완료 판정은 `writing_counts_as_completed()` 다.
 */

export const SELF_WRITING_TYPES = Object.freeze({
    reading_log: Object.freeze({
        id: 'reading_log',
        label: '독서록',
        icon: '📚',
        shelfTabLabel: '독서록 책장',
        emptyMessage: '완성한 독서록이 아직 없어요.',
        route: 'reading_logs'
    }),
    diary: Object.freeze({
        id: 'diary',
        label: '일기',
        icon: '📔',
        shelfTabLabel: '일기 책장',
        emptyMessage: '아직 쓴 일기가 없어요.',
        route: 'diaries'
    })
});

/** 어떤 유형에도 속하지 않는 자율 글이 사라지지 않게 받는 마지막 자리. */
export const FREE_WRITING_TYPE = Object.freeze({
    id: 'free',
    label: '자유글',
    icon: '✏️',
    shelfTabLabel: '자유글 책장',
    emptyMessage: '완성한 자유글이 아직 없어요.',
    route: null
});

const isSelfWriting = (post) => post?.writing_context === 'self';

/** 글의 자율 유형 정의. 자율 글이 아니면 `null` 이다. */
export const getSelfWritingType = (post) => {
    if (!isSelfWriting(post)) return null;
    return SELF_WRITING_TYPES[post?.self_writing_type] || FREE_WRITING_TYPE;
};
