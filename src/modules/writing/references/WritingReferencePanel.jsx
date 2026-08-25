import { useId, useRef, useState } from 'react';
import { BookOpenText, ChevronDown, ChevronUp, PanelsTopLeft } from 'lucide-react';
import './WritingReferencePanel.css';

/**
 * 글쓰기 입력창을 가리지 않고 옆에 펼쳐 두는 공통 참고함 셸.
 *
 * 이 컴포넌트는 데이터 조회나 본문 변경을 하지 않는다. 선생님 질문은 문자열 섹션으로,
 * 지연 조회가 필요한 연구소 자료는 renderSources 슬롯으로 받아 새 출처를 붙여도 글쓰기
 * 저장 흐름과 분리한다.
 */
/**
 * `extraTabs`: 참고함 안에서 **다른 성격의 갈래**를 하나 더 여는 슬롯.
 *   [{ id, label, icon, render() }]
 * 자료(볼 것)와 맞춤법(고칠 것)은 성격이 달라 한 줄로 쌓으면 스크롤만 길어진다.
 * 갈래가 하나뿐이면 탭 막대를 그리지 않아 예전 화면 그대로다.
 */
const WritingReferencePanel = ({ sections = [], renderSources, extraTabs = [], children }) => {
    const [isOpen, setIsOpen] = useState(false);
    // 기본 갈래는 **맨 앞 갈래**다. 맞춤법을 쓰는 학급에서는 참고함을 열면 맞춤법이 먼저 보이고,
    // 참고 자료는 필요할 때 옆 갈래에서 연다(2026-08-20 사용자 결정).
    const [activeTab, setActiveTab] = useState(null);
    const panelId = useId();
    const triggerRef = useRef(null);
    // 갈래 순서는 `맞춤법 → 참고 자료`다(2026-08-20 사용자 요청). 자료는 늘 있는 것이라 오른쪽에 둔다.
    const tabs = [
        ...extraTabs.filter((tab) => tab && tab.id && typeof tab.render === 'function'),
        { id: 'sources', label: '참고 자료', icon: '📚' }
    ];
    const defaultTabId = tabs[0]?.id ?? 'sources';
    const currentTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : defaultTabId;
    const visibleSections = sections.filter((section) => (
        section
        && Array.isArray(section.items)
        && section.items.length > 0
    ));

    /*
     * 참고 자료 안의 **칩**. 예전에는 선생님 안내·선생님 질문·연구소 자료를 **한 줄로 다 쌓아** 보여
     * 오른쪽이 지저분했다(2026-08-25 지적). 이제 하나만 골라 펼치고, 바꾸고 싶을 때 칩을 누른다.
     *
     * ⚠️ 여기서 고르는 것은 **내 화면에서 무엇을 펼칠지**일 뿐이다. 연구소 개요를 글에 묶는
     *    `고정`(서버에 저장, 선생님도 봄)과는 **다른 것**이라 같은 말을 쓰지 않는다.
     */
    const chips = [
        ...visibleSections.map((section) => ({ id: section.id, label: section.eyebrow || section.title })),
        ...(renderSources ? [{ id: 'lab-sources', label: '글쓰기 연구소 자료' }] : [])
    ];
    const [activeChip, setActiveChip] = useState(null);
    const defaultChipId = chips[0]?.id ?? null;
    const currentChip = chips.some((chip) => chip.id === activeChip) ? activeChip : defaultChipId;

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
                {/* 참고함이 무엇을 하는 곳인지 옆에 한 줄로 알려 준다(2026-08-19 사용자 요청). */}
                <div className="writing-reference-position-note">
                    <PanelsTopLeft size={19} aria-hidden="true" />
                    <span>
                        <strong>
                            선생님 질문과 내 연구소 자료를 펼쳐 두는 곳이에요
                            {tabs.length > 1 && <> · 여기서 <b>맞춤법 검사</b>도 해요</>}
                        </strong>
                        <small>글을 쓰면서 옆에 두고 볼 수 있어요. 가로 화면에서는 오른쪽, 세로 화면에서는 입력창 위에 보여요.</small>
                    </span>
                </div>
            </div>

            {tabs
                .filter((tab) => tab.cta && (!isOpen || currentTab !== tab.id))
                .map((tab) => (
                    <button
                        key={`cta-${tab.id}`}
                        type="button"
                        className="writing-reference-cta"
                        onClick={() => {
                            setActiveTab(tab.id);
                            setIsOpen(true);
                        }}
                    >
                        <span className="writing-reference-cta__icon" aria-hidden="true">{tab.icon}</span>
                        <span className="writing-reference-cta__text">
                            <strong>{tab.cta.label}</strong>
                            {tab.cta.hint && <small>{tab.cta.hint}</small>}
                        </span>
                        <span className="writing-reference-cta__go" aria-hidden="true">열기 →</span>
                    </button>
                ))}

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

                    {tabs.length > 1 && (
                        <div className="writing-reference-tabs" role="tablist" aria-label="참고함 갈래">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={currentTab === tab.id}
                                    className={currentTab === tab.id ? 'is-active' : ''}
                                    onClick={() => setActiveTab(tab.id)}
                                >
                                    <span aria-hidden="true">{tab.icon}</span>
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {currentTab !== 'sources' && (
                        <div className="writing-reference-panel__body">
                            {tabs.find((tab) => tab.id === currentTab)?.render()}
                        </div>
                    )}

                    <div className="writing-reference-panel__body" hidden={currentTab !== 'sources'}>
                        {chips.length > 1 && (
                            <div className="writing-reference-chips" role="tablist" aria-label="참고 자료 종류">
                                {chips.map((chip) => (
                                    <button
                                        key={chip.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={currentChip === chip.id}
                                        className={currentChip === chip.id ? 'is-active' : ''}
                                        onClick={() => setActiveChip(chip.id)}
                                    >
                                        {chip.label}
                                    </button>
                                ))}
                            </div>
                        )}
                        {visibleSections.length === 0 && !renderSources ? (
                            <div className="writing-reference-empty">
                                <span aria-hidden="true">🗂️</span>
                                <strong>현재 글에 연결된 참고 자료가 없어요.</strong>
                                <p>참고 자료가 준비되면 이곳에 펼쳐 두고 글을 쓸 수 있어요.</p>
                            </div>
                        ) : visibleSections.filter((section) => section.id === currentChip).map((section) => (
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
                        {currentChip === 'lab-sources' && renderSources?.({ isOpen: isOpen && currentTab === 'sources' })}
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
