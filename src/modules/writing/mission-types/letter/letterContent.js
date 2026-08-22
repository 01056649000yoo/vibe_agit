/**
 * 편지 구조화 콘텐츠의 원본. 학생 편집기·검증·PDF가 모두 이 함수를 통해 같은 모양을 본다.
 *
 * 편지는 `받는 사람`이 본문 속 문장이 아니라 **따로 담긴 칸**이다. 나중에 학급 안에서 편지를
 * 주고받는 기능을 붙일 때 이 칸이 배달 주소가 된다(지금은 저장만 하고 배달하지 않는다).
 */

export const LETTER_TEMPLATE_ID = 'letter';

export const LETTER_PARTS = Object.freeze([
    { key: 'recipient', label: '받는 사람', placeholder: '누구에게 쓰는 편지인가요?', rows: 1 },
    { key: 'greeting', label: '첫인사', placeholder: '안녕하세요, 로 시작하는 인사를 적어보세요.', rows: 2 },
    { key: 'body', label: '하고 싶은 말', placeholder: '꼭 전하고 싶은 말을 자세히 적어보세요.', rows: 8 },
    { key: 'closing', label: '끝인사', placeholder: '마지막으로 남기고 싶은 인사를 적어보세요.', rows: 2 },
]);

const cleanPart = (value) => String(value ?? '').replace(/\r\n?/g, '\n').trim();

/**
 * 저장된 구조화 콘텐츠를 네 칸으로 되돌린다.
 * 구조가 없던 시절의 글(또는 자유 글에서 옮겨온 글)은 본문 전체를 `하고 싶은 말`로 본다.
 */
export const normalizeLetterParts = (structuredContent, content = '') => {
    const source = structuredContent?.template === LETTER_TEMPLATE_ID ? structuredContent : null;
    if (!source) {
        return { recipient: '', greeting: '', body: cleanPart(content), closing: '' };
    }
    return {
        recipient: cleanPart(source.recipient),
        greeting: cleanPart(source.greeting),
        body: cleanPart(source.body),
        closing: cleanPart(source.closing),
    };
};

/** 네 칸을 하나의 본문 글로 잇는다. 글자 수·검색·목록 미리보기가 이 값을 쓴다. */
export const buildLetterContent = (parts) => [
    parts.recipient ? `${parts.recipient}에게` : '',
    parts.greeting,
    parts.body,
    parts.closing,
].map(cleanPart).filter(Boolean).join('\n\n');

export const createLetterStructuredContent = (parts) => ({
    template: LETTER_TEMPLATE_ID,
    version: 1,
    recipient: cleanPart(parts.recipient),
    greeting: cleanPart(parts.greeting),
    body: cleanPart(parts.body),
    closing: cleanPart(parts.closing),
});

/** 편지가 다 찼는지 본다. `받는 사람`과 `하고 싶은 말`은 비어 있으면 편지가 되지 않는다. */
export const validateLetterSubmission = ({ structuredContent, content, config = {} }) => {
    const parts = normalizeLetterParts(structuredContent, content);
    if (!parts.recipient) return '받는 사람을 적어주세요. 누구에게 쓰는 편지인가요? ✉️';
    if (!parts.greeting) return '첫인사를 적어주세요. 편지는 인사로 시작해요. ✉️';
    if (!parts.closing) return '끝인사를 적어주세요. 편지는 인사로 마무리해요. ✉️';

    const minChars = Math.max(0, Number(config.min_body_chars) || 0);
    if (parts.body.length < minChars) {
        return `하고 싶은 말을 ${minChars}자 이상 적어주세요! 지금은 ${parts.body.length}자예요. ✍️`;
    }
    return null;
};
