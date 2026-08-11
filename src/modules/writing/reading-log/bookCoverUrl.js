export const KAKAO_BOOK_COVER_HOST = 'search1.kakaocdn.net';
export const KAKAO_BOOK_COVER_TRANSFORM = 'R120x174.q85';

/**
 * 책 표지는 선택 화면의 최대 112×162px에 맞는 Kakao CDN 썸네일만 사용한다.
 * 원본 이미지 주소로 바뀌어 들어와도 브라우저가 큰 파일을 받지 않도록 변환 경로를 고정한다.
 */
export const normalizeBookCoverUrl = (value) => {
    const rawUrl = String(value || '').trim();
    if (!rawUrl) return '';

    try {
        const url = new URL(rawUrl);
        if (url.protocol !== 'https:') return '';
        if (url.hostname === KAKAO_BOOK_COVER_HOST) {
            url.pathname = url.pathname.replace(
                /^\/thumb\/[^/]+\//,
                `/thumb/${KAKAO_BOOK_COVER_TRANSFORM}/`,
            );
        }
        return url.toString();
    } catch {
        return '';
    }
};
