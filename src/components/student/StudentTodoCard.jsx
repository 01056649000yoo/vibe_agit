import { motion } from 'framer-motion';
import './StudentTodoCard.css';

const TodoRow = ({ icon, label, count, actionLabel, onClick, tone }) => (
    <button
        type="button"
        onClick={onClick}
        className="student-todo-row"
        style={{ '--todo-bg': tone.bg, '--todo-text': tone.text, '--todo-chip': tone.chip }}
    >
        <span className="student-todo-row__icon" aria-hidden="true">{icon}</span>
        <span className="student-todo-row__label">{label} <strong>{count}개</strong></span>
        <span className="student-todo-row__action">{actionLabel}</span>
    </button>
);

const TONES = {
    unstarted: { bg: '#FFF8E1', text: '#E65100', chip: '#FB8C00' },
    draft: { bg: '#E3F2FD', text: '#1565C0', chip: '#1E88E5' },
    rewrite: { bg: '#FBE9E7', text: '#D84315', chip: '#F4511E' }
};

const StudentTodoCard = ({
    unstartedCount = 0,
    draftCount = 0,
    returnedCount = 0,
    loading = false,
    onNavigate,
    onGoRewrite
}) => {
    const rows = [];
    if (unstartedCount > 0) {
        rows.push(
            <TodoRow
                key="unstarted" icon="✏️" label="시작 전 과제" count={unstartedCount}
                actionLabel="쓰러 가기" tone={TONES.unstarted}
                onClick={() => onNavigate('mission_list')}
            />
        );
    }
    if (draftCount > 0) {
        rows.push(
            <TodoRow
                key="draft" icon="📝" label="작성 중인 과제" count={draftCount}
                actionLabel="이어 쓰기" tone={TONES.draft}
                onClick={() => onNavigate('mission_list')}
            />
        );
    }
    if (returnedCount > 0) {
        rows.push(
            <TodoRow
                key="rewrite" icon="♻️" label="다시 쓸 글" count={returnedCount}
                actionLabel="고치러 가기" tone={TONES.rewrite}
                onClick={onGoRewrite}
            />
        );
    }

    const total = unstartedCount + draftCount + returnedCount;

    return (
        <motion.section
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            aria-label="지금 할 일"
            className="student-todo-card"
        >
            <header className="student-todo-card__header">
                <h2>지금 할 일</h2>
                {!loading && total > 0 && <strong>{total}개 남음</strong>}
            </header>

            {loading ? (
                <div className="student-todo-loading">할 일을 확인하고 있어요…</div>
            ) : rows.length === 0 ? (
                <div className="student-todo-done">
                    <span aria-hidden="true">🎉</span>
                    <div><strong>할 일을 모두 끝냈어요!</strong><small>읽고 싶은 책 이야기를 독서록에 남겨 볼까요?</small></div>
                </div>
            ) : (
                <div className="student-todo-card__rows">{rows}</div>
            )}
        </motion.section>
    );
};

export default StudentTodoCard;
