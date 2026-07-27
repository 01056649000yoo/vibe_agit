/**
 * AI 피드백 응답 안전장치.
 *
 * 프롬프트를 "맞춤법만 봐줘"처럼 좁게 쓰면, 지적할 게 없을 때 모델이
 * 피드백 대신 **학생 글 본문을 그대로 되돌려주는** 일이 생긴다.
 * 그대로 저장되면 학생에게 자기 글이 피드백으로 보이므로 여기서 걸러낸다.
 */

/** 비교용 정규화 — 공백·문장부호·따옴표 차이를 무시한다 */
function normalize(text) {
    return String(text || '')
        .replace(/[\s​]+/g, '')
        .replace(/["'“”‘’.,!?~·…\-—]/g, '')
        .toLowerCase();
}

/**
 * AI 응답이 사실상 학생 본문의 재출력인지 판단.
 * @param {string} feedback AI 응답
 * @param {string} content  학생이 쓴 글
 * @returns {boolean}
 */
export function isEchoOfContent(feedback, content) {
    const f = normalize(feedback);
    const c = normalize(content);
    if (!f || !c || c.length < 20) return false; // 너무 짧으면 판단 불가

    // 1) 응답이 본문과 거의 같음
    if (f === c) return true;
    // 2) 응답이 본문을 통째로 담고 있고, 덧붙인 설명이 거의 없음 (본문의 1.2배 미만)
    if (f.includes(c) && f.length < c.length * 1.2) return true;
    // 3) 본문이 응답을 담고 있음(본문 일부만 잘라 되돌린 경우)
    if (c.includes(f) && f.length > c.length * 0.8) return true;

    return false;
}

/** 오류가 없을 때 학생에게 보여줄 기본 안내 */
export const NO_ISSUE_FEEDBACK =
    '안녕! 선생님이야 😊\n\n네 글을 꼼꼼히 살펴봤는데, 고칠 곳을 찾지 못했어. 정말 잘 썼구나! 👏\n\n앞으로도 지금처럼 자신 있게 써 보자.';

/**
 * 응답을 검사해 안전한 값으로 만든다.
 * 본문 재출력이면 대체 문구를 돌려주고, 아니면 원래 응답을 그대로 쓴다.
 */
export function sanitizeFeedback(feedback, content) {
    if (isEchoOfContent(feedback, content)) return NO_ISSUE_FEEDBACK;
    return feedback;
}
