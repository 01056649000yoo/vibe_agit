import { useState } from 'react';
import TeacherProofText from './TeacherProofText';
import WritingChangeHighlight from './WritingChangeHighlight';
import { useTeacherEditRounds } from './teacherEditRoundsApi';
import './teacherEditRounds.css';

const formatDate = (value) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    return `${date.getMonth() + 1}/${date.getDate()}`;
};

/**
 * `✏️ 선생님 교정 N회` 를 눌렀을 때의 좌우 비교(2026-09-30).
 *   왼쪽 — 선생님 교정지: 고치기 전 학생 글에 빨간 펜 교정 부호
 *   오른쪽 — 그다음에 낸 글: 선생님 수정본에서 학생이 또 바꾼 곳에 형광펜. 아직 다시 내지 않았으면 선생님 수정본을 그대로.
 * 여러 번 고쳐 줬으면 위의 회차 단추로 오간다(처음엔 마지막 회차). 좁은 화면에서는 위아래로 쌓인다.
 * `rounds` 를 넘기면 불러오지 않는다(개발 미리보기).
 */
const TeacherEditRounds = ({ postId, rounds: givenRounds = null }) => {
    const fetched = useTeacherEditRounds(postId, givenRounds === null);
    const rounds = givenRounds ?? fetched.rounds;
    const [picked, setPicked] = useState(null);

    if (givenRounds === null && fetched.loading) return <div className="teacher-edits__empty">선생님 교정지를 불러오는 중이에요…</div>;
    if (givenRounds === null && fetched.error) return <div className="teacher-edits__empty">{fetched.error}</div>;
    if (!rounds.length) return <div className="teacher-edits__empty">선생님이 고쳐 준 기록이 없어요.</div>;

    const current = rounds.find((item) => item.round === picked) ?? rounds[rounds.length - 1];
    const resubmitted = typeof current.next_content === 'string';
    const titleChanged = (current.base_title || '') !== (current.edited_title || '');

    return (
        <section className="teacher-edits" aria-label="선생님 교정">
            {rounds.length > 1 ? (
                <div className="teacher-edits__rounds" role="radiogroup" aria-label="교정 회차">
                    {rounds.map((item) => (
                        <button
                            key={item.round}
                            type="button"
                            role="radio"
                            aria-checked={item.round === current.round}
                            className={`teacher-edits__round${item.round === current.round ? ' is-active' : ''}`}
                            onClick={() => setPicked(item.round)}
                        >
                            {item.round}회차{formatDate(item.edited_at) ? ` · ${formatDate(item.edited_at)}` : ''}
                        </button>
                    ))}
                </div>
            ) : null}
            <div className="teacher-edits__pair">
                <article className="teacher-edits__sheet teacher-edits__sheet--proof">
                    <header className="teacher-edits__head">
                        <span className="teacher-edits__badge teacher-edits__badge--proof">✏️ 선생님 교정지</span>
                        <span className="teacher-edits__hint">{current.round}회차 · 고치기 전 내 글에 빨간 펜</span>
                    </header>
                    {titleChanged ? (
                        <h4 className="teacher-edits__title"><TeacherProofText before={current.base_title || ''} after={current.edited_title || ''} showLegend={false} /></h4>
                    ) : current.edited_title ? <h4 className="teacher-edits__title">{current.edited_title}</h4> : null}
                    <div className="teacher-edits__body">
                        <TeacherProofText before={current.base_content || ''} after={current.edited_content || ''} />
                    </div>
                </article>
                <article className="teacher-edits__sheet">
                    <header className="teacher-edits__head">
                        <span className="teacher-edits__badge">{resubmitted ? '📝 다음에 낸 글' : '📄 선생님이 고친 글'}</span>
                        <span className="teacher-edits__hint">
                            {resubmitted ? '형광펜: 선생님 글에서 또 바꾼 곳' : '아직 다시 내지 않았어요'}
                        </span>
                    </header>
                    <div className="teacher-edits__body">
                        {resubmitted ? (
                            <WritingChangeHighlight before={current.edited_content || ''} after={current.next_content} variant="after" showLegend={false} />
                        ) : (current.edited_content || '')}
                    </div>
                </article>
            </div>
        </section>
    );
};

export default TeacherEditRounds;
