/**
 * 작가 레벨.
 *
 * 대시보드 훅과 발자국 화면이 같은 정의를 보도록 한 곳에 둔다.
 * (예전에는 훅 안에만 있어서, 다른 화면에서 레벨을 보여 주려면 계산을 베껴야 했다.)
 *
 * ⚠️ 지금 기준은 **누적 글자 수 하나**다. 길게 쓰기만 하면 오르고,
 * 꾸준히 쓴 날·고쳐 쓰기·친구와 나눈 기록은 레벨에 반영되지 않는다.
 * 개선 계획은 WORKLOG "작가 레벨 개편 계획" 항목 참고.
 */
export const WRITER_LEVELS = [
    { level: 1, name: '새싹 작가', emoji: '🌱', from: 0 },
    { level: 2, name: '초보 작가', emoji: '🌿', from: 1401 },
    { level: 3, name: '숙련 작가', emoji: '🌳', from: 4201 },
    { level: 4, name: '대문호', emoji: '👑', from: 8401 },
    { level: 5, name: '전설의 작가', emoji: '✨', from: 14001 }
];

/**
 * @param {number} totalChars 누적 글자 수
 * @returns {{level:number, name:string, emoji:string, from:number, next:number|null}}
 */
export const getWriterLevel = (totalChars = 0) => {
    const chars = Number(totalChars) || 0;
    const index = WRITER_LEVELS.reduce(
        (found, item, i) => (chars >= item.from ? i : found),
        0
    );
    const current = WRITER_LEVELS[index];
    const upcoming = WRITER_LEVELS[index + 1];
    return { ...current, next: upcoming ? upcoming.from : null };
};
