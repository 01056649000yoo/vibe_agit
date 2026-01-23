import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const StudentRankingList = ({
    displayStudents, isMobile, selectedIds, toggleSelection,
    setSelectedStudentForCode, setIsCodeZoomModalOpen, copyCode,
    copiedId, openHistoryModal, setDeleteTarget, setIsDeleteModalOpen
}) => {
    return (
        <div style={{ position: 'relative', width: '100%' }}>
            <div
                className="ranking-scroll"
                style={{
                    maxHeight: isMobile ? '340px' : '440px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: isMobile ? '6px' : '8px',
                    paddingRight: '4px',
                    paddingBottom: '20px',
                    boxSizing: 'border-box'
                }}
            >
                {displayStudents.map((s, idx) => {
                    const isFirst = idx === 0;
                    const rankIcon = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}위`;

                    return (
                        <motion.div
                            key={s.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.03 }}
                            onClick={() => toggleSelection(s.id)}
                            style={{
                                display: 'flex', alignItems: 'center',
                                padding: isMobile ? '10px 14px' : '12px 16px',
                                background: isFirst ? '#FFFDE7' : (selectedIds.includes(s.id) ? '#EBF5FB' : '#FDFEFE'),
                                border: `1px solid ${isFirst ? '#F7DC6F' : (selectedIds.includes(s.id) ? '#3498DB' : '#F1F3F5')}`,
                                borderRadius: '20px', cursor: 'pointer', transition: 'all 0.15s',
                                fontSize: isMobile ? '0.85rem' : '0.95rem', width: '100%', boxSizing: 'border-box',
                                boxShadow: isFirst ? '0 4px 12px rgba(247, 220, 111, 0.2)' : 'none'
                            }}
                        >
                            <div style={{
                                width: isMobile ? '35px' : '45px',
                                fontWeight: '900',
                                color: isFirst ? '#F39C12' : '#ADB5BD',
                                fontSize: isFirst ? '1.4rem' : '1rem',
                                display: 'flex', justifyContent: 'center'
                            }}>
                                {rankIcon}
                            </div>

                            <div style={{ flex: 1, fontWeight: '800', color: '#34495E', fontSize: '1rem' }}>{s.name}</div>

                            <div style={{ marginRight: '12px', textAlign: 'right' }}>
                                <span style={{
                                    fontWeight: '900',
                                    color: isFirst ? '#F39C12' : '#212529',
                                    fontSize: '1.2rem',
                                    fontFamily: 'Outfit, sans-serif'
                                }}>
                                    {(s.total_points || 0).toLocaleString()}
                                </span>
                                <span style={{ fontSize: '0.8rem', color: isFirst ? '#F39C12' : '#ADB5BD', marginLeft: '2px', fontWeight: 'bold' }}>P</span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedStudentForCode(s);
                                        setIsCodeZoomModalOpen(true);
                                    }}
                                    style={{ background: 'white', border: '1px solid #EEE', cursor: 'pointer', padding: '6px', borderRadius: '8px', fontSize: '0.9rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                                    title="코드 크게보기"
                                >
                                    🔍
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        copyCode(s.id, s.student_code);
                                    }}
                                    style={{ background: 'white', border: '1px solid #EEE', cursor: 'pointer', padding: '6px', borderRadius: '8px', fontSize: '0.9rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', position: 'relative' }}
                                    title="코드 복사"
                                >
                                    📋
                                    <AnimatePresence>
                                        {copiedId === s.id && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: -35 }} exit={{ opacity: 0 }}
                                                style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', background: '#2ECC71', color: 'white', padding: '4px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 'bold', whiteSpace: 'nowrap', zIndex: 10 }}
                                            >
                                                복사됨! ✅
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); openHistoryModal(s); }}
                                    style={{ background: 'white', border: '1px solid #EEE', cursor: 'pointer', padding: '6px', borderRadius: '8px', fontSize: '0.9rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                                    title="포인트 기록"
                                >
                                    📜
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); setIsDeleteModalOpen(true); }}
                                    style={{ background: '#FFF5F5', border: '1px solid #FFDada', cursor: 'pointer', padding: '6px', borderRadius: '8px', fontSize: '0.9rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                                    title="학생 삭제"
                                >
                                    🗑️
                                </button>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
            {displayStudents.length > 5 && (
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px',
                    background: 'linear-gradient(to top, rgba(255,255,255,0.95), transparent)',
                    pointerEvents: 'none', borderRadius: '0 0 24px 24px'
                }} />
            )}
        </div>
    );
};

export default StudentRankingList;
