/**
 * 아직 안 준 선생님 선물 배지(2026-10-13) — 대시보드 메뉴와 놀이터 안 인형뽑기 메뉴가 같은 수를 쓴다.
 *
 * 수는 서버 `get_teacher_spelling_claw_gift_badge_v1` 이 센다(뽑기 내역의 `아직 안 준 선물` 과 같은 조건).
 * 교사가 뽑기 내역에서 `줬어요` 를 누르거나 내역을 새로 받으면 이 이벤트를 쏘아 대시보드가 다시 센다.
 */
export const CLAW_GIFTS_CHANGED_EVENT = 'teacher-claw-gifts-changed';

export const notifyClawGiftsChanged = () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CLAW_GIFTS_CHANGED_EVENT));
};
