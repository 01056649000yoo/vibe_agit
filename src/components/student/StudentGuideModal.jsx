import React from 'react';
import Button from '../common/Button';
import Modal from '../common/Modal';
import { STUDENT_GUIDE_SECTIONS } from './studentGuide';
import './StudentGuideModal.css';

/** 학생 홈 전체 사용법 — 설명을 읽고 실제 메뉴로 바로 이동한다. */
const StudentGuideModal = ({ isOpen, onClose, onSelectDestination }) => (
    <Modal isOpen={isOpen} onClose={onClose} title="끄적끄적 아지트 사용법" maxWidth="780px">
        <div className="student-guide">
            <div className="student-guide__intro">
                <span aria-hidden="true">🗺️</span>
                <div>
                    <strong>하고 싶은 일을 골라 보세요.</strong>
                    <p>설명을 읽고 ‘바로 가기’ 버튼을 누르면 그 메뉴로 갈 수 있어요.</p>
                </div>
            </div>

            {STUDENT_GUIDE_SECTIONS.map((section) => (
                <section className="student-guide__section" key={section.id} aria-labelledby={`student-guide-${section.id}`}>
                    <header>
                        <h4 id={`student-guide-${section.id}`}>{section.title}</h4>
                        <p>{section.description}</p>
                    </header>
                    <div className="student-guide__grid">
                        {section.items.map((item) => (
                            <article className="student-guide__card" key={item.id}>
                                <span className="student-guide__icon" aria-hidden="true">{item.icon}</span>
                                <div className="student-guide__copy">
                                    <h5>{item.title}</h5>
                                    <p>{item.description}</p>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="student-guide__move"
                                    onClick={() => onSelectDestination(item.destination)}
                                    aria-label={`${item.title} 메뉴로 가기`}
                                >
                                    {item.ctaLabel}<span aria-hidden="true">→</span>
                                </Button>
                            </article>
                        ))}
                    </div>
                </section>
            ))}

            <p className="student-guide__tip">
                💡 다른 화면에서 뒤로 가기를 누르면 학생 홈이나 바로 전 목록으로 돌아와요.
            </p>
        </div>
    </Modal>
);

export default StudentGuideModal;
