/**
 * 회색 점선용 문단 나누기·결과 자리 맞추기(순수 함수, 노드 검사에서도 씀).
 *
 * 글 전체가 아니라 **바뀐 문단만** 서버에 보낸다. 문단 글을 열쇠로 결과를 기억해 두므로
 * 한 문단을 고치면 그 문단만 다시 묻고, 다른 문단의 회색 점선은 그대로 남는다.
 */
export const GRAY_MAX_PARAGRAPHS = 12;
export const GRAY_MAX_PARAGRAPH_CHARS = 1500;
export const GRAY_MAX_TOTAL_CHARS = 6000;

/** 글을 줄바꿈 단위 문단으로. 위치(start)는 JS 문자열 위치. 공백뿐인 줄은 뺀다. */
export const splitParagraphs = (text) => {
    const out = [];
    let start = 0;
    for (const line of String(text || '').split('\n')) {
        if (line.trim().length >= 2) out.push({ start, text: line });
        start += line.length + 1;
    }
    return out;
};

/** 아직 결과가 없는 문단 가운데 이번에 보낼 것(상한 안). 너무 긴 문단은 보내지 않는다. */
export const pickParagraphsToSend = (paragraphs, cache) => {
    const picked = [];
    let total = 0;
    for (const paragraph of paragraphs) {
        if (cache.has(paragraph.text) || paragraph.text.length > GRAY_MAX_PARAGRAPH_CHARS) continue;
        if (picked.some((item) => item.text === paragraph.text)) continue;
        if (picked.length >= GRAY_MAX_PARAGRAPHS || total + paragraph.text.length > GRAY_MAX_TOTAL_CHARS) break;
        picked.push(paragraph);
        total += paragraph.text.length;
    }
    return picked;
};

/** 기억해 둔 문단 결과를 지금 글의 자리로 옮긴다. 문단 글과 조각이 정확히 맞는 것만. */
export const placeGraySuggestions = (paragraphs, cache) => {
    const issues = [];
    for (const paragraph of paragraphs) {
        for (const item of cache.get(paragraph.text) || []) {
            if (paragraph.text.slice(item.start, item.end) !== item.original) continue;
            const start = paragraph.start + item.start;
            issues.push({
                id: `gray-${start}-${item.original}`,
                kind: 'gray',
                start,
                end: paragraph.start + item.end,
                text: item.original,
                original: item.original,
                suggestion: item.suggestion,
                category: item.category
            });
        }
    }
    return issues;
};

/** 빨간 줄과 겹치는 회색 점선·학생이 `그대로 두기` 한 것은 뺀다. */
export const visibleGrayIssues = (grayIssues, redIssues, dismissed) => grayIssues.filter((gray) => (
    !dismissed.has(`${gray.original}→${gray.suggestion}`)
    && !redIssues.some((red) => red.start < gray.end && red.end > gray.start)
));

/** 고친 글 — 그 자리가 여전히 원래 조각일 때만 바꾼다. */
export const applyGraySuggestion = (text, issue) => (
    text.slice(issue.start, issue.end) === issue.original
        ? `${text.slice(0, issue.start)}${issue.suggestion}${text.slice(issue.end)}`
        : null
);
