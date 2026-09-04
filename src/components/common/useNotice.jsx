import React, { useCallback, useEffect, useRef, useState } from 'react';
import ModalPortal from './ModalPortal';

/*
 * 일이 끝났다고 알려 주는 띠.
 *
 * 왜 만드나(2026-09-03): 끝났다는 말을 `alert` 로 하면 **사람이 확인을 한 번 더 눌러야** 한다.
 * 글 스무 편을 승인하면 그 확인만 스무 번이다. 알림은 읽기만 하면 되는 것이므로 스스로 사라진다.
 *
 * ⚠️ 실패는 이걸로 알리지 않는다. 실패는 사람이 무언가 해야 하는 일이라 그냥 지나가면 안 된다.
 */

const HOLD_MS = 3200;

export default function useNotice() {
    const [message, setMessage] = useState(null);
    const timerRef = useRef(null);

    const clearTimer = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
    };

    const notify = useCallback((text) => {
        if (!text) return;
        clearTimer();
        // 같은 글이 잇달아 오면 다시 눈에 띄게 한 번 지웠다 띄운다.
        setMessage({ text, at: Date.now() });
        timerRef.current = setTimeout(() => setMessage(null), HOLD_MS);
    }, []);

    // ⚠️ 화면을 떠날 때 타이머를 끄지 않으면 사라진 것에 값을 넣으려다 경고가 난다.
    useEffect(() => clearTimer, []);

    const notice = message ? (
        <ModalPortal>
            <div
                role="status"
                aria-live="polite"
                key={message.at}
                style={{
                    position: 'fixed',
                    top: 'var(--ui-space-6)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 30000,
                    maxWidth: 'min(560px, calc(100vw - 32px))',
                    padding: 'var(--ui-space-4) var(--ui-space-6)',
                    borderRadius: 'var(--ui-radius-lg)',
                    background: '#0F766E',
                    color: 'white',
                    fontSize: 'var(--ui-text-md)',
                    fontWeight: 850,
                    lineHeight: 1.45,
                    boxShadow: 'var(--ui-shadow-modal)',
                    textAlign: 'center'
                }}
            >
                {message.text}
            </div>
        </ModalPortal>
    ) : null;

    return { notify, notice };
}
