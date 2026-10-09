/**
 * 과제 '함께 읽기' 규칙(순수 함수 — 화면·검사가 함께 쓴다). 서버 규칙은 20261385·20261388·20261389.
 */

/**
 * 함께 읽기 켜고 끄기. 댓글 설정은 **지우지 않는다** — 끈 동안 화면은 댓글을 잠가 보여 주고(친구가 글을 못 보면
 * 서버도 댓글을 막는다: create_my_post_comment_v1 은 visibility='class' 만), 다시 켜면 원래 댓글 설정이 돌아온다.
 * (2026-10-09 시뮬레이션: 껐다 켜면 댓글이 꺼진 채 남던 것 고침)
 */
export const peerReadingPatch = (enabled) => ({ peer_reading_enabled: Boolean(enabled) });

/** 과제 수정에서 '함께 읽기' 를 잠글지 — 서버 규칙(20261388·20261389)과 같은 기준. */
export const peerReadingLockReason = ({ isEditing, openedAt, submittedCount = 0 }) => {
    if (!isEditing) return '';
    if (openedAt) return '친구들에게 연 과제라 다시 닫을 수 없어요.';
    if (submittedCount > 0) return '이미 낸 글이 있어 여기서는 바꿀 수 없어요. 친구들에게 열려면 미션 카드의 [🔓 친구들에게 글 열기]를 눌러 주세요.';
    return '';
};

/** 서버가 함께 읽기 변경을 거절했을 때 보여 줄 말. */
export const peerReadingErrorMessage = (error) => (
    /peer_reading_locked/.test(String(error?.message || ''))
        ? '이미 낸 글이 있거나 친구들에게 연 과제라 ‘선생님만 읽기’로 바꿀 수 없어요.'
        : ''
);
