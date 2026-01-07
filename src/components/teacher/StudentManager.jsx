import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import Card from '../common/Card';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 역할: 선생님 - 학급 내 학생 명단 관리 (슬림 리스트 대시보드 버전)
 * 출석부를 보듯 편안하고 정확하게 아이들을 관리할 수 있는 최적화된 UI입니다. ✨
 */
const StudentManager = ({ classId }) => {
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
            .order('name', { ascending: true });

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

    return (
        <div style={{ marginTop: '16px', textAlign: 'left' }}>
            {/* [슬림 고정 헤더] */}
            <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 100,
                background: '#FDFEFE',
                padding: '12px 16px',
                borderRadius: '12px',
                marginBottom: '16px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                border: '1px solid #E5E8E8'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ fontSize: '1.1rem', color: '#2C3E50', margin: 0, fontWeight: '800' }}>📋 출석부 식 명단</h3>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#566573', cursor: 'pointer', background: '#F8F9F9', padding: '4px 8px', borderRadius: '8px', border: '1px solid #D5DBDB' }}>
                            <input type="checkbox" checked={students.length > 0 && selectedIds.length === students.length} onChange={toggleSelectAll} style={{ width: '14px', height: '14px' }} />
                            전체 선택
                        </label>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <Button
                            onClick={() => setIsPointModalOpen(true)}
                            size="sm"
                            disabled={selectedIds.length === 0}
                            style={{ background: selectedIds.length > 0 ? '#2ECC71' : '#D5DBDB', color: 'white' }}
                        >
                            ⚡ 포인트 일괄 부여 {selectedIds.length > 0 && `(${selectedIds.length}명)`}
                        </Button>
                        <Button onClick={() => setIsCodeModalOpen(true)} variant="ghost" size="sm" style={{ border: '1px solid #D5DBDB' }}>🔑 코드 확인</Button>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                        type="text"
                        placeholder="새 학생 이름"
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddStudent()}
                        style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #D5DBDB', outline: 'none', fontSize: '0.9rem' }}
                    />
                    <Button onClick={handleAddStudent} disabled={isAdding} size="sm">추가</Button>
                </div>
            </div>

            {/* [슬림 리스트 영역] */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {students.map((s, index) => (
                    <motion.div
                        key={s.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        whileHover={{ scale: 1.005, backgroundColor: '#FBFCFC' }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '8px 16px',
                            background: selectedIds.includes(s.id) ? '#F4F6F7' : 'white',
                            border: `1px solid ${selectedIds.includes(s.id) ? '#BDC3C7' : '#FBFCFC'}`,
                            borderRadius: '10px',
                            cursor: 'pointer',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                            transition: 'all 0.2s'
                        }}
                        onClick={() => setSelectedIds(prev => prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                    >
                        {/* 번호 및 체크박스 */}
                        <div style={{ width: '60px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input type="checkbox" checked={selectedIds.includes(s.id)} readOnly style={{ width: '15px', height: '15px' }} />
                            <span style={{ fontSize: '0.85rem', color: '#95A5A6', fontWeight: 'bold' }}>{String(index + 1).padStart(2, '0')}</span>
                        </div>

                        {/* 이름 */}
                        <div style={{ flex: 1.5, fontWeight: '700', color: '#2C3E50', fontSize: '1rem' }}>
                            {s.name}
                        </div>

                        {/* 접속 코드 (슬림하게 배치) */}
                        <div style={{ flex: 1, fontSize: '0.8rem', color: '#BDC3C7', fontFamily: 'monospace' }}>
                            <span className="code-text" style={{ transition: 'color 0.2s' }}>{s.student_code}</span>
                            <style>{`div:hover .code-text { color: #566573; }`}</style>
                        </div>

                        {/* 현재 포인트 */}
                        <div style={{ flex: 1.2, textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                            <span style={{ fontSize: '0.8rem', color: '#ABB2B9' }}>보유:</span>
                            <motion.span
                                key={s.total_points}
                                animate={{ scale: [1, 1.2, 1] }}
                                style={{ fontWeight: '800', color: '#2980B9', fontSize: '1.1rem' }}
                            >
                                {s.total_points || 0} P
                            </motion.span>
                        </div>

                        {/* 관리 버튼들 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '20px' }}>
                            <button
                                onClick={(e) => { e.stopPropagation(); openHistoryModal(s); }}
                                style={{ border: 'none', background: '#ECF0F1', color: '#7F8C8D', padding: '5px 10px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                                📜 기록
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); setIsDeleteModalOpen(true); }}
                                style={{ border: 'none', background: '#FDEDEC', color: '#E74C3C', padding: '5px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                title="학생 삭제"
                            >
                                🗑️
                            </button>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* [모달 영역 - 최적화] */}
            <AnimatePresence>
                {/* 포인트 부여 모달 */}
                {isPointModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(44, 62, 80, 0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(2px)' }}>
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                            <Card style={{ width: '360px', padding: '24px' }}>
                                <h2 style={{ fontSize: '1.2rem', color: '#2C3E50', marginBottom: '20px', textAlign: 'center' }}>⚡ {selectedIds.length}명 포인트 관리</h2>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                    <button onClick={() => setPointFormData(p => ({ ...p, type: 'give' }))} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: pointFormData.type === 'give' ? '#2ECC71' : '#F4F6F7', color: pointFormData.type === 'give' ? 'white' : '#95A5A6', fontWeight: 'bold' }}>(+) 주기</button>
                                    <button onClick={() => setPointFormData(p => ({ ...p, type: 'take' }))} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: pointFormData.type === 'take' ? '#E74C3C' : '#F4F6F7', color: pointFormData.type === 'take' ? 'white' : '#95A5A6', fontWeight: 'bold' }}>(-) 빼기</button>
                                </div>
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ fontSize: '0.8rem', color: '#7F8C8D', display: 'block', marginBottom: '4px' }}>점수</label>
                                    <input type="number" value={pointFormData.amount} onChange={(e) => setPointFormData(p => ({ ...p, amount: parseInt(e.target.value) || 0 }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #D5DBDB' }} />
                                </div>
                                <div style={{ marginBottom: '24px' }}>
                                    <label style={{ fontSize: '0.8rem', color: '#7F8C8D', display: 'block', marginBottom: '4px' }}>활동 사유 ✍️</label>
                                    <input type="text" value={pointFormData.reason} onChange={(e) => setPointFormData(p => ({ ...p, reason: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #D5DBDB' }} />
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <Button variant="ghost" style={{ flex: 1 }} onClick={() => setIsPointModalOpen(false)}>취소</Button>
                                    <Button onClick={handleBulkProcessPoints} style={{ flex: 1.5, background: pointFormData.type === 'give' ? '#2ECC71' : '#E74C3C', color: 'white' }}>반영하기</Button>
                                </div>
                            </Card>
                        </motion.div>
                    </div>
                )}

                {/* 접속 코드 인쇄 */}
                {isCodeModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'white', zIndex: 2000, padding: '40px', overflowY: 'auto' }}>
                        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                            <h2 style={{ color: '#2C3E50', margin: 0 }}>🔑 학생별 접속 코드</h2>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <Button onClick={() => window.print()} variant="primary" style={{ background: '#34495E' }}>🖨️ 인쇄하기</Button>
                                <Button onClick={() => setIsCodeModalOpen(false)} variant="ghost">닫기</Button>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
                            {students.map(s => (
                                <div key={s.id} style={{ border: '1px solid #D5DBDB', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#2C3E50', marginBottom: '8px' }}>{s.name}</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#2980B9', fontFamily: 'monospace' }}>{s.student_code}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 포인트 내역 */}
                {isHistoryModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
                        <Card style={{ width: '400px', maxHeight: '70vh', display: 'flex', flexDirection: 'column', padding: '20px' }}>
                            <h3 style={{ margin: '0 0 15px 0', borderBottom: '2px solid #F4F6F7', paddingBottom: '10px', fontSize: '1.1rem', color: '#2C3E50' }}>📜 {historyStudent?.name} 활동 기록</h3>
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                {loadingHistory ? <p>데이터를 찾는 중...</p> : historyLogs.map(l => (
                                    <div key={l.id} style={{ padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #FDFEFE' }}>
                                        <div>
                                            <div style={{ fontWeight: '600', color: '#34495E', fontSize: '0.9rem' }}>{l.reason}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#BDC3C7' }}>{new Date(l.created_at).toLocaleDateString()}</div>
                                        </div>
                                        <div style={{ fontWeight: 'bold', color: l.amount > 0 ? '#27AE60' : '#E74C3C', fontSize: '0.95rem' }}>
                                            {l.amount > 0 ? `+${l.amount}` : l.amount}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <Button variant="ghost" onClick={() => setIsHistoryModalOpen(false)} style={{ marginTop: '15px' }}>닫기</Button>
                        </Card>
                    </div>
                )}

                {/* 삭제 모달 */}
                {isDeleteModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200 }}>
                        <Card style={{ padding: '30px', textAlign: 'center', borderTop: '4px solid #E74C3C' }}>
                            <div style={{ fontSize: '2rem', marginBottom: '10px' }}>⚠️</div>
                            <h2 style={{ fontSize: '1.2rem', marginBottom: '8px', color: '#2C3E50' }}>정말 삭제하시나요?</h2>
                            <p style={{ color: '#7F8C8D', fontSize: '0.9rem' }}>{deleteTarget?.name} 학생의 포인트와 기록이 소멸됩니다.</p>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                                <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)} style={{ flex: 1 }}>취소</Button>
                                <Button onClick={handleDeleteStudent} style={{ flex: 1, background: '#E74C3C', color: 'white' }}>삭제하기</Button>
                            </div>
                        </Card>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default StudentManager;
