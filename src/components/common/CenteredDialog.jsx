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
                    gap: 'var(--ui-space-4)', padding: 'var(--ui-space-5) var(--ui-space-6)', color: 'white',
                    background: 'linear-gradient(135deg,var(--ui-primary-hover),#0EA5E9)', boxShadow: 'var(--ui-shadow-sm)'
                }}>
                    <div style={{ minWidth: 0 }}>
                        {eyebrow && <p style={{ margin: '0 0 3px', fontSize: 'var(--ui-font-xs)', fontWeight: 800, opacity: .82 }}>{eyebrow}</p>}
                        <h2 id={titleId} style={{
                            margin: 0, color: 'white', background: 'none', WebkitTextFillColor: 'currentColor',
                            fontSize: 'var(--ui-font-xl)', fontWeight: 950, lineHeight: 1.2,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}>{title}</h2>
                        {description && <p style={{ margin: '5px 0 0', fontSize: 'var(--ui-font-xs)', fontWeight: 750, lineHeight: 1.45, opacity: .9 }}>{description}</p>}
                    </div>
                    {/* 머리말이 진한 색이라 어두운 배경용 */}
                    <ModalCloseButton onClick={onClose} label={closeLabel || `${title} 닫기`} tone="onDark" />
                </header>
                <div style={{ padding: bodyPadding }}>{children}</div>
            </section>
        </div>
    </ModalPortal>;
};

export default CenteredDialog;
