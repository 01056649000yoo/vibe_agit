import { useState } from 'react';
import Modal from '../common/Modal';
import ModalPortal from '../common/ModalPortal';
import GuideInfoButton from '../common/GuideInfoButton';
import TeacherGuideContent from './TeacherGuideContent';
import { getTeacherGuide } from '../../guides/teacherGuideRegistry';
import { getJourneysForGuide } from '../../guides/teacherGuideJourneys';
import { openTeacherGuideCenter } from '../../guides/teacherGuideEvents';

/**
 * 현재 화면 제목 옆 도움말 버튼 — 누르면 그 메뉴 사용법을 보여 준다.
 *
 * 안내 글은 `constants/teacherGuides.js` 한 곳에 모아 둔다. 화면마다 흩어 두면
 * 기능을 고칠 때 안내만 옛날 내용으로 남기 쉽다.
 * 안내가 없는 메뉴에서는 **아무것도 그리지 않는다** — 보면 아는 화면에는 달지 않는다.
 *
 * 메뉴 버튼(탭) 안에 넣지 않고 형제로 둔다. 버튼 안에 버튼을 넣으면 안 되고,
 * ⓘ 를 눌렀을 때 메뉴까지 같이 눌리는 것도 막아야 하기 때문이다.
 *
 * **창은 반드시 `ModalPortal` 로 띄운다.** 이 버튼이 놓이는 자리(세부 메뉴 막대, 학생 명단 머리말)가
 * 둘 다 `position: sticky` 인데, sticky 요소는 z-index 값과 무관하게 **자기만의 쌓임 맥락**을 만든다.
 * 그 안에서 그리면 창의 `z-index: 9999` 가 막대 안에서만 유효해서, 바깥의 고정 헤더(z-index 10)가
 * 창을 덮어 버린다(2026-08-10 실제로 발생). body 로 빼면 이 문제가 사라진다.
 */
const TeacherGuideButton = ({ tabId, className = '', variant = 'icon' }) => {
    const [isOpen, setIsOpen] = useState(false);
    // 정해진 목록에서만 꺼낸다(Button.jsx 의 variant 조회와 같은 방식)
    const guide = getTeacherGuide(tabId);
    const relatedJourney = getJourneysForGuide(tabId)[0] || null;

    if (!guide) return null;

    return (
        <>
            <GuideInfoButton
                className={className}
                variant={variant}
                label={`${guide.title} 사용법 보기`}
                title={`${guide.title} 사용법`}
                onClick={(event) => {
                    event.stopPropagation();
                    setIsOpen(true);
                }}
            />

            <ModalPortal>
                <Modal
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                    title={`💡 ${guide.title} 도움말`}
                    maxWidth="620px"
                >
                    <TeacherGuideContent key={`${tabId}-${isOpen}`} guide={guide} />
                    {relatedJourney && (
                        <button
                            type="button"
                            className="teacher-guide__center-link"
                            onClick={() => {
                                setIsOpen(false);
                                openTeacherGuideCenter({
                                    guideId: tabId,
                                    journeyId: relatedJourney.journey.id,
                                    stepId: relatedJourney.step.id
                                });
                            }}
                        >
                            활용 안내서에서 전체 흐름 보기 →
                        </button>
                    )}
                </Modal>
            </ModalPortal>
        </>
    );
};

export default TeacherGuideButton;
