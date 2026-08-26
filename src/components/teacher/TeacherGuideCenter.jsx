import { useEffect, useId, useMemo, useRef, useState } from 'react';
import ModalPortal from '../common/ModalPortal';
import ModalCloseButton from '../common/ModalCloseButton';
import TeacherGuideContent from './TeacherGuideContent';
import { TEACHER_GUIDE_JOURNEYS, getJourneysForGuide } from '../../guides/teacherGuideJourneys';
import { getTeacherGuide } from '../../guides/teacherGuideRegistry';
import './TeacherGuideCenter.css';

const findInitialLocation = ({ guideId, journeyId, stepId }) => {
    const requestedJourney = TEACHER_GUIDE_JOURNEYS.find((journey) => journey.id === journeyId);
    if (requestedJourney) {
        const requestedStep = requestedJourney.steps.find((journeyStep) => journeyStep.id === stepId)
            || requestedJourney.steps.find((journeyStep) => journeyStep.guideRef === guideId)
            || null;
        return { journeyId: requestedJourney.id, stepId: requestedStep?.id || null };
    }

    const related = guideId ? getJourneysForGuide(guideId)[0] : null;
    if (related) return { journeyId: related.journey.id, stepId: related.step.id };
    return { journeyId: TEACHER_GUIDE_JOURNEYS[0].id, stepId: null };
};

const TeacherGuideCenter = ({ isOpen, onClose, initialRequest = {}, onNavigate }) => {
    const titleId = useId();
    const dialogRef = useRef(null);
    const closeRef = useRef(null);
    const initialLocation = useMemo(() => findInitialLocation(initialRequest), [initialRequest]);
    const [selectedJourneyId, setSelectedJourneyId] = useState(initialLocation.journeyId);
    const [expandedStepId, setExpandedStepId] = useState(initialLocation.stepId);

    useEffect(() => {
        if (!isOpen) return;
        // 탭 도움말에서 안내서를 열면 그 도움말을 포함한 단계로 바로 맞춘다.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedJourneyId(initialLocation.journeyId);
        setExpandedStepId(initialLocation.stepId);
    }, [initialLocation, isOpen]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const previouslyFocused = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus();

        const handleEscape = (event) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = previousOverflow;
            previouslyFocused?.focus?.();
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const selectedJourney = TEACHER_GUIDE_JOURNEYS.find((journey) => journey.id === selectedJourneyId)
        || TEACHER_GUIDE_JOURNEYS[0];

    const keepFocusInside = (event) => {
        if (event.key !== 'Tab') return;
        const focusable = dialogRef.current?.querySelectorAll(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    const handleJourneyChange = (journeyId) => {
        setSelectedJourneyId(journeyId);
        setExpandedStepId(null);
    };

    const handleOpenScreen = (target) => {
        if (!target) return;
        onNavigate(target);
        onClose();
    };

    return (
        <ModalPortal>
            <div
                className="teacher-guide-center__backdrop"
                role="presentation"
                onMouseDown={(event) => {
                    if (event.target === event.currentTarget) onClose();
                }}
            >
                <section
                    ref={dialogRef}
                    className="teacher-guide-center"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                    onKeyDown={keepFocusInside}
                >
                    <header className="teacher-guide-center__header">
                        <div>
                            <span className="teacher-guide-center__eyebrow">TEACHER GUIDE</span>
                            <h2 id={titleId}>끄적끄적 아지트 활용 안내서</h2>
                            <p>전체 수업 흐름을 먼저 보고, 필요한 단계에서 현재 기능의 상세 도움말을 펼쳐 보세요.</p>
                        </div>
                        <ModalCloseButton ref={closeRef} onClick={onClose} label="활용 안내서 닫기" />
                    </header>

                    <div className="teacher-guide-center__body">
                        <nav className="teacher-guide-center__nav" aria-label="활용 안내서 목차">
                            <div className="teacher-guide-center__nav-heading">
                                <strong>목적별 안내</strong>
                                <span>{TEACHER_GUIDE_JOURNEYS.length}개 흐름</span>
                            </div>
                            <div className="teacher-guide-center__nav-list">
                                {TEACHER_GUIDE_JOURNEYS.map((journey, index) => (
                                    <button
                                        key={journey.id}
                                        type="button"
                                        className={`teacher-guide-center__nav-item${journey.id === selectedJourney.id ? ' is-active' : ''}`}
                                        aria-current={journey.id === selectedJourney.id ? 'page' : undefined}
                                        onClick={() => handleJourneyChange(journey.id)}
                                    >
                                        <span className="teacher-guide-center__nav-number">{index + 1}</span>
                                        <span aria-hidden="true" className="teacher-guide-center__nav-icon">{journey.icon}</span>
                                        <span>{journey.title}</span>
                                    </button>
                                ))}
                            </div>
                        </nav>

                        <main className="teacher-guide-center__main">
                            <div className="teacher-guide-center__hero">
                                <span className="teacher-guide-center__hero-icon" aria-hidden="true">{selectedJourney.icon}</span>
                                <div>
                                    <div className="teacher-guide-center__time">{selectedJourney.estimatedTime}</div>
                                    <h3>{selectedJourney.title}</h3>
                                    <p>{selectedJourney.summary}</p>
                                </div>
                            </div>

                            <div className="teacher-guide-center__flow-label">
                                <strong>큰 흐름</strong>
                                <span>세부 버튼과 주의사항은 각 단계의 도움말을 펼쳐 확인합니다.</span>
                            </div>

                            <ol className="teacher-guide-center__steps">
                                {selectedJourney.steps.map((journeyStep, index) => {
                                    const guide = getTeacherGuide(journeyStep.guideRef);
                                    const expanded = expandedStepId === journeyStep.id;
                                    const panelId = `teacher-guide-center-${selectedJourney.id}-${journeyStep.id}`;
                                    return (
                                        <li key={journeyStep.id} className={`teacher-guide-center__step${expanded ? ' is-expanded' : ''}`}>
                                            <div className="teacher-guide-center__step-overview">
                                                <span className="teacher-guide-center__step-number">{index + 1}</span>
                                                <div className="teacher-guide-center__step-copy">
                                                    <h4>{journeyStep.title}</h4>
                                                    <p>{journeyStep.purpose}</p>
                                                </div>
                                                <div className="teacher-guide-center__actions">
                                                    <button
                                                        type="button"
                                                        className="teacher-guide-center__detail-button"
                                                        aria-expanded={expanded}
                                                        aria-controls={panelId}
                                                        onClick={() => setExpandedStepId(expanded ? null : journeyStep.id)}
                                                    >
                                                        {expanded ? '상세 도움말 접기' : '상세 도움말 보기'}
                                                    </button>
                                                    {journeyStep.target && (
                                                        <button
                                                            type="button"
                                                            className="teacher-guide-center__screen-button"
                                                            onClick={() => handleOpenScreen(journeyStep.target)}
                                                        >
                                                            해당 화면 열기 →
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            {expanded && guide && (
                                                <div id={panelId} className="teacher-guide-center__detail">
                                                    <div className="teacher-guide-center__detail-heading">
                                                        <span>현재 탭 도움말과 같은 원본</span>
                                                        <strong>{guide.title}</strong>
                                                    </div>
                                                    <TeacherGuideContent
                                                        key={`${journeyStep.guideRef}-${journeyStep.sectionRef || 'main'}`}
                                                        guide={guide}
                                                        initialSectionId={journeyStep.sectionRef || ''}
                                                    />
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ol>
                        </main>
                    </div>
                </section>
            </div>
        </ModalPortal>
    );
};

export default TeacherGuideCenter;
