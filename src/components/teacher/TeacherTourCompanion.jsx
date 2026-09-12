import { useEffect, useRef, useState } from 'react';
import ModalPortal from '../common/ModalPortal';
import { TEACHER_TOUR_ANCHOR_SELECTOR } from '../../guides/teacherTour.js';
import './TeacherTourCompanion.css';

/*
 * 동행 패널.
 *
 * 안내서 모달과 달리 **화면을 가리지 않는다** — 본 화면을 그대로 쓰면서 한 단계씩
 * 따라 하는 것이 목적이라, 덮개(backdrop)도 두지 않고 테두리에도
 * `pointer-events: none` 을 준다. 덮개를 씌우면 정작 눌러야 할 버튼이 막힌다.
 */

const RECT_POLL_MS = 300;

/** 같은 이름표가 여러 곳에 붙어 있으면 지금 눈에 보이는 것을 고른다. */
const findVisibleAnchor = (anchorId) => {
    if (!anchorId || typeof document === 'undefined') return null;
    const candidates = [...document.querySelectorAll(TEACHER_TOUR_ANCHOR_SELECTOR(anchorId))];
    return candidates.find((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }) || null;
};

const useAnchorRect = (anchorId, isActive) => {
    const [measured, setMeasured] = useState(null);

    useEffect(() => {
        if (!isActive || !anchorId) return undefined;
        let scrolledOnce = false;
        const measure = () => {
            const element = findVisibleAnchor(anchorId);
            if (!element) {
                setMeasured(null);
                return;
            }
            if (!scrolledOnce) {
                scrolledOnce = true;
                element.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
            const box = element.getBoundingClientRect();
            setMeasured({ anchorId, top: box.top, left: box.left, width: box.width, height: box.height });
        };
        measure();
        // 화면이 늦게 그려지거나(지연 로딩) 접힌 부분이 펼쳐지면 자리가 바뀐다.
        const timerId = window.setInterval(measure, RECT_POLL_MS);
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
            window.clearInterval(timerId);
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [anchorId, isActive]);

    // 이름표가 바뀐 직후 한 박자 동안 앞 단계 자리에 테두리가 남지 않도록 짝을 맞춰 본다.
    return isActive && measured?.anchorId === anchorId ? measured : null;
};

const TeacherTourCompanion = ({ tour, journeyTitle, onNavigate }) => {
    const { isRunning, step, stepIndex, totalSteps } = tour;
    const rect = useAnchorRect(step?.anchor, isRunning);
    const navigatedStepRef = useRef(null);

    // 단계가 바뀌면 그 화면으로 옮겨 준다. 같은 단계에서 두 번 옮기지 않는다.
    useEffect(() => {
        if (!isRunning || !step?.target) return;
        if (navigatedStepRef.current === step.stepId) return;
        navigatedStepRef.current = step.stepId;
        onNavigate?.(step.target);
    }, [isRunning, step, onNavigate]);

    if (!isRunning || !step) return null;

    const needsAck = Boolean(step.done?.ack);

    return (
        <ModalPortal>
            {rect && (
                <div
                    className="teacher-tour__ring"
                    aria-hidden="true"
                    style={{
                        top: `${rect.top}px`,
                        left: `${rect.left}px`,
                        width: `${rect.width}px`,
                        height: `${rect.height}px`
                    }}
                />
            )}
            <section
                className="teacher-tour__panel"
                role="status"
                aria-live="polite"
                aria-label={`${journeyTitle} 동행 안내`}
            >
                <header className="teacher-tour__head">
                    <span className="teacher-tour__journey">{journeyTitle}</span>
                    <span className="teacher-tour__count">{stepIndex + 1} / {totalSteps}</span>
                </header>
                <h2 className="teacher-tour__title">{step.title}</h2>
                <p className="teacher-tour__hint">{step.hint}</p>
                {!rect && (
                    <p className="teacher-tour__missing">
                        해당 화면을 여는 중입니다. 바뀌지 않으면 아래 <strong>화면 열기</strong>를 눌러 주세요.
                    </p>
                )}
                <div className="teacher-tour__actions">
                    {needsAck ? (
                        <button type="button" className="teacher-tour__primary" onClick={tour.acknowledge}>
                            확인했어요
                        </button>
                    ) : (
                        // 누를 것이 아니라 기다리면 된다는 안내다. 죽은 버튼을 두면 눌러 보고 고장으로 여긴다.
                        <p className="teacher-tour__waiting">다 하시면 저절로 넘어갑니다</p>
                    )}
                    {step.target && (
                        <button
                            type="button"
                            className="teacher-tour__ghost"
                            onClick={() => onNavigate?.(step.target)}
                        >
                            화면 열기
                        </button>
                    )}
                </div>
                <div className="teacher-tour__minor">
                    {stepIndex > 0 && (
                        <button type="button" onClick={tour.back}>이전</button>
                    )}
                    <button type="button" onClick={tour.skipStep}>이 단계 건너뛰기</button>
                    <button type="button" onClick={tour.stop}>그만두기</button>
                </div>
            </section>
        </ModalPortal>
    );
};

export default TeacherTourCompanion;
