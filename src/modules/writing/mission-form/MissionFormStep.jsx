import './missionFormLayout.css';

/**
 * 과제 만들기 화면의 단계 카드(2026-10-09, 선생님 요청 — 칸마다 꾸밈이 달라 산만했다).
 * 네 화면(일반·편지·보고서·시)이 같은 카드·같은 머리(번호·제목·필수/선택·한 줄 설명)를 쓴다.
 * 접지 않는다 — 선택 단계도 늘 펼쳐 둔다(접으면 안 쓰게 된다, 선생님 판단).
 */
export default function MissionFormStep({ number, title, description, optional = false, actions = null, children }) {
    return (
        <section className="mission-step" aria-labelledby={`mission-step-${number}`}>
            <header className="mission-step__head">
                <span className="mission-step__number" aria-hidden="true">{number}</span>
                <div className="mission-step__title">
                    <h3 id={`mission-step-${number}`}>
                        {title}
                        <span className={`mission-step__chip${optional ? ' is-optional' : ''}`}>{optional ? '선택' : '필수'}</span>
                    </h3>
                    {description ? <p>{description}</p> : null}
                </div>
                {actions ? <div className="mission-step__actions">{actions}</div> : null}
            </header>
            <div className="mission-step__body">{children}</div>
        </section>
    );
}

/** 단계 안의 작은 묶음(분량·함께 읽기·포인트처럼). 색 대신 이름표로 나눈다. */
export function MissionFormGroup({ title, children }) {
    return (
        <div className="mission-group">
            {title ? <h4 className="mission-group__title">{title}</h4> : null}
            <div className="mission-group__body">{children}</div>
        </div>
    );
}

/**
 * 아래 고정 줄 — 어디까지 내려가 있든 지금 설정 요약과 공개 단추가 보인다.
 * @param {string[]} summary 짧은 요약 조각(300자 · 3문단 · 100P …)
 */
export function MissionFormActions({ summary = [], children }) {
    return (
        <div className="mission-actions">
            {summary.length ? (
                <p className="mission-actions__summary" aria-label="지금 설정">
                    {summary.filter(Boolean).map((item) => <span key={item}>{item}</span>)}
                </p>
            ) : null}
            <div className="mission-actions__buttons">{children}</div>
        </div>
    );
}
