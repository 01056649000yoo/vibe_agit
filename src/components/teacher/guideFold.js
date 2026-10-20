/*
 * 안내서 한 항목이 길 때 **첫 문장만 먼저** 보이게 나눈다(2026-10-20, "글이 한 화면에 너무 많다").
 * 강조 표기(`**굵게**`, `버튼 이름`)가 한가운데서 잘리지 않게 표기가 짝이 맞는 자리에서만 자른다.
 * 나눌 만한 자리가 없거나 뒤에 남는 말이 너무 짧으면 나누지 않는다 — 접을 가치가 없다.
 */
export const GUIDE_FOLD_MIN_LENGTH = 110;
const MIN_LEAD = 14;
const MIN_REST = 30;

const plainLength = (text) => text.replace(/\*\*|`/g, '').length;
const isBalanced = (text) => (text.match(/\*\*/g) || []).length % 2 === 0 && (text.match(/`/g) || []).length % 2 === 0;

export const splitGuideLead = (text) => {
    const source = String(text ?? '');
    if (plainLength(source) < GUIDE_FOLD_MIN_LENGTH) return { lead: source, rest: '' };
    // 문장 끝 기호 바로 뒤에 닫는 강조 표기(`**`·백틱)가 붙어도 경계로 본다.
    for (const match of source.matchAll(/[.!?](?:\*\*|`)?(?=\s)/g)) {
        const end = match.index + match[0].length;
        const lead = source.slice(0, end);
        const rest = source.slice(end).trim();
        if (plainLength(lead) >= MIN_LEAD && plainLength(rest) >= MIN_REST && isBalanced(lead)) {
            return { lead, rest };
        }
    }
    return { lead: source, rest: '' };
};
