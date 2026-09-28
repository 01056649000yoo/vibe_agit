import { useEffect, useRef, useState } from 'react';

/*
 * 머리말 단축 단추 옆의 작은 ▾ — 학급운영도구를 펼쳐 하나를 고르면 그 도구가 단축 단추에 고정된다
 * (2026-09-28 선생님 요청). 고르기만 하고 열지는 않는다 — 여는 것은 단축 단추가 한다.
 *
 * 기본 `select` 를 쓰지 않으므로 바깥 누름·Esc 는 여기서 직접 처리한다(TeacherAccountMenu 와 같은 방식).
 * 동행 모드가 짚는 자리(`우리 반 스크린`)는 이 메뉴 안이 아니라 단축 단추에 있다 — 숨은 단추에는 테두리를 못 씌운다.
 */
const TeacherToolPinMenu = ({ tools, pinnedId, onPin }) => {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);
    const toggleRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const closeOnOutside = (event) => { if (!wrapRef.current?.contains(event.target)) setOpen(false); };
        const closeOnEscape = (event) => {
            if (event.key !== 'Escape') return;
            setOpen(false);
            toggleRef.current?.focus();
        };
        document.addEventListener('mousedown', closeOnOutside);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('mousedown', closeOnOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

    const pick = (toolId) => {
        setOpen(false);
        onPin(toolId);
        toggleRef.current?.focus();
    };

    return (
        <div className="teacher-tool-pin" ref={wrapRef}>
            <button
                ref={toggleRef}
                type="button"
                className="teacher-tool-pin__toggle"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="단축 단추에 고정할 학급운영도구 고르기"
                title="단축 단추에 고정할 도구 고르기"
                onClick={() => setOpen((value) => !value)}
            >
                <span aria-hidden="true">▾</span>
            </button>
            {open && (
                <div className="teacher-tool-pin__menu" role="menu" aria-label="단축 단추에 고정할 학급운영도구">
                    <p className="teacher-tool-pin__heading">단축 단추에 고정할 도구</p>
                    {tools.map((tool) => {
                        const pinned = tool.id === pinnedId;
                        return (
                            <button
                                key={tool.id}
                                type="button"
                                role="menuitemradio"
                                aria-checked={pinned}
                                className={`teacher-tool-pin__item${pinned ? ' is-pinned' : ''}`}
                                onClick={() => pick(tool.id)}
                            >
                                <span aria-hidden="true">{tool.icon || '🧩'}</span>
                                <span className="teacher-tool-pin__name">{tool.name}</span>
                                {pinned && <span className="teacher-tool-pin__check">📌 고정됨</span>}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default TeacherToolPinMenu;
