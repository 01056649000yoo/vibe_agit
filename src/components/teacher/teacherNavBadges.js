import { TEACHER_NAV_GROUPS } from '../../constants/teacherNav.js';

/**
 * 교사 메뉴 배지 규칙 — 한 가지뿐이다(2026-09-26 UI 점검).
 *
 *   배지 = **처리할 일의 수**(빨간 숫자). 상단 메뉴 숫자 = 그 안 세부 메뉴 숫자의 합.
 *
 * 전에는 글쓰기 상단에 `NEW`, 그 안 `선생님 과제` 에는 숫자, 독서록에는 `NEW` 와 숫자가 함께 붙었다.
 * 쪽수를 확인할 책은 세부 메뉴에만 떠서 다른 메뉴에 있으면 알 수 없었다. 같은 뜻을 한 모양으로 보이게
 * 여기서 한 번에 센다 — 화면(대시보드)은 이 결과를 그리기만 한다.
 *
 * @param {Record<string, number>} tabCounts 세부 메뉴 id → 처리할 일 수
 * @returns {{ tabs: Record<string, number>, groups: Record<string, number> }}
 */
export const buildTeacherNavBadges = (tabCounts = {}) => {
    const tabs = {};
    const groups = {};
    for (const group of TEACHER_NAV_GROUPS) {
        let sum = 0;
        for (const tab of group.tabs) {
            const count = Math.max(0, Math.floor(Number(tabCounts[tab.id]) || 0));
            if (count > 0) tabs[tab.id] = count;
            sum += count;
        }
        if (sum > 0) groups[group.id] = sum;
    }
    return { tabs, groups };
};

/** 배지에 적는 글. 세 자리부터는 칸이 넘쳐 `99+` 로 줄인다. */
export const formatBadgeCount = (count) => (count > 99 ? '99+' : String(count));
