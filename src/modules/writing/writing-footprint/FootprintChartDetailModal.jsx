import React, { useEffect } from 'react';
import ModalPortal from '../../../components/common/ModalPortal';
import FootprintCardContent from './FootprintCardContent';

const FootprintChartDetailModal = ({ card, onClose, container, context }) => {
    useEffect(() => {
        if (!card) return undefined;
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
    }, [card, onClose]);

    if (!card) return null;
    const modalHint = card.modalHint || card.hint;

    return <ModalPortal container={container}>
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, zIndex: 26000, display: 'grid', placeItems: 'center', padding: '18px',
            background: 'rgba(15,23,42,.62)', backdropFilter: 'blur(7px)'
        }}>
            <section role="dialog" aria-modal="true" aria-labelledby="footprint-chart-modal-title" onClick={(event) => event.stopPropagation()} style={{
                width: 'min(980px,100%)', maxHeight: '90dvh', overflowY: 'auto', borderRadius: '24px',
                background: '#F8FAFC', boxShadow: '0 28px 80px rgba(15,23,42,.34)'
            }}>
                <header style={{
                    position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
                    padding: '20px 22px', color: 'white', background: 'linear-gradient(135deg,#1D4ED8,#0EA5E9)', boxShadow: '0 4px 14px rgba(15,23,42,.12)'
                }}>
                    <div style={{ minWidth: 0 }}>
                        <p style={{ margin: '0 0 3px', fontSize: '.76rem', fontWeight: 800, opacity: .82 }}>학급 글쓰기 발자국 크게 보기</p>
                        <h2 id="footprint-chart-modal-title" style={{ margin: 0, fontSize: 'clamp(1.2rem,2.4vw,1.65rem)', fontWeight: 950 }}>{card.title}</h2>
                        <p style={{ margin: '5px 0 0', fontSize: '.8rem', fontWeight: 750, lineHeight: 1.45, opacity: .9 }}>{modalHint}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label={`${card.title} 크게 보기 닫기`} style={{
                        flexShrink: 0, width: '40px', height: '40px', border: '1px solid rgba(255,255,255,.55)', borderRadius: '50%',
                        display: 'grid', placeItems: 'center', padding: 0, lineHeight: 1,
                        color: 'white', background: 'rgba(255,255,255,.16)', cursor: 'pointer'
                    }}>
                        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M5 5L19 19M19 5L5 19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                    </button>
                </header>
                <div style={{ padding: '20px 22px 24px' }}>
                    <FootprintCardContent card={card} context={context} expanded />
                </div>
            </section>
        </div>
    </ModalPortal>;
};

export default FootprintChartDetailModal;
