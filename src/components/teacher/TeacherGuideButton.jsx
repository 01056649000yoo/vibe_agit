import React, { useState } from 'react';
import Modal from '../common/Modal';
import { TEACHER_GUIDES } from '../../constants/teacherGuides';

/**
 * 메뉴 이름 옆 ⓘ — 누르면 그 메뉴 사용법을 보여 준다.
 *
 * 안내 글은 `constants/teacherGuides.js` 한 곳에 모아 둔다. 화면마다 흩어 두면
 * 기능을 고칠 때 안내만 옛날 내용으로 남기 쉽다.
 * 안내가 없는 메뉴에서는 **아무것도 그리지 않는다** — 보면 아는 화면에는 달지 않는다.
 *
 * 메뉴 버튼(탭) 안에 넣지 않고 형제로 둔다. 버튼 안에 버튼을 넣으면 안 되고,
 * ⓘ 를 눌렀을 때 메뉴까지 같이 눌리는 것도 막아야 하기 때문이다.
 */
const TeacherGuideButton = ({ tabId, className = '' }) => {
    const [isOpen, setIsOpen] = useState(false);
    // 정해진 목록에서만 꺼낸다(Button.jsx 의 variant 조회와 같은 방식)
    const guide = Reflect.get(TEACHER_GUIDES, tabId);

    if (!guide) return null;

    return (
        <>
            <button
                type="button"
                className={`teacher-guide-dot ${className}`.trim()}
                aria-label={`${guide.title} 사용법 보기`}
                title={`${guide.title} 사용법`}
                onClick={(event) => {
                    event.stopPropagation();
                    setIsOpen(true);
                }}
            >
                ⓘ
            </button>

            <Modal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                title={`ⓘ ${guide.title} 사용법`}
                maxWidth="620px"
            >
                <div className="teacher-guide">
                    <p className="teacher-guide__summary">{guide.summary}</p>

                    <h4 className="teacher-guide__heading">이 순서로 하면 됩니다</h4>
                    <ol className="teacher-guide__steps">
                        {guide.steps.map((step) => <li key={step}>{step}</li>)}
                    </ol>

                    <h4 className="teacher-guide__heading">알아 두면 좋은 것</h4>
                    <ul className="teacher-guide__notes">
                        {guide.notes.map((note) => <li key={note}>{renderEmphasis(note)}</li>)}
                    </ul>
                </div>
            </Modal>
        </>
    );
};

/**
 * `**굵게**` 만 굵은 글씨로 바꾼다.
 * 안내문에서 놓치면 사고 나는 문장 하나만 강조하려고 둔 최소 표기다.
 */
const renderEmphasis = (text) => text.split(/(\*\*[^*]+\*\*)/g).map((piece, index) => (
    piece.startsWith('**') && piece.endsWith('**')
        ? <strong key={index}>{piece.slice(2, -2)}</strong>
        : <React.Fragment key={index}>{piece}</React.Fragment>
));

export default TeacherGuideButton;
