/*
 * 모두의 아지트 기한의 처음 값(2026-09-25 선생님 결정): **지금부터 7일 뒤 오후 5시**(교사 컴퓨터 시각 기준).
 * 같이 쓰기 광장 주제 기한과 문집 도서관 게시 기한이 함께 쓴다 — 한 곳에서만 정한다.
 * 돌려주는 값은 <input type="datetime-local"> 에 바로 넣는 'YYYY-MM-DDTHH:mm' 이다.
 */
export const DEFAULT_DEADLINE_DAYS = 7;
export const DEFAULT_DEADLINE_HOUR = 17;

const pad = (value) => String(value).padStart(2, '0');

export const defaultDeadlineInput = (base = new Date()) => {
    const at = new Date(base.getFullYear(), base.getMonth(), base.getDate() + DEFAULT_DEADLINE_DAYS, DEFAULT_DEADLINE_HOUR, 0, 0, 0);
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
};

// ISO 시각 → datetime-local 입력값. 없으면 빈 값.
export const isoToDeadlineInput = (iso) => {
    if (!iso) return '';
    const at = new Date(iso);
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
};
