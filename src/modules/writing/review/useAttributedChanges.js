import { useMemo } from 'react';
import { attributeTitleChanges, attributeWritingChanges } from './writingAttribution.js';
import { useTeacherEditRounds } from './teacherEditRoundsApi';

/**
 * 누가 고쳤는지 가른 조각을 화면에서 쓰는 공용 훅(교사 글 자세히 보기·학생 내 글 보기).
 * 선생님 교정 회차가 있는 글은 보여 줄 때(`enabled`)만 회차 기록을 **한 번** 불러와 본문과 제목을 함께 가른다.
 * 불러오는 중이거나 실패했거나 글이 너무 길면 null — 화면은 옛 비교(`WritingChangeHighlight`)로 물러선다.
 *
 * @returns {{ items: object[] | null, titleItems: object[] | null }}
 *   `titleItems` 는 제목이 바뀐 글에서만 있고(같으면 null), 본문이 아직 계산되지 않았어도 제목만 먼저 나올 수는 없다(같이 계산).
 */
export const useAttributedChanges = ({ postId, original, current, originalTitle = '', currentTitle = '', teacherEditRounds = 0, enabled = true }) => {
    const roundCount = Number(teacherEditRounds) || 0;
    const fetched = useTeacherEditRounds(postId, enabled && roundCount > 0);
    return useMemo(() => {
        if (!enabled || !original) return { items: null, titleItems: null };
        if (roundCount > 0 && (fetched.loading || fetched.error)) return { items: null, titleItems: null };
        const rounds = roundCount > 0 ? fetched.rounds : [];
        const items = attributeWritingChanges(original, rounds, current);
        const startTitle = String(originalTitle || '');
        const endTitle = String(currentTitle || '');
        const titleItems = items && (startTitle || endTitle) && (startTitle !== endTitle || rounds.some((round) => round.base_title !== round.edited_title))
            ? attributeTitleChanges(startTitle, rounds, endTitle) : null;
        return { items, titleItems };
    }, [enabled, original, current, originalTitle, currentTitle, roundCount, fetched.loading, fetched.error, fetched.rounds]);
};
