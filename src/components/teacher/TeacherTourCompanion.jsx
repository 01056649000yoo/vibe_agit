import { useEffect, useRef, useState } from 'react';
import ModalPortal from '../common/ModalPortal';
import { TEACHER_TOUR_ANCHOR_SELECTOR, TOUR_SPOTLIGHT_TARGET } from '../../guides/teacherTour.js';
import { getStepDetail } from '../../guides/teacherTourDetail.js';
import { renderEmphasis } from './guideEmphasis.jsx';
import './TeacherTourCompanion.css';

/*
 * 동행 패널.
 *
 * 안내서 모달과 달리 **화면을 가리지 않는다** — 본 화면을 그대로 쓰면서 한 단계씩
 * 따라 하는 것이 목적이라, 덮개(backdrop)도 두지 않고 테두리에도
 * `pointer-events: none` 을 준다. 덮개를 씌우면 정작 눌러야 할 버튼이 막힌다.
 */

const RECT_POLL_MS = 300;

/*
 * 같은 이름표가 여러 곳에 붙어 있으면 지금 눈에 보이는 것 중 **마지막** 을 고른다.
 * 같은 탭을 위쪽 큰 메뉴와 아래쪽 하위 메뉴가 함께 가리키는데, 문서에서 나중에 나오는
 * 하위 메뉴가 교사가 실제로 누를 자리다.
 */
const findVisibleAnchor = (anchorId) => {
    if (!anchorId || typeof document === 'undefined') return null;
    const visible = [...document.querySelectorAll(TEACHER_TOUR_ANCHOR_SELECTOR(anchorId))]
        .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });
    return visible.at(-1) || null;
};

