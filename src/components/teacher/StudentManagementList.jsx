import React, { useState } from 'react';
import { motion } from 'framer-motion';

const StudentManagementList = ({
    displayStudents, isMobile, setSelectedStudentForCode, setIsCodeZoomModalOpen,
    openHistoryModal, handleExportClick, copyCode, copiedId,
    setDeleteTarget, setIsDeleteModalOpen, onOpenRecordAssistant, onOpenPointModal
}) => {
    const [openMenuId, setOpenMenuId] = useState(null);

    return (
        <div
            className="ranking-scroll"
            style={{
                maxHeight: isMobile ? 'calc(100vh - 300px)' : '820px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                paddingRight: '6px'
            }}
        >
            {!isMobile && displayStudents.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '48px minmax(130px, 1fr) 130px 100px 132px', gap: '10px', padding: '0 12px 4px', color: '#94A3B8', fontSize: '0.72rem', fontWeight: '800' }}>
                    <span style={{ textAlign: 'center' }}>번호</span><span>이름</span><span>로그인 코드</span><span style={{ textAlign: 'right' }}>포인트</span><span style={{ textAlign: 'right' }}>작업</span>
                </div>
            )}
            {displayStudents.map((s, idx) => {
                const studentNo = idx + 1;
                const moreActions = [
                    ['🔍 코드 크게 보기', () => { setSelectedStudentForCode(s); setIsCodeZoomModalOpen(true); }],
                    ['📜 포인트 기록', () => openHistoryModal(s)],
                    ['📤 데이터 내보내기', () => handleExportClick(s)],
                    ['✏️ 기록 도우미', () => onOpenRecordAssistant(s)],
                    ['🗑️ 학생 삭제', () => { setDeleteTarget(s); setIsDeleteModalOpen(true); }]
                ];

                return (
                    <motion.div
                        key={s.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        style={{
                            display: 'grid', gridTemplateColumns: isMobile ? '36px minmax(90px, 1fr) auto' : '48px minmax(130px, 1fr) 130px 100px 132px',
                            alignItems: 'center', padding: isMobile ? '10px' : '8px 12px', gap: '10px',
                            background: 'white',
                            border: '1px solid #E9ECEF',
                            borderRadius: '12px', minHeight: isMobile ? '58px' : '50px',
                            boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <div style={{ display: 'contents' }}>
                            <div style={{
                                fontWeight: '900', color: '#ADB5BD',
                                fontSize: '0.9rem', display: 'flex', justifyContent: 'center'
                            }}>
                                {studentNo}
                            </div>
                            <span style={{ fontWeight: '800', color: '#34495E', fontSize: '1rem', letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                        </div>

                        <div style={{
                            fontSize: '1rem',
                            fontWeight: '600',
                            color: '#3498DB',
                            fontFamily: '"JetBrains Mono", "Roboto Mono", "SF Mono", Menlo, Consolas, "Courier New", monospace',
                            fontFeatureSettings: '"zero" 1, "tnum" 1',
                            minWidth: 0,
                            position: 'relative'
                        }}>
                            {s.student_code}
                        </div>

                        <div style={{ display: isMobile ? 'none' : 'contents' }}>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ fontWeight: '900', color: '#2C3E50', fontSize: '1.1rem' }}>
                                    {(s.total_points || 0).toLocaleString()}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#ADB5BD', marginLeft: '2px', fontWeight: 'bold' }}>P</span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', position: 'relative' }}>
                                <button
                                    onClick={() => copyCode(s.id, s.student_code)}
                                    style={{ background: '#F8F9FA', border: '1px solid #E9ECEF', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', transition: 'all 0.2s' }}
                                    title="코드 복사" > {copiedId === s.id ? '✅' : '📋'} </button>

                                <button
                                    onClick={() => onOpenPointModal(s)}
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
                                    title="포인트 조정"
                                >
                                    ⚡
                                </button>

                                <button
                                    onClick={() => setOpenMenuId(openMenuId === s.id ? null : s.id)}
                                    style={{
                                        background: '#F8FAFC', border: '1px solid #CBD5E1', color: '#475569',
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
                                    title="더보기"
                                >
                                    ⋯
                                </button>
                                {openMenuId === s.id && (
                                    <div style={{ position: 'absolute', top: '38px', right: 0, width: '170px', padding: '6px', borderRadius: '12px', background: 'white', border: '1px solid #E2E8F0', boxShadow: '0 12px 28px rgba(15,23,42,.16)', zIndex: 30 }}>
                                        {moreActions.map(([label, action]) => (
                                            <button key={label} type="button" onClick={() => { action(); setOpenMenuId(null); }} style={{ width: '100%', padding: '8px 9px', border: 'none', borderRadius: '8px', background: 'transparent', color: label.includes('삭제') ? '#DC2626' : '#334155', textAlign: 'left', cursor: 'pointer', fontWeight: '700', fontSize: '0.8rem' }}>{label}</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        {isMobile && (
                            <div style={{ gridColumn: '2 / -1', display: 'flex', justifyContent: 'flex-end', gap: '6px', position: 'relative' }}>
                                <button type="button" onClick={() => copyCode(s.id, s.student_code)} style={{ height: '30px', padding: '0 9px', border: '1px solid #E2E8F0', borderRadius: '8px', background: '#F8FAFC', cursor: 'pointer' }}>{copiedId === s.id ? '✅ 복사됨' : '📋 코드 복사'}</button>
                                <button type="button" onClick={() => onOpenPointModal(s)} style={{ height: '30px', padding: '0 9px', border: '1px solid #FFECB3', borderRadius: '8px', background: '#FFF8E1', cursor: 'pointer' }}>⚡ 포인트</button>
                                <button type="button" onClick={() => setOpenMenuId(openMenuId === s.id ? null : s.id)} style={{ width: '34px', height: '30px', border: '1px solid #CBD5E1', borderRadius: '8px', background: 'white', cursor: 'pointer' }}>⋯</button>
                                {openMenuId === s.id && (
                                    <div style={{ position: 'absolute', top: '36px', right: 0, width: '170px', padding: '6px', borderRadius: '12px', background: 'white', border: '1px solid #E2E8F0', boxShadow: '0 12px 28px rgba(15,23,42,.16)', zIndex: 30 }}>
                                        {moreActions.map(([label, action]) => (
                                            <button key={label} type="button" onClick={() => { action(); setOpenMenuId(null); }} style={{ width: '100%', padding: '8px 9px', border: 'none', borderRadius: '8px', background: 'transparent', color: label.includes('삭제') ? '#DC2626' : '#334155', textAlign: 'left', cursor: 'pointer', fontWeight: '700', fontSize: '0.8rem' }}>{label}</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </motion.div>
                );
            })}
            {displayStudents.length === 0 && (
                <div style={{ padding: '48px 20px', textAlign: 'center', color: '#94A3B8', fontWeight: '700' }}>조건에 맞는 학생이 없습니다.</div>
            )}
        </div>
    );
};

export default StudentManagementList;
