import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../common/Button';

const ArchiveConfirmModal = ({ archiveModal, setArchiveModal, handleFinalArchive }) => {
    return (
        <AnimatePresence>
            {archiveModal.isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                        zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center',
                        padding: '20px'
                    }}
                    onClick={() => setArchiveModal({ isOpen: false, mission: null, hasIncomplete: false })}
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.9, y: 20, opacity: 0 }}
                        style={{
                            background: 'white', borderRadius: '30px', width: '100%', maxWidth: '420px',
                            padding: '32px', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ fontSize: '4rem', marginBottom: '20px' }}>
                            {archiveModal.hasIncomplete ? '⚠️' : '📂'}
                        </div>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '1.4rem', color: '#2C3E50', fontWeight: '900' }}>
                            {archiveModal.hasIncomplete ? '아직 미완료 학생이 있어요!' : '미션을 보관할까요?'}
                        </h3>
                        <p style={{ margin: '0 0 24px 0', color: '#7F8C8D', lineHeight: '1.6', fontSize: '0.95rem' }}>
                            {archiveModal.hasIncomplete
                                ? '아직 글을 제출하지 않은 학생이 있습니다. 그래도 보관하시겠습니까? (제출된 글만 보관함으로 이동하고, 학생들에게는 더 이상 보이지 않게 됩니다.)'
                                : '보관하면 학생들의 대시보드에서 미션이 사라지고 보관함으로 이동합니다.'}
                        </p>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <Button
                                onClick={() => setArchiveModal({ isOpen: false, mission: null, hasIncomplete: false })}
                                style={{ flex: 1, background: '#F1F3F5', color: '#495057', border: 'none', fontWeight: 'bold' }}>
                                취소
                            </Button>
                            <Button
                                onClick={handleFinalArchive}
                                style={{ flex: 1, background: archiveModal.hasIncomplete ? '#FF5252' : '#3498DB', color: 'white', border: 'none', fontWeight: 'bold' }}>
                                {archiveModal.hasIncomplete ? '네, 보관합니다' : '네, 보관할게요'} 📂
                            </Button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ArchiveConfirmModal;