const useAnchorRect = (anchorId, fallbackAnchorId, isActive) => {
    const [measured, setMeasured] = useState(null);

    useEffect(() => {
        if (!isActive || !anchorId) return undefined;
        let scrolledOnce = false;
        const measure = () => {
            // 본문 영역을 못 찾으면(아직 안 그려졌거나 화면이 다르면) 메뉴 이름표로 물러선다.
            const element = findVisibleAnchor(anchorId) || findVisibleAnchor(fallbackAnchorId);
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
    }, [anchorId, fallbackAnchorId, isActive]);

    // 이름표가 바뀐 직후 한 박자 동안 앞 단계 자리에 테두리가 남지 않도록 짝을 맞춰 본다.
    return isActive && measured?.anchorId === anchorId ? measured : null;
};

const TeacherTourCompanion = ({ tour, journeyTitle, nextJourneyTitle, onNavigate, onOpenGuide }) => {
    const { isRunning, step, stepIndex, totalSteps } = tour;
    const rect = useAnchorRect(step?.anchor, step?.fallbackAnchor, isRunning);
    const navigatedStepRef = useRef(null);

    // 단계가 바뀌면 그 화면으로 옮겨 준다. 같은 단계에서 두 번 옮기지 않는다.
    useEffect(() => {
        // 새 화면으로 여는 단계는 우리가 대신 눌러 주지 않는다 — 지금 화면이 사라진다.
        if (!isRunning || !step?.target || step.target.launch) return;
        if (navigatedStepRef.current === step.stepId) return;
        navigatedStepRef.current = step.stepId;
        onNavigate?.(step.target);
    }, [isRunning, step, onNavigate]);

    /*
     * 흐름 하나를 끝냈으면 그 자리에서 다음 흐름을 권한다. 35단계를 한 줄로 세워 두고
     * 끝까지 가라고 하면 아무도 못 간다 — 흐름 단위로 끊어서 이어 붙인다.
     */
    if (!isRunning && tour.justFinishedTourId) {
        return (
            <ModalPortal>
                <section className="teacher-tour__panel" role="status" aria-live="polite">
                    <header className="teacher-tour__head">
                        <span className="teacher-tour__journey">{journeyTitle}</span>
                        <span className="teacher-tour__count">다 보셨어요</span>
                    </header>
                    <h2 className="teacher-tour__title">여기까지 끝냈습니다 🎉</h2>
                    <p className="teacher-tour__hint">
                        {nextJourneyTitle
                            ? `이어서 「${nextJourneyTitle}」도 같이 둘러볼까요? 나중에 활용 안내서에서 언제든 이어서 하실 수 있습니다.`
                            : '모든 흐름을 둘러보셨습니다. 활용 안내서에서 언제든 다시 따라 하실 수 있습니다.'}
                    </p>
                    <div className="teacher-tour__actions">
                        {tour.nextTourId && (
                            <button
                                type="button"
                                className="teacher-tour__primary"
                                onClick={() => tour.start(tour.nextTourId)}
                            >
                                이어서 둘러보기
                            </button>
                        )}
                        <button type="button" className="teacher-tour__ghost" onClick={tour.dismissFinished}>
                            나중에
                        </button>
                    </div>
                </section>
            </ModalPortal>
        );
    }

    if (!isRunning || !step) return null;

    // 다시 보기에서는 모든 단계를 확인했어요로 넘긴다 — 학급을 또 만들라는 뜻이 아니다.
    const needsAck = Boolean(step.done?.ack) || tour.isReplay;
    /*
     * 창 위치만 알려 주고 "자세한 건 안내서에서" 로 끝나면 찾기 어려운 기능은 끝까지
     * 모른 채 지나간다. 지나가면서 핵심과 주의를 한 번씩 짚어 준다(안내서 원문 그대로).
     */
    const detail = getStepDetail(step);

    return (
        <ModalPortal>
            {rect && (() => {
                const place = {
                    top: `${rect.top}px`,
                    left: `${rect.left}px`,
                    width: `${rect.width}px`,
                    height: `${rect.height}px`
                };
                const dims = step.spotlight === TOUR_SPOTLIGHT_TARGET;
                return (
                    <>
                        {/*
                          * 주변을 어둡게 덮고 짚어 주는 자리만 밝게 남긴다. 테두리만으로는
                          * 버튼이 눈에 안 띈다는 지적(2026-09-13)에 따른 것이다.
                          *
                          * 덮개를 따로 깔지 않고 **구멍 뚫린 그림자** 하나로 만든다 —
                          * 요소는 그 자리 크기뿐이고 바깥은 그림자라, `pointer-events: none`
                          * 과 함께 두면 어두운 곳도 그대로 눌린다. 진짜 덮개를 깔면
                          * 정작 눌러야 할 버튼이 막힌다.
                          */}
                        {dims && <div className="teacher-tour__dim" aria-hidden="true" style={place} />}
                        <div
                            className={`teacher-tour__ring${dims ? '' : ' is-screen'}`}
                            aria-hidden="true"
                            style={place}
                        />
                    </>
                );
            })()}
            <section
                className="teacher-tour__panel"
                role="status"
                aria-live="polite"
                aria-label={`${journeyTitle} 동행 안내`}
            >
                <header className="teacher-tour__head">
                    <span className="teacher-tour__journey">{journeyTitle}</span>
                    <span className="teacher-tour__count">
                        {tour.isReplay && <em className="teacher-tour__replay">다시 보기</em>}
                        {stepIndex + 1} / {totalSteps}
                    </span>
                </header>
                <h2 className="teacher-tour__title">{step.title}</h2>
                {/* 설명은 안내서 원본(purpose)을 그대로 쓴다. 눌러야 할 것이 분명한 단계에만 hint 를 더 붙인다. */}
                <p className="teacher-tour__purpose">{step.purpose}</p>
                {step.hint && <p className="teacher-tour__hint">{step.hint}</p>}
                {detail && (
                    <div className="teacher-tour__detail">
                        {detail.points.length > 0 && (
                            <ul className="teacher-tour__points">
                                {detail.points.map((point) => (
                                    <li key={point}>{renderEmphasis(point)}</li>
                                ))}
                            </ul>
                        )}
                        {detail.cautions.map((caution) => (
                            <p key={caution} className="teacher-tour__caution">
                                <span aria-hidden="true">⚠</span>
                                <span>{renderEmphasis(caution)}</span>
                            </p>
                        ))}
                    </div>
                )}
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
                    {step.target && !step.target.launch && (
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
                    {/* 이 단계의 자세한 설명은 안내서에 있다. 동행 중에도 바로 열 수 있어야 한다. */}
                    {onOpenGuide && (
                        <button type="button" onClick={() => onOpenGuide(tour.tourId, step.stepId)}>
                            📘 이 단계 자세히 보기
                        </button>
                    )}
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
