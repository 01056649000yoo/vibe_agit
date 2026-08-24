import { useEffect } from 'react';
import ModalPortal from '../../../components/common/ModalPortal';
import NameSizeControl from './NameSizeControl';

/*
 * 결과를 화면 가득 채워 보여 준다.
 *
 * 교실 전자칠판으로 볼 때 창 안에 들어 있으면 이름을 아무리 키워도 칸이 좁다(2026-08-24 지적).
 * 여기서는 추첨기·설명 같은 것을 다 걷어내고 **결과판만** 화면 전체에 놓는다.
 *
 * 이름 크기는 다른 화면과 **같은 값**을 쓴다 — 여기서 고치면 창에도 그대로 남는다.
 */
export default function FullscreenResultView({ title, sizeId, onSizeChange, scale, onClose, actions = null, children }) {
    // 전체 화면 동안에는 뒤쪽이 스크롤되지 않게 하고, Esc 로 닫는다.
    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (event) => { if (event.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKey);
        };
    }, [onClose]);

    return <ModalPortal>
        <div
            className="arrange-fullscreen"
            style={{ '--arrange-name-scale': scale }}
            role="dialog"
            aria-modal="true"
            aria-label={`${title} 전체 화면`}
        >
            <header>
                <strong>{title}</strong>
                <NameSizeControl sizeId={sizeId} onChange={onSizeChange} />
                <button type="button" onClick={onClose}>전체 화면 닫기</button>
            </header>
            {actions}
            <div className="arrange-fullscreen-body">{children}</div>
        </div>
    </ModalPortal>;
}
