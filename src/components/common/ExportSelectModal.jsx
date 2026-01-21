import React, { useState } from 'react';
import Button from './Button';
import Card from './Card';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 엑셀 또는 구글 문서 내보내기 옵션을 선택하는 모달
 * @param {boolean} isOpen 모달 표시 여부
 * @param {function} onClose 모달 닫기 함수
 * @param {string} title 내보낼 대상의 이름 (예: 홍길동, 나의 꿈 미션)
 * @param {function} onConfirm (format, options) => void 내보내기 실행 콜백
 * @param {boolean} isGapiLoaded 구글 API 로드 여부 (비활성화 처리용)
 */
const ExportSelectModal = ({ isOpen, onClose, title, onConfirm, isGapiLoaded }) => {
    const [format, setFormat] = useState('excel'); // 'excel' | 'googleDoc'
    const [usePageBreak, setUsePageBreak] = useState(true);

    const handleConfirm = () => {
        onConfirm(format, { usePageBreak });
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    zIndex: 9999, backdropFilter: 'blur(3px)'
                }} onClick={onClose}>
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Card style={{ width: '360px', padding: '24px', borderRadius: '24px', textAlign: 'center' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📤</div>
                            <h3 style={{ margin: '0 0 8px 0', color: '#2C3E50', fontWeight: '900' }}>데이터 내보내기</h3>
                            <p style={{ color: '#7F8C8D', fontSize: '0.9rem', marginBottom: '24px' }}>
                                <strong>{title}</strong>의 글을 어떤 형식으로 저장할까요?
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                                {/* 엑셀 선택 */}
                                <button
                                    onClick={() => setFormat('excel')}
                                    style={{
                                        padding: '16px', borderRadius: '16px', border: '2px solid',
                                        borderColor: format === 'excel' ? '#27AE60' : '#E9ECEF',
                                        background: format === 'excel' ? '#F1F8E9' : 'white',
                                        color: format === 'excel' ? '#2E7D32' : '#495057',
                                        display: 'flex', alignItems: 'center', gap: '12px',
                                        cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left'
                                    }}
                                >
                                    <span style={{ fontSize: '1.5rem' }}>📊</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>엑셀 파일 (.xlsx)</div>
                                        <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>데이터 분석 및 보관용</div>
                                    </div>
                                    <div style={{
                                        width: '20px', height: '20px', borderRadius: '50%',
                                        border: '2px solid', borderColor: format === 'excel' ? '#27AE60' : '#ADB5BD',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        {format === 'excel' && <div style={{ width: '10px', height: '10px', background: '#27AE60', borderRadius: '50%' }} />}
                                    </div>
                                </button>

                                {/* 구글 문서 선택 */}
                                <button
                                    onClick={() => setFormat('googleDoc')}
                                    disabled={!isGapiLoaded}
                                    style={{
                                        padding: '16px', borderRadius: '16px', border: '2px solid',
                                        borderColor: format === 'googleDoc' ? '#4285F4' : '#E9ECEF',
                                        background: format === 'googleDoc' ? '#E3F2FD' : (isGapiLoaded ? 'white' : '#F8F9FA'),
                                        color: isGapiLoaded ? (format === 'googleDoc' ? '#1565C0' : '#495057') : '#ADB5BD',
                                        display: 'flex', alignItems: 'center', gap: '12px',
                                        cursor: isGapiLoaded ? 'pointer' : 'not-allowed',
                                        transition: 'all 0.2s', textAlign: 'left',
                                        position: 'relative', overflow: 'hidden'
                                    }}
                                >
                                    <span style={{ fontSize: '1.5rem', filter: !isGapiLoaded && 'grayscale(100%)' }}>📝</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>구글 문서 (Google Docs)</div>
                                        <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>인쇄 및 편집용 (목차 포함)</div>
                                    </div>
                                    <div style={{
                                        width: '20px', height: '20px', borderRadius: '50%',
                                        border: '2px solid', borderColor: format === 'googleDoc' ? '#4285F4' : '#ADB5BD',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        {format === 'googleDoc' && <div style={{ width: '10px', height: '10px', background: '#4285F4', borderRadius: '50%' }} />}
                                    </div>
                                    {!isGapiLoaded && <div style={{ position: 'absolute', right: 10, top: 10, fontSize: '0.7rem', color: '#E74C3C' }}>APILoading...</div>}
                                </button>

                                {/* 옵션: 페이지 나누기 (구글 문서 선택 시만 노출) */}
                                <AnimatePresence>
                                    {format === 'googleDoc' && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            style={{ overflow: 'hidden' }}
                                        >
                                            <div style={{ padding: '0 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="checkbox"
                                                    id="pageBreak"
                                                    checked={usePageBreak}
                                                    onChange={(e) => setUsePageBreak(e.target.checked)}
                                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                                />
                                                <label htmlFor="pageBreak" style={{ fontSize: '0.9rem', color: '#546E7A', cursor: 'pointer', fontWeight: 'bold' }}>
                                                    글마다 페이지 나누기 (권장)
                                                </label>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>취소</Button>
                                <Button
                                    onClick={handleConfirm}
                                    style={{
                                        flex: 2,
                                        backgroundColor: format === 'excel' ? '#27AE60' : '#4285F4',
                                        color: 'white', fontWeight: 'bold',
                                        boxShadow: format === 'excel' ? '0 4px 12px rgba(39, 174, 96, 0.3)' : '0 4px 12px rgba(66, 133, 244, 0.3)'
                                    }}
                                >
                                    내보내기
                                </Button>
                            </div>
                        </Card>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default ExportSelectModal;
