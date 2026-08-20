const SENTENCE_MARK = /[.!?。！？\n\r]/;
const URL_OR_EMAIL = /(?:https?:\/\/|www\.|@)/i;

const isHangulCharacter = (character) => {
    const code = character.codePointAt(0);
    return character === ' '
        || (code >= 0xAC00 && code <= 0xD7A3)
        || (code >= 0x3131 && code <= 0x318E);
};

const isHangulExpression = (value) => [...value].every(isHangulCharacter);
const isRepeatedCharacter = (value) => value.length >= 3
    && [...value].every((character) => character === value[0]);

export const normalizeSpellingCandidate = (value) => String(value || '')
    .normalize('NFC')
    .toLocaleLowerCase('ko-KR')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * 미등록 검색을 서버에 보내기 전에 가볍게 분류한다.
 * 문장과 무의미한 입력은 원문을 보내지 않고, 짧은 한글 표현만 후보로 남긴다.
 */
export const classifySpellingSearchQuery = (value, { dictionaryMatched = false } = {}) => {
    const expression = normalizeSpellingCandidate(value);
    if (!expression) return { kind: 'ignored', display: '' };
    if (dictionaryMatched) return { kind: 'dictionary', display: '' };

    const compact = expression.replace(/\s/g, '');
    const wordCount = expression.split(' ').length;
    if (
        compact.length < 2
        || URL_OR_EMAIL.test(expression)
        || /[0-9]/.test(expression)
        || isRepeatedCharacter(compact)
    ) {
        return { kind: 'ignored', display: '' };
    }

    if (expression.length > 15 || wordCount > 2 || SENTENCE_MARK.test(value)) {
        return { kind: 'sentence', display: '' };
    }
    if (!isHangulExpression(expression)) return { kind: 'ignored', display: '' };

    return { kind: 'candidate', display: expression };
};
