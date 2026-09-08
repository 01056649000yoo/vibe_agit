import { useState } from 'react';
import { askTeacherGuideAssistant } from '../../lib/teacherGuideAssistantApi';
import { GUIDE_CHAT_LIMITS, getLocalTeacherGuideAnswer, searchTeacherGuides } from '../../guides/teacherGuideSearch';

const EXAMPLES = ['학생 접속 코드는 어디서 확인해?', '독서록 설정은 어디서 바꿔?', '학기말 자료는 어떻게 내보내?'];

const TeacherGuideAssistant = ({ onOpenGuide, onOpenScreen, initialRemaining = 5 }) => {
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState(null);
    const [remaining, setRemaining] = useState(() => Math.max(0, Math.min(5, Number(initialRemaining) || 0)));
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);


    const submit = async (event) => {
        event?.preventDefault();
        const trimmed = question.trim();
        if (!trimmed || loading) return;
        const candidates = searchTeacherGuides(trimmed);
        const localAnswer = getLocalTeacherGuideAnswer(trimmed, candidates);
        if (localAnswer) {
            setAnswer(localAnswer);
            setError('');
            return;
        }
        if (remaining <= 0) {
            setError('오늘 AI 안내 횟수는 모두 사용했어요. 위치를 묻는 질문은 계속 이용할 수 있습니다.');
            return;
        }
        if (!candidates.length) {
            setError('가까운 도움말을 찾지 못했어요. 기능 이름이나 메뉴 이름을 넣어 다시 물어봐 주세요.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const result = await askTeacherGuideAssistant({ question: trimmed, candidates });
            setAnswer(result);
            if (Number.isFinite(Number(result?.remainingToday))) setRemaining(Number(result.remainingToday));
        } catch (requestError) {
            setError(requestError.message || 'AI 안내를 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const exhausted = remaining <= 0;

    return (
        <aside className="teacher-guide-assistant" aria-labelledby="teacher-guide-assistant-title">
            <div className="teacher-guide-assistant__heading">
                <div>
                    <span>AI GUIDE</span>
                    <h3 id="teacher-guide-assistant-title">AI에게 사용법 묻기</h3>
                </div>
                <strong>오늘 {remaining}회 남음</strong>
            </div>
            <p className="teacher-guide-assistant__intro">현재 도움말에서 답을 찾아 짧게 알려드려요.</p>

            {!answer && (
                <div className="teacher-guide-assistant__examples" aria-label="질문 예시">
                    {EXAMPLES.map((example) => (
                        <button key={example} type="button" onClick={() => setQuestion(example)}>{example}</button>
                    ))}
                </div>
            )}

            {answer?.answer && (
                <div className="teacher-guide-assistant__answer" aria-live="polite">
                    <span>안내서에서 찾은 답</span>
                    <p>{answer.answer}</p>
                    <div className="teacher-guide-assistant__actions">
                        {answer.guideRef && (
                            <button type="button" onClick={() => onOpenGuide(answer.guideRef, answer.sectionRef)}>
                                {answer.actionLabel || '관련 안내 펼치기'}
                            </button>
                        )}
                        {answer.target && <button type="button" onClick={() => onOpenScreen(answer.target)}>해당 화면 열기 →</button>}
                    </div>
                </div>
            )}

            {error && <p className="teacher-guide-assistant__error" role="alert">{error}</p>}
            {exhausted && <p className="teacher-guide-assistant__limit">오늘 사용할 수 있는 AI 안내 5회를 모두 사용했어요. 기존 활용 안내서는 계속 볼 수 있습니다.</p>}

            <form className="teacher-guide-assistant__form" onSubmit={submit}>
                <label htmlFor="teacher-guide-assistant-question">궁금한 사용법</label>
                <textarea
                    id="teacher-guide-assistant-question"
                    value={question}
                    maxLength={GUIDE_CHAT_LIMITS.questionChars}
                    disabled={loading}
                    placeholder="예: 학생 접속 코드는 어디서 확인해?"
                    onChange={(event) => setQuestion(event.target.value)}
                />
                <div><span>{question.length}/{GUIDE_CHAT_LIMITS.questionChars}</span><button type="submit" disabled={!question.trim() || loading}>{loading ? '찾는 중…' : '물어보기'}</button></div>
            </form>
        </aside>
    );
};

export default TeacherGuideAssistant;
