import { useEffect, useRef, useState } from 'react';

/*
 * 머리말 오른쪽 끝의 계정 메뉴.
 *
 * 왜 접나 (2026-09-14 지적: "메뉴가 너무 정신이 없다"):
 *   머리말 한 줄에 여덟 개가 같은 크기·같은 회색으로 늘어서 있었다. 매일 쓰는 것(활용 안내서·
 *   우리 반 스크린)과 어쩌다 쓰는 것(정보 수정·로그아웃)이 구별되지 않았고, 강조가 넷이라
 *   (노랑 오류 알림·주황 관리자·빨강 로그아웃·빨간 배지) **강조가 없는 것과 같았다.**
 *   특히 로그아웃이 빨강이라 하루에 한 번 쓸까 말까 한 단추가 제일 튀었다.
 *
 *   그래서 어쩌다 쓰는 것만 여기 접는다. 자주 쓰는 것은 밖에 남는다.
 *
 * 동행 모드가 짚는 자리는 접지 않는다 — 숨은 단추에는 테두리를 씌울 수 없어 그 단계에서
 * 선생님이 갇힌다. `우리 반 스크린`(class-board-open)이 그런 자리라 머리말에 그대로 둔다.
 *
 * 기본 `select` 를 쓰지 않으므로 바깥 누름·Esc 는 여기서 직접 처리한다(ClassSwitcher 와 같은 방식).
 */
const TeacherAccountMenu = ({ teacherName, isAdmin, onOpenAdmin, onEditProfile, onLogout }) => {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const closeOnOutside = (event) => { if (!wrapRef.current?.contains(event.target)) setOpen(false); };
        const closeOnEscape = (event) => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', closeOnOutside);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('mousedown', closeOnOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

    const pick = (action) => { setOpen(false); action(); };

    return (
        <div className="teacher-account" ref={wrapRef}>
            <button
                type="button"
                className="teacher-account__trigger"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`${teacherName || '선생님'} 계정 메뉴`}
                onClick={() => setOpen((value) => !value)}
            >
                <span aria-hidden="true">🙂</span>
                <span className="teacher-account__name">{teacherName || '선생님'}</span>
                <span aria-hidden="true">▾</span>
            </button>
            {open && (
                <div className="teacher-account__menu" role="menu" aria-label="계정 메뉴">
                    {isAdmin && (
                        <button type="button" role="menuitem" className="teacher-account__item is-admin" onClick={() => pick(onOpenAdmin)}>
                            🛡️ 관리자
                        </button>
                    )}
                    <button type="button" role="menuitem" className="teacher-account__item" onClick={() => pick(onEditProfile)}>
                        ⚙️ 내 정보 수정
                    </button>
                    <button type="button" role="menuitem" className="teacher-account__item is-leave" onClick={() => pick(onLogout)}>
                        로그아웃
                    </button>
                </div>
            )}
        </div>
    );
};

export default TeacherAccountMenu;
