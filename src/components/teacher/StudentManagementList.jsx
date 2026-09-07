import React, { useState } from 'react';
import { motion } from 'framer-motion';

const DESKTOP_GRID_COLUMNS = '42px minmax(82px, 0.75fr) minmax(104px, 124px) minmax(70px, 86px) minmax(260px, 2.5fr)';

const getActionColors = (tone) => {
    if (tone === 'point') return { background: '#FFF8E1', border: '#FFECB3', color: '#B45309' };
    if (tone === 'info') return { background: '#EFF6FF', border: '#BFDBFE', color: '#1D4ED8' };
    if (tone === 'agit') return { background: '#FFF7ED', border: '#FED7AA', color: '#9A5B13' };
    if (tone === 'record') return { background: '#F0FDF4', border: '#BBF7D0', color: '#15803D' };
    if (tone === 'danger') return { background: '#FFF1F2', border: '#FECDD3', color: '#DC2626' };
    return { background: '#F8FAFC', border: '#E2E8F0', color: '#475569' };
};

const actionButtonToneStyle = (tone = 'neutral') => {
    const colors = getActionColors(tone);
    return {
        border: `1px solid ${colors.border}`,
        background: colors.background,
        color: colors.color
    };
};

const StudentManagementList = ({
    displayStudents, isMobile, setSelectedStudentForCode, setIsCodeZoomModalOpen,
    openHistoryModal, handleExportClick, copyCode, copiedId,
    setDeleteTarget, setIsDeleteModalOpen, onOpenRecordAssistant, onOpenPointModal, onOpenStudentAgit,
    onChangeNumber, onRename
}) => {
    // 지금 고치고 있는 칸 하나만 기억한다. 무엇을 고치는 중인지 화면에서 늘 보이게 하려는 것이다.
    const [editing, setEditing] = useState(null);
    const [draft, setDraft] = useState('');

    const startEdit = (student, field) => {
        setEditing({ id: student.id, field });
        setDraft(field === 'no' ? String(student.student_no ?? '') : student.name);
    };
    const cancelEdit = () => { setEditing(null); setDraft(''); };
    const commitEdit = async (student) => {
        const value = draft.trim();
        const field = editing?.field;
        cancelEdit();
        if (!value) return;
        if (field === 'no') {
            if (Number(value) !== student.student_no) await onChangeNumber?.(student.id, value);
            return;
        }
        if (value !== student.name) await onRename?.(student.id, value);
    };
    const editKeys = (student) => ({
        onKeyDown: (event) => {
            if (event.key === 'Enter') commitEdit(student);
            if (event.key === 'Escape') cancelEdit();
        }
    });

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
                // 번호는 저장된 학급 번호다. 아직 못 받은 학생만 자리 번호로 대신 보여 준다.
                const studentNo = s.student_no ?? idx + 1;
                const isEditingNo = editing?.id === s.id && editing.field === 'no';
                const isEditingName = editing?.id === s.id && editing.field === 'name';
                const studentActions = [
                    { id: 'copy', icon: copiedId === s.id ? '✅' : '📋', label: copiedId === s.id ? '복사됨' : '코드 복사', action: () => copyCode(s.id, s.student_code) },
                    { id: 'point', icon: '⚡', label: '포인트 조정', action: () => onOpenPointModal(s), tone: 'point' },
                    { id: 'zoom', icon: '🔍', label: '코드 크게', action: () => { setSelectedStudentForCode(s); setIsCodeZoomModalOpen(true); }, tone: 'info' },
                    { id: 'history', icon: '📜', label: '포인트 기록', action: () => openHistoryModal(s) },
                    { id: 'agit', icon: '🏡', label: '아지트 보기', action: () => onOpenStudentAgit?.(s), tone: 'agit' },
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
                            alignItems: isMobile ? 'center' : 'start', padding: isMobile ? '10px' : '8px 12px', gap: '10px',
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
                                fontSize: '0.9rem', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '32px'
                            }}>
                                {isEditingNo ? (
                                    <input
                                        type="number" min="1" max="300" autoFocus
                                        aria-label={`${s.name} 번호`}
                                        value={draft}
                                        onChange={(event) => setDraft(event.target.value)}
                                        onBlur={() => commitEdit(s)}
                                        {...editKeys(s)}
                                        style={{ width: '38px', padding: '2px', textAlign: 'center', borderRadius: '6px', border: '1px solid #3498DB', fontWeight: '900' }}
                                    />
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => startEdit(s, 'no')}
                                        aria-label={`${s.name} 번호 ${studentNo} 고치기`}
                                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: '900', color: '#ADB5BD', fontSize: '0.9rem', padding: '2px 4px' }}
                                    >
                                        {studentNo}
                                    </button>
                                )}
                            </div>
                            {isEditingName ? (
                                <input
                                    type="text" maxLength={30} autoFocus
                                    aria-label={`${s.name} 이름`}
                                    value={draft}
                                    onChange={(event) => setDraft(event.target.value)}
                                    onBlur={() => commitEdit(s)}
                                    {...editKeys(s)}
                                    style={{ padding: '4px 6px', borderRadius: '6px', border: '1px solid #3498DB', fontWeight: '800', fontSize: '1rem', minWidth: 0 }}
                                />
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => startEdit(s, 'name')}
                                    aria-label={`${s.name} 이름 고치기`}
                                    style={{ fontWeight: '800', color: '#34495E', fontSize: '1rem', letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', minHeight: '32px', border: 'none', background: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                                >
                                    {s.name}
                                </button>
                            )}
                        </div>

                        <div style={{
                            fontSize: '1rem',
                            fontWeight: '600',
                            color: '#3498DB',
                            fontFamily: '"JetBrains Mono", "Roboto Mono", "SF Mono", Menlo, Consolas, "Courier New", monospace',
                            fontFeatureSettings: '"zero" 1, "tnum" 1',
                            minWidth: 0,
                            position: 'relative',
                            minHeight: '32px',
                            display: 'flex',
                            alignItems: 'center'
                        }}>
                            {s.student_code}
                        </div>

                        <div style={{ display: isMobile ? 'none' : 'contents' }}>
                            <div style={{ textAlign: 'right', minHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                <span style={{ fontWeight: '900', color: '#2C3E50', fontSize: '1.1rem' }}>
                                    {(s.total_points || 0).toLocaleString()}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#ADB5BD', marginLeft: '2px', fontWeight: 'bold' }}>P</span>
                            </div>

                            <div className="student-action-grid">
                                {studentActions.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={item.action}
                                        className="student-action-button"
                                        style={actionButtonToneStyle(item.tone)}
                                        aria-label={item.label}
                                        title={item.label}
                                    >
                                        <span className="student-action-icon" aria-hidden="true">{item.icon}</span>
                                        <span className="student-action-label">{item.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        {isMobile && (
                            <div className="student-action-grid student-action-grid--mobile" style={{ gridColumn: '2 / -1' }}>
                                {studentActions.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={item.action}
                                        className="student-action-button"
                                        style={actionButtonToneStyle(item.tone)}
                                        aria-label={item.label}
                                        title={item.label}
                                    >
                                        <span className="student-action-icon" aria-hidden="true">{item.icon}</span>
                                    </button>
                                ))}
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
