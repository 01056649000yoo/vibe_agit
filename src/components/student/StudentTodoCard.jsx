import { motion } from 'framer-motion';
import './StudentTodoCard.css';

const TodoRow = ({ icon, label, count, actionLabel, onClick, tone }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={count === 0}
        aria-label={`${label} ${count}개${count > 0 ? `, ${actionLabel}` : ''}`}
        className="student-todo-row"
        style={{ '--todo-bg': tone.bg, '--todo-text': tone.text, '--todo-chip': tone.chip }}
    >
        <span className="student-todo-row__icon" aria-hidden="true">{icon}</span>
        <span className="student-todo-row__label"><span>{label}</span><strong>{count}개</strong></span>
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
            ) : (
                <div className="student-todo-card__rows">
                    <TodoRow
                        icon="✏️" label="시작 전 과제" count={unstartedCount}
                        actionLabel="쓰러 가기" tone={TONES.unstarted}
                        onClick={() => onNavigate('mission_list')}
                    />
                    <TodoRow
                        icon="📝" label="작성 중인 과제" count={draftCount}
                        actionLabel="이어 쓰기" tone={TONES.draft}
                        onClick={() => onNavigate('mission_list')}
                    />
                    <TodoRow
                        icon="♻️" label="다시 쓸 글" count={returnedCount}
                        actionLabel="고치러 가기" tone={TONES.rewrite}
                        onClick={onGoRewrite}
                    />
                </div>
            )}
        </motion.section>
    );
};

export default StudentTodoCard;
