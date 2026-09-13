import { useEffect, useRef, useState } from 'react';
import ModalPortal from '../common/ModalPortal';
import { TEACHER_TOUR_ANCHOR_SELECTOR, TOUR_SPOTLIGHT_MENU, TOUR_SPOTLIGHT_TARGET } from '../../guides/teacherTour.js';
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
 * 접어 둔 상태는 그 사람의 편의일 뿐이라 브라우저에만 남긴다. 못 읽어도(사생활 보호
 * 모드) 펼친 채로 시작하면 그만이라 실패를 삼킨다.
 */
const COLLAPSED_KEY = 'teacher-tour-collapsed-v1';
const readCollapsed = () => {
    try {
        return window.localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
        return false;
    }
};

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

/** 그 메뉴가 지금 열려 있는가. 메뉴 항목은 열리면 스스로 그렇게 표시한다. */
const isOpenedMenu = (element) => element?.getAttribute('aria-selected') === 'true'
    || element?.getAttribute('aria-current') === 'page'
    || element?.getAttribute('aria-pressed') === 'true';

/*
 * 테두리 자리를 잰다.
 *
 * **재는 자리를 단계에 묶는다.** 전에는 이름표에만 묶여 있어, 여러 단계가 같은 이름표를
 * 쓰거나(설정 다섯 단계는 모두 `tab:settings`) 흐름을 바꿔 다시 볼 때 **앞 단계의 자리가
 * 그대로 남아** 오른쪽 아래 설명과 테두리가 서로 다른 곳을 가리켰다(2026-09-13 제보).
 * 지금 단계의 것이 아니면 그리지 않는다 — 어긋난 테두리보다 없는 편이 낫다.
 */
const useAnchorRect = (stepId, anchorId, fallbackAnchorId, isActive) => {
    const [measured, setMeasured] = useState(null);
    /*
     * 짚어 준 자리를 **직접 눌렀는가.**
     *
     * `aria-current` 같은 표시를 달 수 없는 자리도 있다(놀이 카드가 그랬다 — 눌러도
     * "열렸다" 고 알리지 못해 다음으로 갈 수 없었다, 2026-09-13 제보). 표시를 못 믿을
     * 때를 대비해 **누른 사실 자체**를 함께 본다. 그래야 어떤 자리를 짚어도 갇히지 않는다.
     */
    const clickedRef = useRef(null);

    useEffect(() => {
        if (!isActive || !anchorId) return undefined;
        let scrolledOnce = false;
        const measure = () => {
            /*
             * 구역·도구 메뉴는 그 화면에 들어가야 나온다. 아직이면 **먼저 눌러야 할
             * 바깥 메뉴**로 물러선다(설정·학급운영도구). 본문 전체를 두르지는 않는다.
             */
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
            setMeasured({
                stepId,
                anchorId,
                opened: isOpenedMenu(element) || clickedRef.current === stepId,
                top: box.top, left: box.left, width: box.width, height: box.height
            });
        };
        measure();
        // 화면이 늦게 그려지거나(지연 로딩) 접힌 부분이 펼쳐지면 자리가 바뀐다.
        const timerId = window.setInterval(measure, RECT_POLL_MS);
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        /*
         * 눌린 직후 **바로** 다시 잰다. 주기(300ms)만 기다리면 메뉴를 눌러도 잠깐 아무
         * 반응이 없어 "눌렀는데 다음으로 안 간다" 로 보인다(2026-09-13 걷기 검사에서 잡힘).
         * 클릭이 화면에 반영된 뒤 재야 하므로 한 박자 미룬다.
         */
        const remeasureSoon = (event) => {
            const element = findVisibleAnchor(anchorId);
            if (element && event.target instanceof Node && element.contains(event.target)) {
                clickedRef.current = stepId;
            }
            window.setTimeout(measure, 0);
        };
        window.addEventListener('click', remeasureSoon, true);
        return () => {
            window.clearInterval(timerId);
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
            window.removeEventListener('click', remeasureSoon, true);
        };
    }, [stepId, anchorId, fallbackAnchorId, isActive]);

    // 단계와 이름표가 **둘 다** 지금 것일 때만 그린다.
    return isActive && measured?.stepId === stepId && measured?.anchorId === anchorId ? measured : null;
};

