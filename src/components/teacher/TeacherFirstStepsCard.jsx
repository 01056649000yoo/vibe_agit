import './TeacherFirstStepsCard.css';

/*
 * 가입 직후 첫 화면에 놓는 카드.
 *
 * 여기서 끝낸 표시(✅)는 교사가 누르는 체크가 아니라 **실제 데이터**로 정한다.
 * 스스로 체크하게 두면 해 놓지 않은 일이 끝난 것으로 남는다.
 */

const TeacherFirstStepsCard = ({ title, summary, estimatedTime, steps, completedStepIds = [], onStart, onDismiss }) => (
    <section className="teacher-first-steps" aria-label="처음 시작하기 안내">
        <div className="teacher-first-steps__head">
            <span className="teacher-first-steps__eyebrow">처음 오셨나요</span>
            <h2>{title}</h2>
            <p>{summary}</p>
        </div>
        <ol className="teacher-first-steps__list">
            {steps.map((step, index) => {
                const done = completedStepIds.includes(step.stepId);
                return (
                    <li key={step.stepId} className={done ? 'is-done' : ''}>
                        <span className="teacher-first-steps__mark" aria-hidden="true">{done ? '✅' : index + 1}</span>
                        <div>
                            <strong>{step.title}</strong>
                            <small>{step.purpose}</small>
                        </div>
                    </li>
                );
            })}
        </ol>
        <div className="teacher-first-steps__actions">
            <button type="button" className="teacher-first-steps__start" onClick={onStart}>
                따라 하며 시작하기
            </button>
            <button type="button" className="teacher-first-steps__skip" onClick={onDismiss}>
                혼자 할게요
            </button>
        </div>
        <p className="teacher-first-steps__note">
            <span aria-hidden="true">🕘</span>
            {estimatedTime} · 연습이 아니라 실제로 쓰실 학급이 만들어집니다. 중간에 그만두어도 진행 위치가 남습니다.
        </p>
    </section>
);

export default TeacherFirstStepsCard;
