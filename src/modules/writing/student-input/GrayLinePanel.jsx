import { useState } from 'react';

const INTRO_KEY = 'agit:spelling-gray-intro:v1';
const readIntroSeen = () => {
    try { return window.localStorage.getItem(INTRO_KEY) === '1'; } catch { return false; }
};
const markIntroSeen = () => {
    try { window.localStorage.setItem(INTRO_KEY, '1'); } catch { /* 저장이 막힌 기기는 다음에 또 보인다 */ }
};

// 아이가 읽는 까닭 한 줄 — 갈래마다 하나.
const REASONS = Object.freeze({
    particle_attach: '‘은·는·이·가·을·를·에게·처럼’ 같은 말은 앞말에 붙여 써요.',
    modifier_noun: '꾸며 주는 말 뒤의 ‘것·수·때·적·뒤’ 같은 말은 띄어 써요.',
    typo: '글자를 잘못 눌렀을 수도 있어요.'
});

/**
 * 회색 점선 '한번 살펴볼까요?' 안내 줄 — 입력창 바로 아래에 붙는다.
 * 칩을 누르면 까닭과 [이렇게 고치기]·[그대로 두기] 가 펼쳐진다. 처음 한 번은 수호룡이 회색 점선의 뜻을 알려 준다.
 */
export default function GrayLinePanel({ issues, onApply, onKeep }) {
    const [selectedId, setSelectedId] = useState(null);
    const [introSeen, setIntroSeen] = useState(readIntroSeen);
    if (!issues.length) return null;
    const selected = issues.find((issue) => issue.id === selectedId) || null;

    return (
        <div className="spelling-gray-notice" role="status">
            <div className="spelling-gray-notice__head">
                <span>🔍 한번 살펴볼까요? {issues.length}곳</span>
                <small className="spelling-gray-legend">
                    <span className="spelling-gray-legend__red">빨간 물결</span> 틀렸어요 ·{' '}
                    <span className="spelling-gray-legend__gray">회색 점선</span> 맞는지 살펴봐요
                </small>
            </div>

            {!introSeen && (
                <div className="spelling-gray-intro">
                    <p>🐉 회색 점선은 ‘한번 살펴볼까요?’라는 뜻이야. 틀렸을 수도, 맞았을 수도 있어. 읽어 보고 고를래?</p>
                    <button type="button" onClick={() => { markIntroSeen(); setIntroSeen(true); }}>알겠어요</button>
                </div>
            )}

            <div className="spelling-gray-notice__chips">
                {issues.slice(0, 6).map((issue) => (
                    <button
                        type="button"
                        key={issue.id}
                        aria-expanded={selected?.id === issue.id}
                        className={selected?.id === issue.id ? 'is-open' : ''}
                        onClick={() => setSelectedId((current) => (current === issue.id ? null : issue.id))}
                    >
                        {issue.original} <span aria-hidden="true">→</span> {issue.suggestion}
                    </button>
                ))}
                {issues.length > 6 && <small>외 {issues.length - 6}곳</small>}
            </div>

            {selected && (
                <div className="spelling-gray-card">
                    <p>
                        <strong>‘{selected.original}’</strong>을(를) <strong>‘{selected.suggestion}’</strong>(으)로 쓰는 게 맞을 수도 있어요.
                        <br />
                        <span>{REASONS[selected.category] || ''}</span>
                    </p>
                    <div>
                        <button type="button" className="is-apply" onClick={() => { setSelectedId(null); onApply(selected); }}>이렇게 고치기</button>
                        <button type="button" onClick={() => { setSelectedId(null); onKeep(selected); }}>그대로 두기</button>
                    </div>
                </div>
            )}
        </div>
    );
}
