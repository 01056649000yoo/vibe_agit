import React, { useEffect, useRef, useState } from 'react';

/**
 * 헤더의 학급 바꾸기 단추 + 목록.
 *
 * 브라우저 기본 `select` 로 만들었다가 직접 만든 목록으로 바꿨다(2026-08-10).
 * 기본 목록은 **브라우저가 그리는 영역이라 CSS 가 닿지 않는다** — 항목 좌우 여백을 줄 수 없어
 * 학급 이름이 상자 모서리에 붙었고, 목록 폭·펼침 위치도 `select` 요소 크기에 끌려다녔다.
 * 여백을 세 번 손봤지만 같은 자리에서 계속 막혀서, 통제 가능한 방식으로 바꿨다.
 *
 * 기본 `select` 를 버리면서 잃는 것(키보드·바깥 클릭·Esc)은 여기서 직접 처리한다.
 */
const ClassSwitcher = ({ classes, activeClass, onSelect }) => {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;

        const closeOnOutside = (event) => {
            if (!wrapRef.current?.contains(event.target)) setOpen(false);
        };
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') setOpen(false);
        };

        document.addEventListener('mousedown', closeOnOutside);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('mousedown', closeOnOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

    return (
        <div className="teacher-class-switchwrap" ref={wrapRef}>
            <button
                type="button"
                className="teacher-class-bar__switch"
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen(value => !value)}
            >
                <span>바꾸기</span>
                <span className="teacher-class-bar__caret" aria-hidden="true">▾</span>
            </button>

            {open && (
                <ul className="teacher-class-menu" role="listbox" aria-label="학급 고르기">
                    {classes.map((cls) => {
                        const selected = cls.id === activeClass?.id;
                        return (
                            <li key={cls.id} role="option" aria-selected={selected}>
                                <button
                                    type="button"
                                    className={`teacher-class-menu__item${selected ? ' is-selected' : ''}`}
                                    onClick={() => {
                                        if (!selected) onSelect(cls);
                                        setOpen(false);
                                    }}
                                >
                                    {/* 체크 자리를 항상 비워 두어 이름 시작선이 위아래로 흔들리지 않게 한다 */}
                                    <span className="teacher-class-menu__check" aria-hidden="true">{selected ? '✓' : ''}</span>
                                    <span className="teacher-class-menu__label">{cls.name}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default ClassSwitcher;
