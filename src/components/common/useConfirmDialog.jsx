import React, { useCallback, useRef, useState } from 'react';
import Button from './Button';
import CenteredDialog from './CenteredDialog';

/*
 * 앱 안에서 묻는 확인 창.
 *
 * 왜 만드나(2026-09-03): 지금까지는 브라우저 기본 창(`window.confirm`)으로 물었다. 그런데
 *  - 눌러도 화면 안에서는 아무 변화가 없어 "안 눌렸나?" 싶어 또 누르게 되고,
 *  - 크롬이 "이 페이지에서 추가 대화상자를 표시하지 않음"으로 막아 버리면 `confirm` 이 조용히
 *    거짓을 돌려주어 **버튼을 눌러도 아무 일도 일어나지 않는다**. 사람은 원인을 알 길이 없다.
 *  - 글씨 크기를 맞출 수 없어 아이 이름이 길면 잘린다.
 *
 * 쓰는 법은 기존 `confirm` 과 거의 같게 뒀다. 한 줄만 바꾸면 된다:
 *     if (!confirm('...')) return;      →      if (!await ask({ title: '...' })) return;
 *
 * ⚠️ 머리말 위 꼬리표(eyebrow)는 쓰지 않는다 — CenteredDialog 의 꼬리표는 0.75rem 이라
 *    글자 바닥(0.8rem)보다 작다. 필요한 말은 제목에 담는다.
 *
 * ⚠️ 전역 제공자(Provider)를 두지 않는다. 창을 그릴 자리를 쓰는 쪽이 정하도록
 *    `confirmDialog` 를 함께 돌려준다 — 앱 전체를 감싸지 않아 번지는 범위가 좁다.
 */

const EMPTY = Object.freeze({ open: false });

export default function useConfirmDialog() {
    const [request, setRequest] = useState(EMPTY);
    // 답을 기다리는 쪽에 알려 줄 통로. 창이 한 번에 하나만 뜨므로 하나면 된다.
    const resolveRef = useRef(null);

    const settle = useCallback((answer) => {
        setRequest(EMPTY);
        const resolve = resolveRef.current;
        resolveRef.current = null;
        if (resolve) resolve(answer);
    }, []);

    const ask = useCallback((options = {}) => {
        // ⚠️ 앞의 물음이 아직 열려 있으면 그것부터 닫고 '아니오'로 답한다.
        //    안 그러면 앞의 물음을 기다리던 쪽이 영원히 멈춘 채로 남는다.
        if (resolveRef.current) settle(false);
        return new Promise((resolve) => {
            resolveRef.current = resolve;
            setRequest({ open: true, ...options });
        });
    }, [settle]);

    const confirmDialog = request.open ? (
        <CenteredDialog
            isOpen
            onClose={() => settle(false)}
            title={request.title}
            maxWidth="440px"
            titleLines={3}
            closeLabel={`${request.title} 묻는 창 닫기`}
        >
            {request.body ? (
                <p style={{
                    margin: '0 0 var(--ui-space-5)',
                    color: 'var(--ui-ink-muted)',
                    fontSize: 'var(--ui-text-md)',
                    fontWeight: 700,
                    lineHeight: 1.6,
                    whiteSpace: 'pre-line'
                }}>{request.body}</p>
            ) : null}
            <div style={{ display: 'flex', gap: 'var(--ui-space-3)', justifyContent: 'flex-end' }}>
                {/*
                  * 알리기만 하는 창(실패 안내 같은 것)은 단추가 하나다.
                  * 고를 것이 없는데 둘을 두면 어느 쪽이 무엇인지 헷갈린다.
                  */}
                {request.acknowledgeOnly ? null : (
                    <Button type="button" variant="ghost" onClick={() => settle(false)}>
                        {request.cancelLabel || '그만두기'}
                    </Button>
                )}
                <Button
                    type="button"
                    variant={request.tone === 'danger' ? 'danger' : 'primary'}
                    onClick={() => settle(true)}
                    autoFocus
                >
                    {request.confirmLabel || '네, 할게요'}
                </Button>
            </div>
        </CenteredDialog>
    ) : null;

    return { ask, confirmDialog };
}
