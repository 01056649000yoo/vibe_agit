import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import ModalPortal from '../common/ModalPortal';
import ModalCloseButton from '../common/ModalCloseButton';

/**
 * 아지트 놀이터 — 포인트로 즐기는 놀거리 모음.
 *
 * 교사 화면의 `아지트 놀이터`에서 켜고 끈 모듈이 그대로 여기에 나온다.
 * 나의 아지트(내 기록)와는 성격이 달라 하단 메뉴에서 따로 연다.
 */

const INK = '#3E2E23';
const INK_SOFT = '#8D7B6C';
const LINE = 'rgba(62,46,35,.10)';

const AgitPlayground = ({ isOpen, onClose, items = [] }) => {
    // onClose 는 부모에서 인라인 화살표로 넘어와 매 렌더 새 함수다.
    // 의존성에 두면 부모가 리렌더될 때마다 pushState 가 쌓인다.
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

    useEffect(() => {
        if (!isOpen) return undefined;
        window.history.pushState({ studentPage: 'main', overlay: 'playground' }, '');
        const closeOnBack = () => onCloseRef.current?.();
        window.addEventListener('popstate', closeOnBack);
        return () => window.removeEventListener('popstate', closeOnBack);
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <ModalPortal>
            <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                transition={{ type: 'spring', damping: 26, stiffness: 210 }}
                style={{
                    position: 'fixed', inset: 0, zIndex: 3100, overflowY: 'auto',
                    background: 'linear-gradient(180deg,#FFFDF5 0%,#FFF8E1 100%)'
                }}
            >
                <div style={{ width: 'min(560px, 100%)', margin: '0 auto', padding: '18px 18px 90px' }}>
                    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: INK }}>🎡 아지트 놀이터</h2>
                        <ModalCloseButton onClick={onClose} label="아지트 놀이터 닫기" />
                    </header>
                    <p style={{ margin: '0 0 16px', fontSize: '.84rem', color: INK_SOFT, fontWeight: 700 }}>
                        모은 포인트로 즐기는 놀거리예요.
                    </p>

                    {items.length === 0 ? (
                        <div style={{
                            padding: '60px 20px', textAlign: 'center', borderRadius: '20px',
                            border: `2px dashed ${LINE}`, color: INK_SOFT, fontWeight: 800
                        }}>
                            <div style={{ fontSize: '2.4rem', marginBottom: '10px' }}>🎠</div>
                            아직 열린 놀거리가 없어요.<br />선생님이 켜 주시면 여기에 나타나요!
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
                            {items.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={item.onOpen}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '14px', width: '100%',
                                        padding: '18px 18px', borderRadius: '20px', cursor: 'pointer',
                                        border: `2px solid ${item.borderColor || '#FFE082'}`,
                                        background: item.background || 'white',
                                        textAlign: 'left', boxSizing: 'border-box'
                                    }}
                                >
                                    <span aria-hidden="true" style={{ fontSize: '2.2rem' }}>{item.icon}</span>
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'block', fontWeight: 900, color: INK, fontSize: '1.05rem' }}>{item.name}</span>
                                        <span style={{ display: 'block', marginTop: '3px', fontSize: '.82rem', color: INK_SOFT, fontWeight: 700 }}>
                                            {item.badge || item.description}
                                        </span>
                                    </span>
                                    <span style={{ fontSize: '.85rem', fontWeight: 900, color: '#F9A825', whiteSpace: 'nowrap' }}>열기 ›</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>
        </ModalPortal>
    );
};

export default AgitPlayground;
