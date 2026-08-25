import './LabOutlineReferenceCard.css';

const OUTLINE_SECTIONS = ['처음', '가운데', '끝'];

const formatDateTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const LabOutlineReferenceCard = ({
    result,
    eyebrow = '글 개요짜기',
    heading = '나의 글 개요',
    badge = '',
    notice = null,
    actions = null,
    compact = false
}) => {
    if (!result) return null;

    const groups = OUTLINE_SECTIONS.map((section) => ({
        section,
        chunks: result.chunks.filter((chunk) => chunk.section === section)
    })).filter((group) => group.chunks.length > 0);
    const updatedLabel = formatDateTime(result.updatedAt);
    const pinnedLabel = formatDateTime(result.pinnedAt);

    return (
        <section className={`lab-outline-reference-card${compact ? ' is-compact' : ''}`}>
            <header className="lab-outline-reference-card__header">
                <div>
                    {/*
                      * ⚠️ 머리말을 짧게 유지한다. 참고함 패널이 340px 뿐이라 줄이 늘면 바로 밀린다
                      *    (2026-08-25 `나의 글 개요` 가 두 줄로 밀렸다).
                      *    글 종류(`생활문` 같은 `topic`)는 **어떤 활동인지 아는 데 필요 없어** 뺐다.
                      *    남기는 것은 `활동 이름`(눈썹)과 `내가 붙인 제목` 둘뿐이다.
                      */}
                    <div className="lab-outline-reference-card__eyebrow">
                        <span>{eyebrow}</span>
                        {badge && <em>{badge}</em>}
                    </div>
                    <h4>{result.title || heading}</h4>
                </div>
                <div className="lab-outline-reference-card__dates">
                    {updatedLabel && <time dateTime={result.updatedAt}>최신 저장 {updatedLabel}</time>}
                    {pinnedLabel && <time dateTime={result.pinnedAt}>고정·교체 {pinnedLabel}</time>}
                </div>
            </header>

            <div className="lab-outline-reference-card__outline">
                {groups.map((group) => (
                    <div key={group.section}>
                        <strong>{group.section}</strong>
                        <ul>
                            {group.chunks.map((chunk) => (
                                <li key={`${result.id}:${chunk.id}`}>
                                    {chunk.label && <span>{chunk.label}</span>}
                                    <p>{chunk.text}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>

            {(notice || actions) && (
                <footer className="lab-outline-reference-card__footer">
                    {notice && <div className="lab-outline-reference-card__notice">{notice}</div>}
                    {actions && <div className="lab-outline-reference-card__actions">{actions}</div>}
                </footer>
            )}
        </section>
    );
};

export default LabOutlineReferenceCard;
