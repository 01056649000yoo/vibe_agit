import { useCallback, useState } from 'react';

/*
 * 뽑은 결과를 교사가 손볼 수 있게 한다.
 *
 * 다시 뽑으면 반 전체가 바뀌지만, 실제로 고칠 곳은 대개 한두 자리다(2026-08-24 요청).
 * 그래서 **두 사람을 골라 서로 바꾸기**만 한다. 인원수·역할 칸 수는 그대로 유지한다.
 * 교사 편집은 랜덤 배정을 수업 상황에 맞게 보완하는 권한이므로 조건 점수를 다시 계산하지 않는다.
 */

/** 두 칸에 앉은 학생을 서로 바꾼다. 칸(자리·역할 자리)은 그대로 두고 **사람만** 옮긴다. */
export function swapStudents(assignments, keyOf, keyA, keyB) {
    if (keyA === keyB) return assignments;
    const first = assignments.find((item) => keyOf(item) === keyA);
    const second = assignments.find((item) => keyOf(item) === keyB);
    if (!first || !second) return assignments;
    return assignments.map((item) => {
        if (item === first) return { ...item, studentId: second.studentId, studentName: second.studentName, group: second.group || null };
        if (item === second) return { ...item, studentId: first.studentId, studentName: first.studentName, group: first.group || null };
        return item;
    });
}

/**
 * 한 번 누르면 고르고, 다른 칸을 누르면 서로 바꾼다. 같은 칸을 다시 누르면 고르기를 푼다.
 *
 * 고른 값을 상태 갱신 함수 **밖에서** 읽는다. 갱신 함수 안에서 다른 상태를 바꾸면
 * 개발 모드에서 두 번 불려 두 번 맞바꿔 제자리로 돌아오는 일이 생긴다.
 */
export function useResultSwap(keyOf, setAssignments) {
    const [pickedKey, setPickedKey] = useState(null);
    const [edited, setEdited] = useState(false);

    const pick = useCallback((key) => {
        if (pickedKey === null) { setPickedKey(key); return; }
        if (pickedKey === key) { setPickedKey(null); return; }
        setAssignments((list) => swapStudents(list, keyOf, pickedKey, key));
        setEdited(true);
        setPickedKey(null);
    }, [keyOf, pickedKey, setAssignments]);

    /** 뽑기를 새로 시작하거나 고친 결과를 저장한 뒤에 부른다. */
    const reset = useCallback(() => { setPickedKey(null); setEdited(false); }, []);

    return { pickedKey, edited, pick, reset };
}
