import './writingVersionSwitch.css';

/**
 * 목록 카드의 `🖍️ N군데 고침`(2026-09-26). 승인할 때 저장한 `student_posts.revision_change_count` 를 보여 준다.
 * 수가 없거나(옛 글·승인 전·글이 바뀜) 0이면 그리지 않는다. 색은 글 안 형광펜과 같다.
 */
const RevisionCountChip = ({ count, compact = false }) => (count > 0 ? (
    <span className="revision-count-chip" aria-label={`고친 곳 ${count}군데`}>
        {compact ? `🖍️${count}` : `🖍️ ${count}군데 고침`}
    </span>
) : null);

export default RevisionCountChip;
