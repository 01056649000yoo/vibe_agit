import React, { useState } from 'react';
import Modal from '../common/Modal';
import ModalPortal from '../common/ModalPortal';
import GuideInfoButton from '../common/GuideInfoButton';
import './StudentModuleGuide.css';

/**
 * 학생용 놀이 콘텐츠 안내 — 버튼과 설명 창만 담당하는 공용 껍데기.
 *
 * 안내 **내용은 각 모듈이 소유**하고(`manifest.playground.guide` 또는 모듈 폴더의 자료),
 * 이 컴포넌트는 그 자료를 받아 그리기만 한다. 셸에 모듈별 문구를 넣지 않기 위해서다.
 *
 * 창은 반드시 `ModalPortal` 로 띄운다. 이 버튼이 놓이는 자리(놀이터 카드, 어휘의 탑 지도)가
 * 모두 자기만의 쌓임 맥락을 만들어, 그 안에서 그리면 창이 바깥 요소에 덮인다
 * (`TeacherGuideButton` 에서 겪은 것과 같은 문제).
 */
const StudentModuleGuide = ({ guide, className = '', variant = 'help' }) => {
    const [isOpen, setIsOpen] = useState(false);

    if (!guide?.title || !Array.isArray(guide?.sections) || guide.sections.length === 0) return null;

    return (
        <>
            <GuideInfoButton
                className={className}
                variant={variant}
                label={`${guide.title} 보기`}
                title={guide.title}
                onClick={(event) => {
                    // 카드 전체가 눌리는 자리에 놓이므로 부모의 열기 동작으로 번지지 않게 막는다.
                    event.stopPropagation();
                    setIsOpen(true);
                }}
            />

            <ModalPortal>
                <Modal
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                    title={`💡 ${guide.title}`}
                    maxWidth="600px"
                >
                    <div className="student-module-guide">
                        {guide.lead && <p className="student-module-guide__lead">{guide.lead}</p>}
                        {guide.sections.map((section) => (
                            <section className="student-module-guide__section" key={section.title}>
                                <h4><span aria-hidden="true">{section.icon}</span>{section.title}</h4>
                                <ul>
                                    {section.lines.map((line) => <li key={line}>{line}</li>)}
                                </ul>
                            </section>
                        ))}
                    </div>
                </Modal>
            </ModalPortal>
        </>
    );
};

export default StudentModuleGuide;
