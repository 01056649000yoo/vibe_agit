import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import { Copy, Clock, Calendar, FileText, CheckCircle2, Save, UserCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 역할: 선생님 - 개별 학생 생기부 기록 조회 및 수정 (AI 쫑알이 누적 결과물 + 교사 편집본)
 */
const RecordAssistant = ({ student, activeClass, isMobile, onClose }) => {
    const [recordHistory, setRecordHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [editedContent, setEditedContent] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // 1. 해당 학생의 누적 기록 불러오기 (AI 쫑알이 + 교사 수정본)
    const loadHistory = async (autoSelectLatest = false) => {
        if (!student?.id) {
            console.log('RecordAssistant: 학생 ID가 없습니다.');
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('student_records')
                .select('id, content, created_at, record_type, mission_ids, activity_count, tags')
                .eq('student_id', student.id)
                .in('record_type', ['ai_comment', 'teacher_edit'])
                .order('created_at', { ascending: false });

            if (error) {
                console.error('RecordAssistant: DB 조회 실패:', error);
                throw error;
            }

            setRecordHistory(data || []);

            // 데이터가 있고, 자동 선택 옵션이 켜져 있거나 현재 선택된 게 없을 때 최신 것 선택
            if (data && data.length > 0) {
                if (autoSelectLatest || !selectedRecord) {
                    setSelectedRecord(data[0]);
                    setEditedContent(data[0].content);
                }
            }
        } catch (err) {
            console.error('기록 로드 실패:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadHistory(true);
    }, [student.id]);

    // 레코드 선택 시 편집용 텍스트 동기화
    useEffect(() => {
        if (selectedRecord) {
            setEditedContent(selectedRecord.content);
        }
    }, [selectedRecord]);

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        alert('내용이 복사되었습니다! 📋');
    };

    // 수정된 내용 새로운 기록으로 저장
    const handleSaveEdit = async () => {
        if (!selectedRecord || !editedContent.trim()) return;

        // 원본과 내용이 같은지 확인
        if (editedContent === selectedRecord.content) {
            alert('변경된 내용이 없습니다.');
            return;
        }

        setIsSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('사용자 정보를 찾을 수 없습니다.');

            const { error } = await supabase
                .from('student_records')
                .insert({
                    student_id: student.id,
                    class_id: activeClass.id,
                    teacher_id: user.id,
                    record_type: 'teacher_edit',
                    content: editedContent,
                    mission_ids: selectedRecord.mission_ids || [],
                    activity_count: selectedRecord.activity_count || 0,
                    tags: selectedRecord.tags || []
                });

            if (error) throw error;

            alert('선생님의 수정본이 새로운 이력으로 저장되었습니다! ✨');
            await loadHistory(true); // 최신(방금 저장한 것)으로 자동 선택
        } catch (err) {
            console.error('저장 실패:', err);
            alert('저장 중 오류가 발생했습니다: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 9999, backdropFilter: 'blur(8px)',
            padding: isMobile ? '0' : '20px'
        }} onClick={onClose}>
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth: '1100px',
                    height: isMobile ? '100%' : '72vh',
                    backgroundColor: 'white',
                    borderRadius: isMobile ? '0' : '32px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    position: 'relative'
                }}
            >
                <div style={{ padding: isMobile ? '20px' : '40px', flex: 1, overflowY: 'auto' }}>
                    <header style={{
                        marginBottom: '32px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'start'
                    }}>
                        <div>
                            <h2 style={{ margin: '0 0 8px 0', fontSize: '1.8rem', fontWeight: '900', color: '#1E293B' }}>
                                📝 <span style={{ color: '#6366F1' }}>{student.name}</span> 학생 누적 기록
                            </h2>
                            <p style={{ color: '#64748B', fontSize: '1rem', margin: 0 }}>AI가 분석한 내용과 선생님의 수정 이력을 모두 관리합니다.</p>
                        </div>
                        <Button
                            onClick={onClose}
                            variant="ghost"
                            style={{
                                background: '#F1F5F9',
                                border: 'none',
                                borderRadius: '12px',
                                padding: '8px 16px',
                                fontWeight: 'bold',
                                color: '#64748B'
                            }}
                        >
                            닫기
                        </Button>
                    </header>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : '320px 1fr',
                        gap: '32px',
                        height: isMobile ? 'auto' : 'calc(100% - 100px)',
                        alignItems: 'start'
                    }}>
                        {/* 왼쪽: 이력 목록 */}
                        <aside style={{
                            background: '#F8FAFC',
                            borderRadius: '24px',
                            padding: '24px',
                            border: '1px solid #E2E8F0',
                            display: 'flex',
                            flexDirection: 'column',
                            maxHeight: isMobile ? '200px' : '480px',
                            overflowY: 'hidden'
                        }}>
                            <div style={{ fontSize: '0.9rem', color: '#64748B', fontWeight: 'bold', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Clock size={16} color="#6366F1" /> 생성 히스토리 ({recordHistory.length})
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {loading ? (
                                    <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: '0.9rem' }}>불러오는 중...</div>
                                ) : recordHistory.length === 0 ? (
                                    <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94A3B8', fontSize: '0.95rem', lineHeight: '1.6' }}>
                                        <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.3, display: 'block' }} />
                                        저장된 AI 쫑알이<br />기록이 아직 없습니다.
                                    </div>
                                ) : (
                                    recordHistory.map((record) => {
                                        const isTeacherEdit = record.record_type === 'teacher_edit';
                                        const isSelected = selectedRecord?.id === record.id;

                                        return (
                                            <div
                                                key={record.id}
                                                onClick={() => setSelectedRecord(record)}
                                                style={{
                                                    padding: '16px',
                                                    background: isSelected ? '#6366F1' : (isTeacherEdit ? '#ECFDF5' : 'white'),
                                                    borderRadius: '16px',
                                                    border: '1px solid',
                                                    borderColor: isSelected ? '#6366F1' : (isTeacherEdit ? '#A7F3D0' : '#E2E8F0'),
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    boxShadow: isSelected ? '0 4px 12px rgba(99, 102, 241, 0.2)' : 'none'
                                                }}
                                            >
                                                <div style={{
                                                    fontSize: '0.75rem',
                                                    fontWeight: 'bold',
                                                    color: isSelected ? 'rgba(255,255,255,0.9)' : (isTeacherEdit ? '#065F46' : '#6366F1'),
                                                    marginBottom: '6px',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center'
                                                }}>
                                                    <span>
                                                        {new Date(record.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} · {new Date(record.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    {isTeacherEdit && (
                                                        <span style={{
                                                            fontSize: '0.65rem',
                                                            padding: '2px 6px',
                                                            background: isSelected ? 'rgba(255,255,255,0.2)' : '#D1FAE5',
                                                            borderRadius: '4px',
                                                            color: isSelected ? 'white' : '#065F46'
                                                        }}>교사 수정</span>
                                                    )}
                                                </div>
                                                <div style={{
                                                    fontSize: '0.9rem',
                                                    color: isSelected ? 'white' : '#475569',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {record.content.substring(0, 40)}...
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </aside>

                        {/* 오른쪽: 상세 내용 */}
                        <main style={{ display: 'flex', flexDirection: 'column', minHeight: '320px' }}>
                            {selectedRecord ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <div style={{
                                        background: 'white',
                                        borderRadius: '28px',
                                        border: '2px solid',
                                        borderColor: selectedRecord.record_type === 'teacher_edit' ? '#10B981' : '#6366F1',
                                        padding: '40px',
                                        position: 'relative',
                                        boxShadow: '0 20px 25px -5px rgba(99, 102, 241, 0.05)',
                                        display: 'flex',
                                        flexDirection: 'column'
                                    }}>
                                        <div style={{
                                            position: 'absolute',
                                            top: '-14px',
                                            left: '32px',
                                            background: selectedRecord.record_type === 'teacher_edit' ? '#10B981' : '#6366F1',
                                            color: 'white',
                                            padding: '6px 16px',
                                            borderRadius: '10px',
                                            fontSize: '0.85rem',
                                            fontWeight: 'bold',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}>
                                            {selectedRecord.record_type === 'teacher_edit' ? (
                                                <><UserCheck size={16} /> 선생님이 수정한 기록</>
                                            ) : (
                                                <><Calendar size={16} /> AI가 생성한 초안</>
                                            )}
                                        </div>

                                        <textarea
                                            value={editedContent}
                                            onChange={(e) => setEditedContent(e.target.value)}
                                            placeholder="선생님의 의견을 추가하거나 AI가 제안한 내용을 자유롭게 수정하세요..."
                                            style={{
                                                width: '100%',
                                                height: '280px',
                                                border: 'none',
                                                outline: 'none',
                                                fontSize: '1.2rem',
                                                lineHeight: '1.8',
                                                color: '#1E293B',
                                                resize: 'none',
                                                fontFamily: 'inherit',
                                                background: 'transparent',
                                                padding: '10px 0'
                                            }}
                                        />

                                        <div style={{
                                            marginTop: '24px',
                                            paddingTop: '24px',
                                            borderTop: '1px solid #F1F5F9',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <div style={{ color: '#94A3B8', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <FileText size={16} /> {editedContent.length}자
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <CheckCircle2 size={16} color="#10B981" /> {selectedRecord.activity_count}개 활동 분석 기반
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                <Button
                                                    onClick={handleSaveEdit}
                                                    disabled={isSaving || editedContent === selectedRecord.content}
                                                    style={{
                                                        background: editedContent === selectedRecord.content ? '#F1F5F9' : '#10B981',
                                                        color: editedContent === selectedRecord.content ? '#94A3B8' : 'white',
                                                        fontWeight: 'bold',
                                                        borderRadius: '16px',
                                                        padding: '12px 24px',
                                                        fontSize: '1rem',
                                                        boxShadow: editedContent === selectedRecord.content ? 'none' : '0 4px 6px -1px rgba(16, 185, 129, 0.4)',
                                                        border: 'none',
                                                        cursor: editedContent === selectedRecord.content ? 'default' : 'pointer'
                                                    }}
                                                >
                                                    <Save size={20} style={{ marginRight: '10px' }} />
                                                    {isSaving ? '저장 중...' : '수정본으로 저장'}
                                                </Button>
                                                <Button
                                                    onClick={() => copyToClipboard(editedContent)}
                                                    style={{
                                                        background: '#6366F1',
                                                        color: 'white',
                                                        fontWeight: 'bold',
                                                        borderRadius: '16px',
                                                        padding: '12px 24px',
                                                        fontSize: '1rem',
                                                        boxShadow: '0 4px 6px -1px rgba(99, 102, 241, 0.4)'
                                                    }}
                                                >
                                                    <Copy size={20} style={{ marginRight: '10px' }} /> 복사하기
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    {!isMobile && (
                                        <div style={{
                                            background: '#F0F9FF',
                                            padding: '16px 24px',
                                            borderRadius: '16px',
                                            color: '#0369A1',
                                            fontSize: '0.9rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            border: '1px solid #BAE6FD'
                                        }}>
                                            <CheckCircle2 size={20} />
                                            <span>내용을 수정하고 <strong>'수정본으로 저장'</strong>을 누르면 새로운 히스토리가 생성됩니다.</span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{
                                    flex: 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    background: '#F8FAFC',
                                    borderRadius: '32px',
                                    border: '3px dashed #E2E8F0',
                                    color: '#94A3B8',
                                    padding: '40px',
                                    minHeight: '320px'
                                }}>
                                    <Clock size={64} style={{ marginBottom: '24px', opacity: 0.2 }} />
                                    <h3 style={{ margin: '0 0 8px 0', color: '#64748B' }}>역사 속 기록이 없습니다</h3>
                                    <p style={{ margin: 0 }}>왼쪽 목록에서 확인하고 싶은 기록을 선택해 주세요.</p>
                                </div>
                            )}
                        </main>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default RecordAssistant;
