import { useId, useRef, useState } from 'react';
import { BookOpenText, ChevronDown, ChevronUp, PanelsTopLeft } from 'lucide-react';
import './WritingReferencePanel.css';

/**
 * 글쓰기 입력창을 가리지 않고 옆에 펼쳐 두는 공통 참고함 셸.
 *
 * 이 컴포넌트는 데이터 조회나 본문 변경을 하지 않는다. 선생님 질문, 연구소 결과처럼
 * 각 출처가 이미 준비한 문자열 섹션만 받아 표시하므로 새 출처를 붙여도 글쓰기 저장
 * 흐름과 분리된다.
 */
const WritingReferencePanel = ({ sections = [], children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const panelId = useId();
    const triggerRef = useRef(null);
    const visibleSections = sections.filter((section) => (
        section
        && Array.isArray(section.items)
        && section.items.length > 0
    ));

    const closePanel = () => {
        setIsOpen(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
    };

    return (
        <div className={`writing-reference-shell ${isOpen ? 'is-open' : ''}`}>
            <div className="writing-reference-toolbar">
                <button
                    ref={triggerRef}
                    type="button"
                    className="writing-reference-trigger"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setIsOpen((current) => !current)}
                >
                    <BookOpenText size={19} aria-hidden="true" />
                    <span>글쓰기 참고함</span>
                    <small>{isOpen ? '접기' : '열기'}</small>
                    {isOpen
                        ? <ChevronUp size={18} aria-hidden="true" />
                        : <ChevronDown size={18} aria-hidden="true" />}
                </button>
                <div className="writing-reference-position-note">
                    <PanelsTopLeft size={19} aria-hidden="true" />
                    <span>
                        <strong>화면에 맞춰 자리가 달라져요</strong>
                        <small>가로 화면에서는 오른쪽에서 글을 따라오고, 세로 화면에서는 입력창 위에 보여요.</small>
                    </span>
                </div>
            </div>

            <div className="writing-reference-layout">
                <aside
                    id={panelId}
                    className="writing-reference-panel"
                    aria-label="글쓰기 참고함"
                    hidden={!isOpen}
                >
                    <header className="writing-reference-panel__header">
                        <div>
                            <span aria-hidden="true">📚</span>
                            <div>
                                <small>글을 쓰면서 확인해요</small>
                                <h3>글쓰기 참고함</h3>
                            </div>
                        </div>
                        <button type="button" onClick={closePanel} aria-label="글쓰기 참고함 접기">
                            접기
                        </button>
                    </header>

                    <div className="writing-reference-panel__body">
                        {visibleSections.length === 0 ? (
                            <div className="writing-reference-empty">
                                <span aria-hidden="true">🗂️</span>
                                <strong>현재 글에 연결된 참고 자료가 없어요.</strong>
                                <p>참고 자료가 준비되면 이곳에 펼쳐 두고 글을 쓸 수 있어요.</p>
                            </div>
                        ) : visibleSections.map((section) => (
                            <section key={section.id} className="writing-reference-section">
                                <div className="writing-reference-section__heading">
                                    {section.eyebrow && <span>{section.eyebrow}</span>}
                                    <h4>{section.title}</h4>
                                    {section.description && <p>{section.description}</p>}
                                </div>
                                <ol className="writing-reference-list">
                                    {section.items.map((item) => (
                                        <li key={item.id}>
                                            {item.label && <span className="writing-reference-item__label">{item.label}</span>}
                                            <p>{item.text}</p>
                                            {item.supportingText && (
                                                <div className="writing-reference-item__supporting">
                                                    <strong>내가 적은 생각</strong>
                                                    <span>{item.supportingText}</span>
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ol>
                            </section>
                        ))}
                    </div>
                </aside>

                <div className="writing-reference-main">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default WritingReferencePanel;
