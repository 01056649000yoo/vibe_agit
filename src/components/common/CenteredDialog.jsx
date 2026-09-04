import React, { useEffect, useId } from 'react';
import ModalPortal from './ModalPortal';
import ModalCloseButton from './ModalCloseButton';

/**
 * 기본/Fullscreen API 양쪽에서 쓰는 공통 중앙 대화상자 셸.
 * 내용 컴포넌트는 데이터 표현만 맡고 중앙 배치·헤더·닫기·Esc·스크롤 잠금은 여기서 처리한다.
 */
const CenteredDialog = ({
    isOpen = true,
    onClose,
    container,
    eyebrow,
    title,
    description,
    children,
    maxWidth = '900px',
    maxHeight = '90dvh',
    zIndex = 26000,
    closeLabel,
    /*
     * 제목은 기본이 한 줄이고 넘치면 …로 잘린다. 자리 이름처럼 짧은 말에는 그게 맞다.
     * 다만 아이 이름이 들어가는 물음("○○○ 학생의 글을 승인할까요?")은 잘리면 안 되므로
     * 부르는 쪽이 줄 수를 늘릴 수 있게 한다(2026-09-03).
     */
    titleLines = 1,
    bodyPadding = 'var(--ui-space-5) var(--ui-space-6) var(--ui-space-6)'
}) => {
    const titleId = useId();

    useEffect(() => {
        if (!isOpen) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return <ModalPortal container={container}>
        <div role="presentation" onClick={onClose} style={{
            position: 'fixed', inset: 0, zIndex, display: 'grid', placeItems: 'center', padding: 'var(--ui-space-5)',
            background: 'rgba(15,23,42,.62)', backdropFilter: 'blur(7px)'
        }}>
            <section role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()} style={{
                width: `min(${maxWidth},100%)`, maxHeight, overflowY: 'auto', border: '1px solid var(--ui-border)',
                borderRadius: 'var(--ui-radius-xl)', background: 'var(--ui-page)', boxShadow: 'var(--ui-shadow-modal)'
            }}>
                <header style={{
                    position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 'var(--ui-space-4)', padding: 'var(--ui-space-5) var(--ui-space-6)',
                    /*
                     * 머리말을 옅은 파랑으로 (2026-09-04).
                     *
                     * 예전에는 진한 파랑 위에 흰 글씨였다. 대시보드의 다른 카드보다 짙어 창만 튀어 보였고,
                     * **오른쪽 끝(#0EA5E9)은 흰 글씨 대비가 2.77:1** 이라 큰 글씨 기준(3:1)에도 못 미쳤다.
                     * 설명·꼬리표는 12px 작은 글씨라 4.5:1 이 필요한데 한참 모자랐다.
                     * 옅은 바탕에 진한 글씨로 뒤집으니 **6.16:1** 이 되어 더 옅으면서 더 잘 읽힌다.
                     */
                    color: 'var(--ui-ink-strong)',
                    background: 'linear-gradient(135deg,var(--ui-primary-soft),#e0f2fe)',
                    borderBottom: '1px solid var(--ui-primary-border)'
                }}>
                    <div style={{ minWidth: 0 }}>
                        {eyebrow && <p style={{ margin: '0 0 3px', fontSize: 'var(--ui-font-xs)', fontWeight: 800, opacity: .82 }}>{eyebrow}</p>}
                        <h2 id={titleId} style={{
                            margin: 0, color: 'var(--ui-primary-hover)', background: 'none', WebkitTextFillColor: 'currentColor',
                            fontSize: 'var(--ui-font-xl)', fontWeight: 950, lineHeight: 1.2,
                            overflow: 'hidden',
                            ...(titleLines > 1
                                ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: titleLines, overflowWrap: 'anywhere' }
                                : { textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
                        }}>{title}</h2>
                        {description && <p style={{ margin: '5px 0 0', fontSize: 'var(--ui-font-xs)', fontWeight: 750, lineHeight: 1.45, opacity: .9 }}>{description}</p>}
                    </div>
                    {/* 머리말이 옅은 색이 되어 기본(연회색 원) 단추를 쓴다 */}
                    <ModalCloseButton onClick={onClose} label={closeLabel || `${title} 닫기`} />
                </header>
                <div style={{ padding: bodyPadding }}>{children}</div>
            </section>
        </div>
    </ModalPortal>;
};

export default CenteredDialog;
