import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const StudentManagementList = ({
    displayStudents, isMobile, setSelectedStudentForCode, setIsCodeZoomModalOpen,
    openHistoryModal, handleExportClick, copyCode, copiedId,
    setDeleteTarget, setIsDeleteModalOpen, onOpenRecordAssistant
}) => {
    return (
        <div
            className="ranking-scroll"
            style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                paddingRight: '6px'
            }}
        >
            {displayStudents.map((s, idx) => {
                const studentNo = idx + 1;

                return (
                    <motion.div
                        key={s.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        style={{
                            display: 'flex', alignItems: 'center', padding: '12px 16px',
                            background: 'white',
                            border: '1px solid #E9ECEF',
                            borderRadius: '20px',
                            justifyContent: 'space-between',
                            minHeight: '70px',
                            boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '0 0 120px' }}>
                            <div style={{
                                width: '30px', fontWeight: '900', color: '#ADB5BD',
                                fontSize: '0.9rem', display: 'flex', justifyContent: 'center'
                            }}>
                                {studentNo}
                            </div>
                            <span style={{ fontWeight: '800', color: '#34495E', fontSize: '1rem', letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                        </div>

                        <div style={{
                            flex: '1 1 auto',
                            textAlign: 'center',
                            fontSize: isMobile ? '1.1rem' : '1.3rem',
                            color: '#3498DB',
                            fontWeight: '900',
                            fontFamily: 'monospace',
                            letterSpacing: '1px',
                            background: '#F8F9FA',
                            padding: '4px 8px',
                            borderRadius: '10px',
                            margin: '0 10px',
                            minWidth: '100px'
                        }}>
                            {s.student_code}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ textAlign: 'right', minWidth: '70px' }}>
                                <span style={{ fontWeight: '900', color: '#2C3E50', fontSize: '1.1rem' }}>
                                    {(s.total_points || 0).toLocaleString()}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#ADB5BD', marginLeft: '2px', fontWeight: 'bold' }}>P</span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <button
                                    onClick={() => { setSelectedStudentForCode(s); setIsCodeZoomModalOpen(true); }}
                                    style={{ background: '#F8F9FA', border: '1px solid #E9ECEF', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', transition: 'all 0.2s' }}
                                    title="크게 보기" > 🔍 </button>

                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openHistoryModal(s);
                                    }}
                                    style={{
                                        background: '#FFF8E1',
                                        border: '1px solid #FFECB3',
                                        color: '#F39C12',
                                        cursor: 'pointer',
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '1rem',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                    }}
                                    title="포인트 기록 조회"
                                >
                                    📜
                                </button>

                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleExportClick(s);
                                    }}
                                    style={{
                                        background: '#E8F5E9',
                                        border: '1px solid #C8E6C9',
                                        color: '#2E7D32',
                                        cursor: 'pointer',
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '1rem',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                    }}
                                    title="데이터 내보내기"
                                >
                                    📤
                                </button>

                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenRecordAssistant(s);
                                    }}
                                    style={{
                                        background: '#EEF2FF',
                                        border: '1px solid #E0E7FF',
                                        color: '#4F46E5',
                                        cursor: 'pointer',
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '1rem',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                    }}
                                    title="생기부 도우미"
                                >
                                    ✏️
                                </button>

                                <div style={{ position: 'relative' }}>
                                    <button
                                        onClick={() => copyCode(s.id, s.student_code)}
                                        style={{ background: '#FDFCF0', border: '1px solid #F7DC6F', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', transition: 'all 0.2s' }}
                                        title="코드 복사" > 📋 </button>
                                    <AnimatePresence>
                                        {copiedId === s.id && (
                                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: -40 }} exit={{ opacity: 0 }}
                                                style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', background: '#2ECC71', color: 'white', padding: '4px 10px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 'bold', whiteSpace: 'nowrap', zIndex: 10, boxShadow: '0 4px 10px rgba(46, 204, 113, 0.3)' }} >
                                                복사됨! ✅
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                <button
                                    onClick={() => { setDeleteTarget(s); setIsDeleteModalOpen(true); }}
                                    style={{ background: '#FFF5F5', border: '1px solid #FFDada', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', transition: 'all 0.2s' }}
                                    title="학생 삭제" > 🗑️ </button>
                            </div>
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
};

export default StudentManagementList;
