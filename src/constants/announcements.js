/*
 * 교사에게 보여 줄 공지의 나이 — 단일 원본.
 *
 * 지난 공지를 끝없이 쌓아 두면 목록이 길어져 **정작 새 공지가 묻힌다.** 2주가 지난
 * 공지를 굳이 다시 읽을 일은 없다(2026-09-13 사용자 판단).
 *
 * 같은 값을 두 곳에서 쓴다 — 화면이 직접 부르는 조회(`useAnnouncements`)와 로그인 때
 * 한 번에 받아 오는 `get_teacher_app_bootstrap_v1`. 한쪽만 고치면 로그인 직후와
 * 새로고침 뒤의 목록이 달라진다. `tests/announcementWindow.test.mjs` 가 둘을 함께 본다.
 *
 * 관리자 화면은 이 창을 쓰지 않는다 — 지난 공지도 고치고 지울 수 있어야 한다.
 */
export const ANNOUNCEMENT_VISIBLE_DAYS = 14;

/** 이 시각 이후에 올라온 공지만 교사에게 보여 준다. */
export const announcementVisibleSince = (now = Date.now()) => (
    new Date(now - ANNOUNCEMENT_VISIBLE_DAYS * 24 * 60 * 60 * 1000).toISOString()
);
