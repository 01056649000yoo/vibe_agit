import { useMemo } from 'react';
import { attributeWritingChanges } from './writingAttribution.js';
import { useTeacherEditRounds } from './teacherEditRoundsApi';

/**
 * 누가 고쳤는지 가른 조각(`attributeWritingChanges`)을 화면에서 쓰는 공용 훅(교사 글 자세히 보기·학생 내 글 보기).
 * 선생님 교정 회차가 있는 글은 보여 줄 때(`enabled`)만 회차 기록을 한 번 불러온다. 불러오는 중이거나 실패했거나
 * 글이 너무 길면 null — 화면은 옛 비교(`WritingChangeHighlight`)로 물러선다.
 */
export const useAttributedChanges = ({ postId, original, current, teacherEditRounds = 0, enabled = true }) => {
    const roundCount = Number(teacherEditRounds) || 0;
    const fetched = useTeacherEditRounds(postId, enabled && roundCount > 0);
    return useMemo(() => {
        if (!enabled || !original) return null;
        if (roundCount > 0 && (fetched.loading || fetched.error)) return null;
        return attributeWritingChanges(original, roundCount > 0 ? fetched.rounds : [], current);
    }, [enabled, original, current, roundCount, fetched.loading, fetched.error, fetched.rounds]);
};