const TeacherTourCompanion = ({ tour, journeyTitle, nextJourneyTitle, onNavigate, onOpenGuide }) => {
    const { isRunning, step, stepIndex, totalSteps } = tour;
    const rect = useAnchorRect(step?.stepId, step?.anchor, step?.fallbackAnchor, isRunning);
    const navigatedStepRef = useRef(null);
    // 패널이 화면 오른쪽 아래를 늘 차지해 그 뒤 내용을 못 본다는 제보(2026-09-13).
    const [collapsed, setCollapsed] = useState(readCollapsed);

    const toggleCollapsed = (next) => {
        setCollapsed(next);
        try { window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* 이번만 못 남긴다 */ }
    };

    /*
     * 단계가 바뀌면 그 화면으로 옮겨 준다. 같은 단계에서 두 번 옮기지 않는다.
     *
     * **흐름을 새로 열면 기억을 지운다.** 안 그러면 다시 보기로 1단계를 열었을 때
     * "이미 옮겨 준 단계" 로 기억하고 화면을 안 움직여, 눌러도 아무 일이 없는 것처럼
     * 보인다(2026-09-13 제보). 기억은 그 회차 안에서만 쓸모가 있다.
     */
    useEffect(() => {
        navigatedStepRef.current = null;
    }, [tour.tourId, tour.isReplay, isRunning]);

    useEffect(() => {
        /*
         * 대신 눌러 주지 않는 단계 둘.
         *   · 새 화면으로 여는 단계 — 지금 화면이 사라진다.
         *   · "이 메뉴에 있습니다" 단계 — **교사가 직접 눌러 봐야** 다음에 혼자 찾아간다.
         *     저절로 옮겨 주면 어느 메뉴였는지 남지 않는다(2026-09-13 지적).
         */
        if (!isRunning || !step?.target || step.target.launch) return;
        if (step.spotlight === TOUR_SPOTLIGHT_MENU) return;
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
                            : '여덟 흐름을 모두 둘러보셨습니다. 다시 보고 싶은 흐름은 활용 안내서에서 골라 언제든 처음부터 따라 하실 수 있습니다.'}
                    </p>
                    <div className="teacher-tour__actions">
                        {tour.nextTourId ? (
                            <button
                                type="button"
                                className="teacher-tour__primary"
                                onClick={() => tour.start(tour.nextTourId)}
                            >
                                이어서 둘러보기
                            </button>
                        ) : onOpenGuide && (
                            /*
                             * 다 둘러본 뒤 `나중에` 만 남으면 길이 끊긴다(2026-09-13 제보).
                             * 다시 보고 싶은 흐름을 고를 수 있는 곳으로 보내 준다.
                             */
                            <button
                                type="button"
                                className="teacher-tour__primary"
                                onClick={() => { tour.dismissFinished(); onOpenGuide(tour.tourId); }}
                            >
                                📘 활용 안내서에서 고르기
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

    /*
     * 접으면 작은 알약만 남는다. 덮개와 테두리도 함께 걷어 **화면을 온전히 보게** 한다 —
     * 접었는데도 화면이 어두우면 접은 뜻이 없다.
     */
    if (collapsed) {
        return (
            <ModalPortal>
                <button
                    type="button"
                    className="teacher-tour__pill"
                    onClick={() => toggleCollapsed(false)}
                >
                    🧭 {journeyTitle} {stepIndex + 1}/{totalSteps} 펴기
                </button>
            </ModalPortal>
        );
    }

    // 다시 보기에서는 모든 단계를 확인했어요로 넘긴다 — 학급을 또 만들라는 뜻이 아니다.
    const needsAck = Boolean(step.done?.ack) || tour.isReplay;
    /*
     * 창 위치만 알려 주고 "자세한 건 안내서에서" 로 끝나면 찾기 어려운 기능은 끝까지
     * 모른 채 지나간다. 지나가면서 핵심과 주의를 한 번씩 짚어 준다(안내서 원문 그대로).
     */
    const detail = getStepDetail(step);
    /*
     * 메뉴 단계의 한 줄 안내는 단계마다 적지 않는다 — 서른 줄을 손으로 쓰면 메뉴 이름이
     * 바뀔 때마다 어긋난다. "테두리가 씌워진 메뉴" 라고만 말하면 늘 맞다.
     */
    /*
     * 메뉴를 눌러 들어왔는가. 들어온 뒤에는 **다음으로 가는 단추를 분명히** 보여 준다 —
     * 눌러도 안 넘어간다는 제보가 있었다(2026-09-13). 자동으로 넘기지는 않는다:
     * 들어가자마자 넘어가면 정작 설명을 읽을 새가 없다.
     */
    const isMenuStep = step.spotlight === TOUR_SPOTLIGHT_MENU;
    const arrived = isMenuStep && rect?.opened === true;
    /*
     * 앞 단계와 같은 화면을 이어서 쓰는 단계가 있다(대시보드에서 제출 확인 → 승인,
     * 독서록에서 확인 → 활동 운영). 그때는 이미 열려 있어 **테두리가 아예 없다** —
     * 왜 하이라이트가 없는지 몰라 헷갈린다는 제보가 있어 말로 알려 준다(2026-09-13).
     */
    const menuHint = isMenuStep
        ? (arrived
            ? '이 화면은 이미 열려 있습니다. 아래 설명을 읽고 **다음 단계로**를 눌러 주세요.'
            : '테두리가 씌워진 메뉴를 눌러 이 화면을 **열어야** 다음으로 갈 수 있습니다.')
        : null;

    return (
        <ModalPortal>
            {rect && (() => {
                const place = {
                    top: `${rect.top}px`,
                    left: `${rect.left}px`,
                    width: `${rect.width}px`,
                    height: `${rect.height}px`
                };
                /*
                 * 메뉴 단계는 **도착하기 전까지만** 덮는다. 열고 나면 볼 내용이 어두워지면
                 * 안 되므로 조용해지고 설명만 남는다.
                 */
                const arrivedAtMenu = step.spotlight === TOUR_SPOTLIGHT_MENU && rect.opened;
                if (arrivedAtMenu) return null;
                const dims = step.spotlight === TOUR_SPOTLIGHT_TARGET || step.spotlight === TOUR_SPOTLIGHT_MENU;
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
                    <button
                        type="button"
                        className="teacher-tour__collapse"
                        onClick={() => toggleCollapsed(true)}
                        aria-label="동행 안내 접기"
                        title="접어 두고 화면을 보기"
                    >
                        ⌄
                    </button>
                    <span className="teacher-tour__count">
                        {tour.isReplay && <em className="teacher-tour__replay">다시 보기</em>}
                        {stepIndex + 1} / {totalSteps}
                    </span>
                </header>
                <h2 className="teacher-tour__title">{step.title}</h2>
                {/* 설명은 안내서 원본(purpose)을 그대로 쓴다. 눌러야 할 것이 분명한 단계에만 hint 를 더 붙인다. */}
                <p className="teacher-tour__purpose">{step.purpose}</p>
                {(step.hint || menuHint) && (
                    <p className="teacher-tour__hint">{renderEmphasis(step.hint || menuHint)}</p>
                )}
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
                        짚어 드릴 메뉴가 지금 화면에 없습니다. 아래 <strong>화면 열기</strong>를 누르면 그 화면으로 옮겨 드립니다.
                    </p>
                )}
                <div className="teacher-tour__actions">
                    {isMenuStep && !arrived ? (
                        /*
                         * 짚어 준 메뉴를 **실제로 열어야** 다음으로 간다(2026-09-13 사용자 제안).
                         * 안 보고 넘기면 진행이 되는지 마는지 알 수 없고, 설명과 화면이 계속
                         * 어긋난다. 다만 갇히면 안 되므로 아래 `건너뛰기` 는 늘 열려 있다.
                         */
                        <p className="teacher-tour__waiting">메뉴를 열면 다음으로 갈 수 있어요</p>
                    ) : needsAck ? (
                        <button type="button" className="teacher-tour__primary" onClick={tour.acknowledge}>
                            {arrived ? '다음 단계로 →' : '확인했어요'}
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
