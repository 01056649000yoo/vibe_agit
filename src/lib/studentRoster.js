/*
 * 붙여넣은 명단에서 학생 이름만 골라낸다.
 *
 * 왜 필요한가 (2026-09-14 사용자 분석): 학급까지 만든 교사 505명 중 학생을 등록한 사람은
 * 168명뿐이고, 학생 0명으로 멈춘 337명 가운데 다시 들어온 사람은 2명이었다. 명단은 이미
 * 나이스·엑셀·한글에 있는데 한 명씩 치게 해 둔 탓이다.
 *
 * 그래서 **선생님이 가진 모양 그대로** 받는다. 엑셀에서 두 칸을 긁으면 `1\t김민준`,
 * 한글 표에서는 `1. 김민준`, 손으로 적으면 `김민준, 이서연` 이다. 번호는 떼고 이름만 남긴다.
 */

export const STUDENT_ROSTER_MAX = 60;
export const STUDENT_NAME_MAX = 30;

// 줄 앞의 번호를 뗀다: "1", "1.", "1)", "01 ", "1\t" — 이름 앞의 숫자는 출석 번호다.
const LEADING_NUMBER = /^\s*\d{1,3}\s*[.)\-:\t]?\s+|^\s*\d{1,3}\s*[.)\-:]\s*/u;

/**
 * @returns {{ names: string[], dropped: { value: string, reason: string }[] }}
 *   `names` 는 화면에 보여 줄 순서 그대로다. 지운 것은 **왜 지웠는지**와 함께 돌려준다 —
 *   조용히 빼면 선생님은 스물여덟 명을 붙여넣고 스물여섯 명이 들어온 것을 모른다.
 */
export function parseStudentRoster(text) {
    const names = [];
    const dropped = [];
    const rows = String(text || '')
        // 한 줄에 쉼표로 이어 적는 경우도 흔하다. 줄바꿈과 같게 본다.
        .split(/[\n\r,;]+/u)
        .map((row) => row.replace(LEADING_NUMBER, '').replace(/\s+/gu, ' ').trim());

    for (const row of rows) {
        if (!row) continue;
        if (names.length >= STUDENT_ROSTER_MAX) {
            dropped.push({ value: row, reason: `한 번에 ${STUDENT_ROSTER_MAX}명까지 넣을 수 있어요` });
            continue;
        }
        if (row.length > STUDENT_NAME_MAX) {
            dropped.push({ value: row, reason: `이름이 ${STUDENT_NAME_MAX}자를 넘어요` });
            continue;
        }
        // 숫자만 남은 줄은 번호 칸을 따로 긁어 온 것이다. 이름이 아니다.
        if (/^\d+$/u.test(row)) {
            dropped.push({ value: row, reason: '번호만 있어요' });
            continue;
        }
        names.push(row);
    }
    return { names, dropped };
}

/** 이 학급에 이미 있는 이름. 실수로 두 번 붙여넣는 것을 막되, 동명이인은 막지 않는다. */
export function findExistingNames(names, students) {
    const already = new Set((students || []).map((student) => String(student?.name || '').trim()));
    return names.filter((name) => already.has(name));
}
