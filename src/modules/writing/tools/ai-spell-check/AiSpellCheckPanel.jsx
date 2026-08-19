import { useState } from 'react';
import { SearchCheck, Sparkles } from 'lucide-react';
import { aiSpellCheckApi } from './api';
import './aiSpellCheck.css';

/**
 * 다 쓴 글을 AI가 한 번 훑어 주는 도구.
 *
 * - **글 하나에 한 번**이다. 횟수는 서버가 쥐고 있어 새로고침해도 늘어나지 않는다.
 * - **선생님께 한 번 제출한 뒤**에만 쓸 수 있다. 쓰는 도중에 눌러 한 번뿐인 기회를 날리지 않게 한다.
 * - 누르기 전에 **정말 다 썼는지 한 번 더 묻는다**(브라우저 대화상자 대신 화면 안에서 묻는다 —
 *   태블릿에서 대화상자는 키보드를 닫아 화면이 튄다).
 * - 결과는 **제안**이다. 글을 자동으로 바꾸지 않는다 — 고칠지는 학생이 정한다.
 */
const AiSpellCheckPanel = ({ postId, studentId, canRun = false, blockedReason = '', onEnsurePost }) => {
    const [state, setState] = useState('idle');
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const run = async () => {
        if (state === 'loading') return;
        setError('');
        setState('loading');
        try {
            const targetPostId = postId || (onEnsurePost ? await onEnsurePost() : null);
            if (!targetPostId) throw new Error('글을 먼저 저장한 뒤에 검사할 수 있어요.');
            const checked = await aiSpellCheckApi.request({ postId: targetPostId, studentId });
            setResult(checked);
            // 글 같지 않다고 돌아오면 결과 화면 대신 안내만 띄우고, 다시 누를 수 있게 둔다.
            setState(checked.notWriting ? 'idle' : 'done');
            if (checked.notWriting) {
                setError(checked.reason || '아직 글로 읽히지 않아요. 뜻이 통하는 문장으로 고쳐 쓴 뒤에 다시 눌러 주세요.');
            }
        } catch (err) {
            setError(err.message || '맞춤법 검사를 하지 못했어요.');
            setState('idle');
        }
    };

    const items = result?.items || [];

    return (
        <section className="ai-spell-check" aria-labelledby="ai-spell-check-title">
            <div className="ai-spell-check__head">
                <span className="ai-spell-check__icon" aria-hidden="true"><SearchCheck size={20} /></span>
                <div>
                    <h3 id="ai-spell-check-title">AI 맞춤법 검사</h3>
                    <p>글을 다 쓰고 제출한 뒤에 한 번 눌러 보세요. 틀린 곳을 모아서 알려줘요. <strong>글 하나에 한 번만</strong> 쓸 수 있어요.</p>
                </div>
            </div>

            {!canRun && state !== 'done' && (
                <p className="ai-spell-check__locked">{blockedReason || '선생님께 글을 제출한 뒤에 쓸 수 있어요.'}</p>
            )}

            {canRun && state === 'idle' && (
                <button type="button" className="ai-spell-check__start" onClick={() => setState('confirm')}>
                    맞춤법 검사하기
                </button>
            )}

            {canRun && state === 'confirm' && (
                <div className="ai-spell-check__confirm">
                    <p><strong>글을 정말 다 썼나요?</strong></p>
                    <p>이 검사는 <strong>글 하나에 한 번만</strong> 할 수 있어요. 지금 검사하면 다시 쓸 수 없어요.</p>
                    <div className="ai-spell-check__confirm-actions">
                        <button type="button" className="is-quiet" onClick={() => setState('idle')}>아직이요</button>
                        <button type="button" onClick={run}>네, 검사할게요</button>
                    </div>
                </div>
            )}

            {state === 'loading' && <p className="ai-spell-check__note">글을 살펴보는 중이에요…</p>}

            {error && (
                <p className={`ai-spell-check__${result?.notWriting ? 'notwriting' : 'error'}`} role="alert">
                    {error}
                    {result?.notWriting && <span> 이번 검사는 사용하지 않았어요.</span>}
                </p>
            )}

            {state === 'done' && (
                <div className="ai-spell-check__result">
                    {result?.alreadyUsed && <p className="ai-spell-check__note">이 글은 이미 검사했어요. 그때 결과를 다시 보여 줄게요.</p>}
                    {items.length === 0 ? (
                        <p className="ai-spell-check__empty"><Sparkles size={16} aria-hidden="true" /> 고칠 곳을 찾지 못했어요. 잘 썼어요!</p>
                    ) : (
                        <>
                            <p className="ai-spell-check__count">고쳐 볼 곳 {items.length}군데를 찾았어요. 고칠지는 내가 정해요.</p>
                            <ol className="ai-spell-check__list">
                                {items.map((item, index) => (
                                    <li key={`${item.wrong}-${index}`}>
                                        <span className="ai-spell-check__pair">
                                            <b>{item.wrong}</b>
                                            <span aria-hidden="true">→</span>
                                            <strong>{item.right}</strong>
                                        </span>
                                        {item.why && <small>{item.why}</small>}
                                    </li>
                                ))}
                            </ol>
                        </>
                    )}
                </div>
            )}
        </section>
    );
};

export default AiSpellCheckPanel;
