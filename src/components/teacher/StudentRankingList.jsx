import React, { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// 컴포넌트 외부로 스타일 상수화 (Optimization 5)
const LIST_CONTAINER_STYLE = { position: 'relative', width: '100%' };
const SCROLL_FADE_STYLE = {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px',
    background: 'linear-gradient(to top, rgba(255,255,255,0.95), transparent)',
    pointerEvents: 'none', borderRadius: '0 0 24px 24px'
};

// 개별 아이템 컴포넌트 분리 및 memo 적용
const RankingItem = memo(({
    student, index, isMobile, isSelected, copiedId,
    toggleSelection, setSelectedStudentForCode, setIsCodeZoomModalOpen,
    copyCode, openHistoryModal, setDeleteTarget, setIsDeleteModalOpen, onOpenRecordAssistant
}) => {
    const isFirst = index === 0;
    const rankIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}위`;

    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.03 }}
            onClick={() => toggleSelection(student.id)}
            style={{
                display: 'flex', alignItems: 'center',
                padding: isMobile ? '10px 14px' : '12px 16px',
                background: isFirst ? '#FFFDE7' : (isSelected ? '#EBF5FB' : '#FDFEFE'),
                border: `1px solid ${isFirst ? '#F7DC6F' : (isSelected ? '#3498DB' : '#F1F3F5')}`,
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

            <div style={{ flex: 1, fontWeight: '800', color: '#34495E', fontSize: '1rem' }}>{student.name}</div>

            <div style={{ marginRight: '12px', textAlign: 'right' }}>
                <span style={{
                    fontWeight: '900',
                    color: isFirst ? '#F39C12' : '#212529',
                    fontSize: '1.2rem',
                    fontFamily: 'Outfit, sans-serif'
                }} title={`현재 보유 포인트: ${(student.total_points || 0).toLocaleString()} P`}>
                    {(student.activity_score || 0).toLocaleString()}
                </span>
                <span style={{ fontSize: '0.8rem', color: isFirst ? '#F39C12' : '#ADB5BD', marginLeft: '2px', fontWeight: 'bold' }}>XP</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setSelectedStudentForCode(student);
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
                        copyCode(student.id, student.student_code);
                    }}
                    style={{ background: 'white', border: '1px solid #EEE', cursor: 'pointer', padding: '6px', borderRadius: '8px', fontSize: '0.9rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', position: 'relative' }}
                    title="코드 복사"
                >
                    📋
                    <AnimatePresence>
                        {copiedId === student.id && (
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
                    onClick={(e) => { e.stopPropagation(); openHistoryModal(student); }}
                    style={{ background: 'white', border: '1px solid #EEE', cursor: 'pointer', padding: '6px', borderRadius: '8px', fontSize: '0.9rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                    title="포인트 기록"
                >
                    📜
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onOpenRecordAssistant(student); }}
                    style={{ background: '#EEF2FF', border: '1px solid #E0E7FF', cursor: 'pointer', padding: '6px', borderRadius: '8px', fontSize: '0.9rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                    title="생기부 도우미"
                >
                    ✏️
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(student); setIsDeleteModalOpen(true); }}
                    style={{ background: '#FFF5F5', border: '1px solid #FFDada', cursor: 'pointer', padding: '6px', borderRadius: '8px', fontSize: '0.9rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                    title="학생 삭제"
                >
                    🗑️
                </button>
            </div>
        </motion.div>
    );
});

const StudentRankingList = ({
    displayStudents, isMobile, selectedIds, toggleSelection,
    setSelectedStudentForCode, setIsCodeZoomModalOpen, copyCode,
    copiedId, openHistoryModal, setDeleteTarget, setIsDeleteModalOpen, onOpenRecordAssistant
}) => {
    return (
        <div style={LIST_CONTAINER_STYLE}>
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
                {displayStudents.map((s, idx) => (
                    <RankingItem
                        key={s.id}
                        student={s}
                        index={idx}
                        isMobile={isMobile}
                        isSelected={selectedIds.includes(s.id)}
                        copiedId={copiedId}
                        toggleSelection={toggleSelection}
                        setSelectedStudentForCode={setSelectedStudentForCode}
                        setIsCodeZoomModalOpen={setIsCodeZoomModalOpen}
                        copyCode={copyCode}
                        openHistoryModal={openHistoryModal}
                        setDeleteTarget={setDeleteTarget}
                        setIsDeleteModalOpen={setIsDeleteModalOpen}
                        onOpenRecordAssistant={onOpenRecordAssistant}
                    />
                ))}
            </div>
            {displayStudents.length > 5 && (
                <div style={SCROLL_FADE_STYLE} />
            )}
        </div>
    );
};

export default memo(StudentRankingList);
