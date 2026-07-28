import React, { useState } from 'react';
import { motion } from 'framer-motion';

const DESKTOP_GRID_COLUMNS = '48px minmax(110px, 0.8fr) 128px 90px minmax(340px, 2.4fr)';

const getActionColors = (tone) => {
    if (tone === 'point') return { background: '#FFF8E1', border: '#FFECB3', color: '#B45309' };
    if (tone === 'info') return { background: '#EFF6FF', border: '#BFDBFE', color: '#1D4ED8' };
    if (tone === 'record') return { background: '#F0FDF4', border: '#BBF7D0', color: '#15803D' };
    if (tone === 'danger') return { background: '#FFF1F2', border: '#FECDD3', color: '#DC2626' };
    return { background: '#F8FAFC', border: '#E2E8F0', color: '#475569' };
};

const actionButtonStyle = (tone = 'neutral') => {
    const colors = getActionColors(tone);
    return {
        height: '32px',
        padding: '0 9px',
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
        background: colors.background,
        color: colors.color,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        fontSize: '0.74rem',
        fontWeight: '800',
        whiteSpace: 'nowrap'
    };
};

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
                <div style={{ display: 'grid', gridTemplateColumns: DESKTOP_GRID_COLUMNS, gap: '10px', padding: '0 12px 4px', color: '#94A3B8', fontSize: '0.72rem', fontWeight: '800' }}>
                    <span style={{ textAlign: 'center' }}>번호</span><span>이름</span><span>로그인 코드</span><span style={{ textAlign: 'right' }}>포인트</span><span>작업</span>
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
                const desktopActions = [
                    { id: 'copy', icon: copiedId === s.id ? '✅' : '📋', label: copiedId === s.id ? '복사됨' : '코드 복사', action: () => copyCode(s.id, s.student_code) },
                    { id: 'point', icon: '⚡', label: '포인트 조정', action: () => onOpenPointModal(s), tone: 'point' },
                    { id: 'zoom', icon: '🔍', label: '코드 크게', action: () => { setSelectedStudentForCode(s); setIsCodeZoomModalOpen(true); }, tone: 'info' },
                    { id: 'history', icon: '📜', label: '포인트 기록', action: () => openHistoryModal(s) },
                    { id: 'export', icon: '📤', label: '내보내기', action: () => handleExportClick(s) },
                    { id: 'record', icon: '✏️', label: '기록 도우미', action: () => onOpenRecordAssistant(s), tone: 'record' },
                    { id: 'delete', icon: '🗑️', label: '삭제', action: () => { setDeleteTarget(s); setIsDeleteModalOpen(true); }, tone: 'danger' }
                ];

                return (
                    <motion.div
                        key={s.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        style={{
                            display: 'grid', gridTemplateColumns: isMobile ? '36px minmax(90px, 1fr) auto' : DESKTOP_GRID_COLUMNS,
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

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', flexWrap: 'wrap', gap: '5px' }}>
                                {desktopActions.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={item.action}
                                        style={actionButtonStyle(item.tone)}
                                        title={item.label}
                                    >
                                        <span aria-hidden="true">{item.icon}</span>
                                        <span>{item.label}</span>
                                    </button>
                                ))}
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
