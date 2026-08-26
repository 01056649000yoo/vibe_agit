import React, { useEffect, useId, useMemo, useState } from 'react';

const renderEmphasis = (text) => text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((piece, index) => {
    if (piece.startsWith('**') && piece.endsWith('**')) {
        return <strong key={index}>{piece.slice(2, -2)}</strong>;
    }
    if (piece.startsWith('`') && piece.endsWith('`') && piece.length > 2) {
        return <code key={index} className="teacher-guide__key">{piece.slice(1, -1)}</code>;
    }
    return <React.Fragment key={index}>{piece}</React.Fragment>;
});

const TeacherGuideContent = ({ guide, initialSectionId = '' }) => {
    const idPrefix = useId();
    const sections = useMemo(() => guide?.sections || [], [guide]);
    const requestedSection = sections.find((section) => section.id === initialSectionId);
    const [activeSectionId, setActiveSectionId] = useState(requestedSection?.id || sections[0]?.id || '');

    useEffect(() => {
        const nextSectionId = requestedSection?.id || sections[0]?.id || '';
        // 안내서에서 다른 단계로 바꾸면 같은 공용 렌더러가 해당 세부 탭으로 이동한다.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActiveSectionId(nextSectionId);
    }, [guide, requestedSection?.id, sections]);

    if (!guide) return null;

    const activeSection = sections.find((section) => section.id === activeSectionId)
        || sections[0]
        || guide;
    const activeTabId = sections.length > 0
        ? `${idPrefix}-${activeSection.id}-guide-tab`
        : undefined;
    const activePanelId = sections.length > 0
        ? `${idPrefix}-${activeSection.id}-guide-panel`
        : undefined;

    return (
        <div className="teacher-guide">
            <p className="teacher-guide__summary">{guide.summary}</p>

            {sections.length > 0 && (
                <div className="teacher-guide__tabs" role="tablist" aria-label={`${guide.title} 핵심 기능`}>
                    {sections.map((section) => {
                        const isActive = section.id === activeSection.id;
                        const sectionTabId = `${idPrefix}-${section.id}-guide-tab`;
                        const sectionPanelId = `${idPrefix}-${section.id}-guide-panel`;
                        return (
                            <button
                                key={section.id}
                                type="button"
                                id={sectionTabId}
                                role="tab"
                                aria-selected={isActive}
                                aria-controls={sectionPanelId}
                                className={`teacher-guide__tab${isActive ? ' is-active' : ''}`}
                                onClick={() => setActiveSectionId(section.id)}
                            >
                                {section.label}
                            </button>
                        );
                    })}
                </div>
            )}

            <section
                className="teacher-guide__panel"
                role={sections.length > 0 ? 'tabpanel' : undefined}
                id={activePanelId}
                aria-labelledby={activeTabId}
            >
                {sections.length > 0 && <p className="teacher-guide__section-summary">{activeSection.summary}</p>}

                <h4 className="teacher-guide__heading">이 순서로 하면 됩니다</h4>
                <ol className="teacher-guide__steps">
                    {activeSection.steps.map((guideStep) => <li key={guideStep}>{renderEmphasis(guideStep)}</li>)}
                </ol>

                <h4 className="teacher-guide__heading">알아 두면 좋은 것</h4>
                <ul className="teacher-guide__notes">
                    {activeSection.notes.map((note) => <li key={note}>{renderEmphasis(note)}</li>)}
                </ul>
            </section>
        </div>
    );
};

export default TeacherGuideContent;
