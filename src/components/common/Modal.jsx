import React, { useEffect, useId } from 'react';
import Button from './Button';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 범용 모달 컴포넌트
 * @param {boolean} isOpen 모달 표시 여부
 * @param {function} onClose 모달 닫기 함수
 * @param {string} title 모달 제목
 * @param {React.ReactNode} children 모달 내용
 * @param {string} maxWidth 최대 너비 (기본값: 500px)
 */
const Modal = ({ isOpen, onClose, title, children, maxWidth = '600px' }) => {
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

    return (
        <AnimatePresence>
            {isOpen && (
                <div role="presentation" style={{
                    position: 'fixed', inset: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.58)',
                    display: 'grid', placeItems: 'center',
                    zIndex: 9999, backdropFilter: 'blur(6px)',
                    padding: 'var(--ui-space-5)'
                }} onClick={onClose}>
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        initial={{ scale: 0.97, opacity: 0, y: 12 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.97, opacity: 0, y: 12 }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '100%',
                            maxWidth: maxWidth,
                            maxHeight: '85vh',
                            display: 'flex',
                            flexDirection: 'column',
                            backgroundColor: 'var(--ui-surface)',
                            border: '1px solid var(--ui-border)',
                            borderRadius: 'var(--ui-radius-xl)',
                            boxShadow: 'var(--ui-shadow-modal)',
                            overflow: 'hidden'
                        }}
                    >
                        {/* 헤더 섹션 (고정) */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: 'var(--ui-space-5) var(--ui-space-6)',
                            borderBottom: '1px solid var(--ui-border)',
                            backgroundColor: 'var(--ui-surface)',
                            zIndex: 10
                        }}>
                            <h3 id={titleId} style={{ margin: 0, color: 'var(--ui-ink-strong)', fontWeight: '900', fontSize: 'var(--ui-font-lg)' }}>{title}</h3>
                            <button
                                type="button"
                                onClick={onClose}
                                className="ui-icon-button"
                                aria-label={`${title} 닫기`}
                                style={{
                                    flexShrink: 0,
                                    background: 'var(--ui-surface-muted)',
                                    color: 'var(--ui-ink-muted)'
                                }}
                            >
                                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none">
                                    <path d="M5 5L19 19M19 5L5 19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                                </svg>
                            </button>
                        </div>

                        {/* 콘텐츠 섹션 (스크롤 가능) */}
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: 'var(--ui-space-6)',
                            backgroundColor: 'var(--ui-surface)',
                            /* 스크롤바 커스텀 */
                            scrollbarWidth: 'thin',
                            scrollbarColor: 'var(--ui-border-strong) transparent'
                        }}>
                            {children}
                        </div>

                        {/* 푸터 섹션 (고정) */}
                        <div style={{
                            padding: 'var(--ui-space-5) var(--ui-space-6) var(--ui-space-6)',
                            display: 'flex',
                            justifyContent: 'center',
                            borderTop: '1px solid var(--ui-border)',
                            backgroundColor: 'var(--ui-page)'
                        }}>
                            <Button
                                onClick={onClose}
                                style={{
                                    width: '100%',
                                    maxWidth: '120px',
                                    fontWeight: 'bold',
                                    minHeight: 'var(--ui-control-md)'
                                }}
                            >
                                확인
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default Modal;
