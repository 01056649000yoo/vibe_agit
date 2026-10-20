import React, { useEffect, useId, useMemo, useState } from 'react';
import { renderEmphasis } from './guideEmphasis.jsx';
import { splitGuideLead } from './guideFold.js';


/** 긴 항목은 첫 문장만 보이고 `더 보기` 로 나머지를 연다. */
const FoldItem = ({ text }) => {
    const { lead, rest } = useMemo(() => splitGuideLead(text), [text]);
    const [open, setOpen] = useState(false);
    if (!rest) return <>{renderEmphasis(text)}</>;
    return (
        <>
            {renderEmphasis(lead)}
            {open && <> {renderEmphasis(rest)}</>}
            {' '}
            <button type="button" className="teacher-guide__more" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
                {open ? '접기' : '더 보기'}
            </button>
        </>
    );
};

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
                    {activeSection.steps.map((guideStep) => <li key={guideStep}><FoldItem text={guideStep} /></li>)}
                </ol>

                {/* 주의사항은 접어 둔다 — 핵심(순서)만 한 화면에 보이게. 탭을 바꾸면 다시 접힌다. */}
                {activeSection.notes.length > 0 && (
                    <details className="teacher-guide__notes-fold" key={activeSection.id || 'main'}>
                        <summary>알아 두면 좋은 것 {activeSection.notes.length}가지 보기</summary>
                        <ul className="teacher-guide__notes">
                            {activeSection.notes.map((note) => <li key={note}><FoldItem text={note} /></li>)}
                        </ul>
                    </details>
                )}
            </section>
        </div>
    );
};

export default TeacherGuideContent;
