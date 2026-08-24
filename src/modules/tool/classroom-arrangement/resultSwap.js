import { useCallback, useState } from 'react';

/*
 * 뽑은 결과를 교사가 손볼 수 있게 한다.
 *
 * 다시 뽑으면 반 전체가 바뀌지만, 실제로 고칠 곳은 대개 한두 자리다(2026-08-24 요청).
 * 그래서 **두 사람을 골라 서로 바꾸기**만 한다. 인원수·역할 칸 수는 그대로 유지한다.
 * 교사 편집은 랜덤 배정을 수업 상황에 맞게 보완하는 권한이므로 조건 점수를 다시 계산하지 않는다.
 *
 * ⚠️ 자리와 역할은 **같은 편집 흐름을 두 벌** 갖고 있었다(2026-08-24 점검에서 확인).
 *    맞바꾸기·수정본 저장·기록 연결을 양쪽에 복사해 두면 한쪽만 고치는 실수가 난다.
 *    그래서 흐름 전체를 `useEditableResult` 하나에 모으고, 화면은 **무엇을 저장할지**만 넘긴다.
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

/**
 * 맞바꾸기 + 수정본 기록까지 한 벌로 묶는다. 자리와 역할이 **이것 하나만** 쓴다.
 *
 * 랜덤 원본은 지우지 않고 남긴다. 다시 고칠 때는 직전 수정본만 갈아 끼우므로
 * 지난 기록에는 `랜덤 원본 1개 + 최신 수정본 1개` 만 쌓인다.
 *
 * `kind` 는 기록 종류(`seat`·`role`)이고, 저장할 내용은 화면이 `save` 에 넘긴다.
 */
export function useEditableResult({ keyOf, kind, setAssignments, onSaveEditedHistory }) {
    const swap = useResultSwap(keyOf, setAssignments);
    // 랜덤 원본은 보존하고, 교사가 고친 최신 수정본만 따로 연결해 저장한다.
    const [randomHistoryId, setRandomHistoryId] = useState(null);
    const [editedHistoryId, setEditedHistoryId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [manualEdited, setManualEdited] = useState(false);
    const { reset: resetSwap } = swap;

    /** 새로 뽑거나 격자를 바꿔 결과를 비울 때 부른다. */
    const startRound = useCallback(() => {
        setManualEdited(false);
        resetSwap();
    }, [resetSwap]);

    /** 랜덤 결과를 기록한 직후에 부른다. 이때부터 수정본을 이 원본에 연결한다. */
    const linkRandomHistory = useCallback((createdId) => {
        setRandomHistoryId(createdId || null);
        setEditedHistoryId(null);
    }, []);

    /** `결과 지우기` 처럼 기록 연결까지 모두 버릴 때 부른다. */
    const clear = useCallback(() => {
        setRandomHistoryId(null);
        setEditedHistoryId(null);
        setManualEdited(false);
        resetSwap();
    }, [resetSwap]);

    /*
     * 교사가 보완한 결과이므로 조건 점수(`violations`)는 남기지 않는다.
     * 랜덤이 만든 점수를 그대로 붙이면 교사가 고친 배치를 기계가 채점한 것처럼 보인다.
     */
    const save = useCallback(async (title, payload) => {
        if (!swap.edited || saving) return;
        setSaving(true);
        try {
            const nextId = await onSaveEditedHistory?.(randomHistoryId, editedHistoryId, kind, title, {
                ...payload,
                violations: null,
                edited: true
            });
            if (nextId) {
                setEditedHistoryId(nextId);
                setManualEdited(true);
                resetSwap();
            }
        } finally {
            setSaving(false);
        }
    }, [editedHistoryId, kind, onSaveEditedHistory, randomHistoryId, resetSwap, saving, swap.edited]);

    return {
        pickedKey: swap.pickedKey,
        pick: swap.pick,
        edited: swap.edited,
        // 저장을 마치면 `edited` 는 풀리지만 결과는 여전히 교사 수정본이다. 조건 점수를 감출 때 쓴다.
        manualResult: manualEdited || swap.edited,
        saving,
        startRound,
        linkRandomHistory,
        clear,
        save
    };
}
