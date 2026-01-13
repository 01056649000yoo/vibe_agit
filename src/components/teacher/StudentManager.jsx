import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import Card from '../common/Card';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 역할: 선생님 - 학급 내 학생 명단 관리 (슬림 2열 그리드 버전)
 * 상단 컨트롤 바를 2줄로 구성하여 여유 공간을 확보하고, 학생 카드를 슬림하게 조정했습니다. ✨
 */
const StudentManager = ({ classId, isDashboardMode = true }) => {
    const [studentName, setStudentName] = useState('');
    const [students, setStudents] = useState([]);
    const [isAdding, setIsAdding] = useState(false);

    // 선택 및 모달 상태
    const [selectedIds, setSelectedIds] = useState([]);
    const [isPointModalOpen, setIsPointModalOpen] = useState(false);
    const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // 포인트 통합 모달 데이터
    const [pointFormData, setPointFormData] = useState({
        type: 'give',
        amount: 10,
        reason: '참여도가 높아요! 🌟'
    });

    const [historyStudent, setHistoryStudent] = useState(null);
    const [historyLogs, setHistoryLogs] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);

    // 데이터 호출
    useEffect(() => {
        if (classId) fetchStudents();
        return () => {
            setStudents([]);
            setSelectedIds([]);
        };
    }, [classId]);

    const fetchStudents = async () => {
        if (!classId) return;
        const { data, error } = await supabase
            .from('students')
            .select('*')
            .eq('class_id', classId)
            .order('total_points', { ascending: false });

        if (!error && data) setStudents(data);
    };

    // 포인트 일괄 처리
    const handleBulkProcessPoints = async () => {
        if (selectedIds.length === 0) return;
        if (!pointFormData.reason.trim()) return alert('활동 사유를 입력해주세요! ✍️');

        const { type, amount, reason } = pointFormData;
        const actualAmount = type === 'give' ? amount : -amount;
        const targets = students.filter(s => selectedIds.includes(s.id));
        const previousStudents = [...students];

        setStudents(prev => prev.map(s => {
            if (selectedIds.includes(s.id)) {
                return { ...s, total_points: (s.total_points || 0) + actualAmount };
            }
            return s;
        }));
        setIsPointModalOpen(false);

        try {
            const operations = targets.map(async (t) => {
                const newPoints = (t.total_points || 0) + actualAmount;
                const { error: upError } = await supabase.from('students').update({ total_points: newPoints }).eq('id', t.id);
                if (upError) throw upError;
                const { error: logError } = await supabase.from('point_logs').insert({ student_id: t.id, amount: actualAmount, reason: reason });
                if (logError) throw logError;
            });
            await Promise.all(operations);
            alert(`${targets.length}명의 포인트 처리가 완료되었습니다! ✨`);
            setSelectedIds([]);
        } catch (error) {
            setStudents(previousStudents);
            alert('오류 발생: ' + error.message);
        }
    };

    const handleDeleteStudent = async () => {
        if (!deleteTarget) return;
        try {
            const { error } = await supabase.from('students').delete().eq('id', deleteTarget.id);
            if (error) throw error;
            setStudents(prev => prev.filter(s => s.id !== deleteTarget.id));
            setSelectedIds(prev => prev.filter(id => id !== deleteTarget.id));
        } catch (error) {
            alert('삭제 실패: ' + error.message);
        } finally {
            setIsDeleteModalOpen(false);
            setDeleteTarget(null);
        }
    };

    const openHistoryModal = async (student) => {
        setHistoryStudent(student);
        setIsHistoryModalOpen(true);
        setLoadingHistory(true);
        const { data, error } = await supabase.from('point_logs').select('*').eq('student_id', student.id).order('created_at', { ascending: false });
        if (!error) setHistoryLogs(data || []);
        setLoadingHistory(false);
    };

    const handleAddStudent = async () => {
        if (!studentName.trim()) return;
        setIsAdding(true);
        const code = Math.random().toString(36).substring(2, 10).toUpperCase();
        const { data, error } = await supabase.from('students').insert({ class_id: classId, name: studentName, student_code: code, total_points: 0 }).select();
        if (!error && data[0]) {
            setStudents(prev => [...prev, data[0]]);
            setStudentName('');
        }
        setIsAdding(false);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === students.length) setSelectedIds([]);
        else setSelectedIds(students.map(s => s.id));
    };

    if (isDashboardMode) {
        // [학급 대시보드 모드: 명예의 전당 및 포인트 관리]
        const maxPoints = students.length > 0 ? Math.max(...students.map(s => s.total_points || 0)) : 100;

        return (
            <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.4rem', color: '#2C3E50', fontWeight: '900' }}>🏆 우리 반 명예의 전당</h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button
                            onClick={toggleSelectAll}
                            variant="ghost"
                            size="sm"
                            style={{ fontSize: '0.8rem', color: '#7F8C8D' }}
                        >
                            {selectedIds.length === students.length ? '전체 해제' : '전체 선택'}
                        </Button>
                        <Button
                            onClick={() => setIsPointModalOpen(true)}
                            disabled={selectedIds.length === 0}
                            style={{
                                background: '#3498DB', color: 'white', padding: '8px 16px',
                                fontSize: '0.85rem', fontWeight: 'bold', borderRadius: '10px'
                            }}
                        >
                            ⚡ 포인트 주기 {selectedIds.length > 0 && `(${selectedIds.length})`}
                        </Button>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                    {students.map((s, idx) => (
                        <motion.div
                            key={s.id}
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: idx * 0.05 }}
                            onClick={() => setSelectedIds(prev => prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                            style={{
                                display: 'flex', alignItems: 'center', padding: '12px 20px',
                                background: selectedIds.includes(s.id) ? '#EBF5FB' : 'white',
                                border: `1px solid ${selectedIds.includes(s.id) ? '#3498DB' : '#F2F4F4'}`,
                                borderRadius: '16px', cursor: 'pointer', transition: 'all 0.2s',
                                position: 'relative', overflow: 'hidden'
                            }}
                        >
                            {/* 등수 및 이름 */}
                            <div style={{ width: '40px', fontSize: '0.9rem', fontWeight: '900', color: idx < 3 ? '#F1C40F' : '#95A5A6' }}>
                                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                            </div>
                            <div style={{ width: '80px', fontWeight: '800', color: '#2C3E50', fontSize: '1rem' }}>{s.name}</div>

                            {/* 프로그레스 바 */}
                            <div style={{ flex: 1, height: '8px', background: '#F8F9F9', borderRadius: '4px', margin: '0 20px', position: 'relative' }}>
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.max(5, (s.total_points / (maxPoints || 1)) * 100)}%` }}
                                    style={{
                                        height: '100%',
                                        background: idx < 3 ? 'linear-gradient(90deg, #F1C40F, #F39C12)' : 'linear-gradient(90deg, #3498DB, #2980B9)',
                                        borderRadius: '4px'
                                    }}
                                />
                            </div>

                            {/* 포인트 정보 */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ textAlign: 'right', minWidth: '60px' }}>
                                    <span style={{ fontWeight: '900', fontSize: '1.2rem', color: '#2C3E50' }}>{s.total_points || 0}</span>
                                    <span style={{ fontSize: '0.8rem', color: '#7F8C8D', marginLeft: '4px' }}>P</span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => { e.stopPropagation(); openHistoryModal(s); }}
                                    style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#F8F9F9', color: '#7F8C8D' }}
                                >
                                    📜 기록
                                </Button>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* 포인트 모달 등 공통 요소 */}
                <CommonModals
                    isPointModalOpen={isPointModalOpen} setIsPointModalOpen={setIsPointModalOpen}
                    pointFormData={pointFormData} setPointFormData={setPointFormData}
                    handleBulkProcessPoints={handleBulkProcessPoints}
                    isHistoryModalOpen={isHistoryModalOpen} setIsHistoryModalOpen={setIsHistoryModalOpen}
                    historyStudent={historyStudent} historyLogs={historyLogs} loadingHistory={loadingHistory}
                />
            </div>
        );
    }

    // [클래스 설정 모드: 명단 관리 및 계정 확인]
    return (
        <div style={{ width: '100%' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '1.4rem', color: '#2C3E50', fontWeight: '900' }}>🎒 학생 명단 관리</h3>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                <input
                    type="text"
                    placeholder="새로운 학생 이름을 입력하세요"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddStudent()}
                    style={{ flex: 1, padding: '14px 20px', borderRadius: '12px', border: '2px solid #F2F4F4', outline: 'none' }}
                />
                <Button
                    onClick={handleAddStudent}
                    disabled={isAdding}
                    style={{ background: 'var(--primary-color)', color: 'white', fontWeight: 'bold', padding: '0 24px', borderRadius: '12px' }}
                >
                    추가 ✨
                </Button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                {students.map((s, idx) => (
                    <div key={s.id} style={{
                        display: 'flex', alignItems: 'center', padding: '16px',
                        background: 'white', border: '1px solid #ECEFF1', borderRadius: '16px',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ fontWeight: '900', color: '#2C3E50', fontSize: '1.1rem' }}>{s.name}</div>
                            <div style={{ background: '#F8F9F9', padding: '4px 8px', borderRadius: '8px', fontSize: '0.8rem', color: '#95A5A6', fontFamily: 'monospace' }}>
                                ID: {s.student_code}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    navigator.clipboard.writeText(s.student_code);
                                    alert('접속 코드가 복사되었습니다! 📋');
                                }}
                                style={{ background: '#E3F2FD', color: '#1976D2', border: 'none', padding: '6px 10px', fontSize: '0.75rem' }}
                            >
                                📋 복사
                            </Button>
                            <Button
                                onClick={() => { setDeleteTarget(s); setIsDeleteModalOpen(true); }}
                                style={{ background: '#FDEDEC', color: '#E74C3C', border: 'none', padding: '6px 10px', fontSize: '0.75rem' }}
                            >
                                🗑️ 삭제
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            <CommonModals
                isDeleteModalOpen={isDeleteModalOpen} setIsDeleteModalOpen={setIsDeleteModalOpen}
                deleteTarget={deleteTarget} handleDeleteStudent={handleDeleteStudent}
            />
        </div>
    );
};

// 모달 공통 컴포넌트 (내부 분리)
const CommonModals = ({
    isPointModalOpen, setIsPointModalOpen, pointFormData, setPointFormData, handleBulkProcessPoints,
    isHistoryModalOpen, setIsHistoryModalOpen, historyStudent, historyLogs, loadingHistory,
    isDeleteModalOpen, setIsDeleteModalOpen, deleteTarget, handleDeleteStudent
}) => {
    return (
        <AnimatePresence>
            {isPointModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
                    <Card style={{ width: '360px', padding: '24px' }}>
                        <h3 style={{ margin: '0 0 20px 0', textAlign: 'center' }}>⚡ 포인트 지급/차감</h3>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                            <button onClick={() => setPointFormData(p => ({ ...p, type: 'give' }))} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: pointFormData.type === 'give' ? '#3498DB' : '#F1F3F5', color: pointFormData.type === 'give' ? 'white' : '#95A5A6', fontWeight: 'bold' }}>+ 주기</button>
                            <button onClick={() => setPointFormData(p => ({ ...p, type: 'take' }))} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: pointFormData.type === 'take' ? '#E74C3C' : '#F1F3F5', color: pointFormData.type === 'take' ? 'white' : '#95A5A6', fontWeight: 'bold' }}>- 빼기</button>
                        </div>
                        <input type="number" value={pointFormData.amount} onChange={(e) => setPointFormData(p => ({ ...p, amount: parseInt(e.target.value) || 0 }))} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #D5DBDB', marginBottom: '12px' }} />
                        <input type="text" value={pointFormData.reason} onChange={(e) => setPointFormData(p => ({ ...p, reason: e.target.value }))} placeholder="사유를 입력하세요" style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #D5DBDB', marginBottom: '20px' }} />
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <Button variant="ghost" style={{ flex: 1 }} onClick={() => setIsPointModalOpen(false)}>취소</Button>
                            <Button style={{ flex: 2, background: '#3498DB', color: 'white' }} onClick={handleBulkProcessPoints}>반영하기</Button>
                        </div>
                    </Card>
                </div>
            )}
            {isHistoryModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
                    <Card style={{ width: '400px', maxHeight: '70vh', padding: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: '0 0 16px 0' }}>📜 {historyStudent?.name} 기록</h3>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {loadingHistory ? <p>로딩 중...</p> : historyLogs.map(l => (
                                <div key={l.id} style={{ padding: '12px 0', borderBottom: '1px solid #F8F9F9', display: 'flex', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{l.reason}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#ABB2B9' }}>{new Date(l.created_at).toLocaleString()}</div>
                                    </div>
                                    <div style={{ fontWeight: '900', color: l.amount > 0 ? '#27AE60' : '#E74C3C' }}>{l.amount > 0 ? `+${l.amount}` : l.amount}</div>
                                </div>
                            ))}
                        </div>
                        <Button style={{ marginTop: '16px' }} onClick={() => setIsHistoryModalOpen(false)}>닫기</Button>
                    </Card>
                </div>
            )}
            {isDeleteModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
                    <Card style={{ width: '320px', padding: '24px', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 8px 0' }}>정말 삭제하시겠습니까?</h3>
                        <p style={{ color: '#7F8C8D', fontSize: '0.9rem', marginBottom: '20px' }}>학생 <span style={{ fontWeight: 'bold', color: '#2C3E50' }}>{deleteTarget?.name}</span>님의 데이터가 삭제됩니다.</p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <Button variant="ghost" style={{ flex: 1 }} onClick={() => setIsDeleteModalOpen(false)}>취소</Button>
                            <Button style={{ flex: 1, background: '#E74C3C', color: 'white' }} onClick={handleDeleteStudent}>삭제</Button>
                        </div>
                    </Card>
                </div>
            )}
        </AnimatePresence>
    );
};

export default StudentManager;
