import TeacherCountBadge from './TeacherCountBadge';
import './TeacherSideMenu.css';

/**
 * 교사 화면 왼쪽 메뉴 — 세부 메뉴(글쓰기·학급 운영…), 학급운영도구, 설정이 모두 이것을 쓴다.
 *
 * 전에는 세 곳이 따로 그려 폭(180–240·220·300px)·배경·선택 색이 달랐고, 메뉴를 옮길 때마다
 * 본문이 시작하는 자리가 움직였다(2026-09-26 UI 점검). 폭은 `.teacher-side-layout` 이 한 곳에서 정한다.
 *
 * `semantics` 는 자리마다 원래 뜻을 지킨다 — 세부 메뉴는 탭(`aria-selected`), 도구·설정은 쪽 이동
 * (`aria-current`). 동행 모드는 둘 다 "열렸다"로 읽는다(TeacherTourCompanion 의 isOpenedMenu).
 *
 * @param {{ id: string, label: string, icon?: string, description?: string, tag?: string,
 *           badge?: { count: number, label: string }, anchor?: object }[]} items
 */
const TeacherSideMenu = ({ items, activeId, onSelect, ariaLabel, heading, note, horizontal = false, semantics = 'nav' }) => {
    const isTabs = semantics === 'tabs';
    const List = isTabs ? 'div' : 'nav';
    return (
        <aside className={`teacher-side-menu${horizontal ? ' is-horizontal' : ''}`}>
            {heading && !horizontal ? (
                <div className="teacher-side-menu__heading">
                    <strong>{heading}</strong>
                    {note ? <p>{note}</p> : null}
                </div>
            ) : null}
            <List className="teacher-side-menu__list" role={isTabs ? 'tablist' : undefined} aria-label={ariaLabel}>
                {items.map((item) => {
                    const active = item.id === activeId;
                    const state = isTabs
                        ? { role: 'tab', 'aria-selected': active }
                        : { 'aria-current': active ? 'page' : undefined };
                    return (
                        <button
                            key={item.id}
                            type="button"
                            className={`teacher-side-menu__item${active ? ' is-active' : ''}`}
                            onClick={() => onSelect(item.id)}
                            {...state}
                            {...item.anchor}
                        >
                            {item.icon ? <span className="teacher-side-menu__icon" aria-hidden="true">{item.icon}</span> : null}
                            <span className="teacher-side-menu__text">
                                <span className="teacher-side-menu__label">
                                    {item.label}
                                    {item.tag ? <span className="teacher-side-menu__tag">{item.tag}</span> : null}
                                </span>
                                {item.description && !horizontal ? (
                                    <span className="teacher-side-menu__description">{item.description}</span>
                                ) : null}
                            </span>
                            {item.badge ? <TeacherCountBadge count={item.badge.count} label={item.badge.label} /> : null}
                        </button>
                    );
                })}
            </List>
        </aside>
    );
};

export default TeacherSideMenu;
