import React, { useEffect, useRef } from 'react';
import ModalPortal from '../../../components/common/ModalPortal';
import ModalCloseButton from '../../../components/common/ModalCloseButton';
import MyTitleStatusPanel from '../title-status/MyTitleStatusPanel';
import StudentWritingFootprintStats from './StudentWritingFootprintStats';
import { GRID, INK, INK_SOFT } from './FootprintVisuals';
import { useMyWritingFootprint } from './useMyWritingFootprint';

/** 모달은 로딩·닫기·칭호 결합만 맡고, 발자국 본문은 독립 모듈에 위임한다. */
const WritingFootprintModal = ({ isOpen, onClose, studentSession, points = 0 }) => {
    const { detail, loading, errorMessage } = useMyWritingFootprint(isOpen);

    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
    useEffect(() => {
        if (!isOpen) return undefined;
        window.history.pushState({ studentPage: 'main', overlay: 'footprint' }, '');
        const closeOnBack = () => onCloseRef.current?.();
        window.addEventListener('popstate', closeOnBack);
        return () => window.removeEventListener('popstate', closeOnBack);
    }, [isOpen]);

    if (!isOpen) return null;
    return <ModalPortal>
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, zIndex: 3200, background: 'rgba(45,32,24,.55)',
            backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
            <div onClick={(event) => event.stopPropagation()} style={{
                width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto',
                background: '#FFFDF7', borderRadius: '28px', boxShadow: '0 24px 60px rgba(45,32,24,.28)'
            }}>
                <header style={{
                    position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: '12px', padding: '20px 22px 14px',
                    background: '#FFFDF7', borderBottom: `1px solid ${GRID}`
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: INK }}>👣 나의 글쓰기 발자국</h2>
                    <ModalCloseButton onClick={onClose} label="글쓰기 발자국 닫기" />
                </header>
                <div style={{ padding: '4px 22px 26px' }}>
                    {loading ? <p style={{ padding: '70px 0', textAlign: 'center', color: INK_SOFT, fontWeight: 800 }}>발자국을 모아보는 중... 👣</p>
                        : errorMessage ? <p style={{ padding: '60px 0', textAlign: 'center', color: '#C62828', fontWeight: 800 }}>{errorMessage}</p>
                            : <>
                                <MyTitleStatusPanel active={isOpen} studentSession={studentSession} points={points} />
                                <StudentWritingFootprintStats detail={detail} />
                            </>}
                </div>
            </div>
        </div>
    </ModalPortal>;
};

export default WritingFootprintModal;
