import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import Card from '../common/Card';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 역할: 선생님 - 학급 내 학생 명단 관리 (2열 종대 슬림 그리드 버전)
 * 마우스 휠을 거의 쓰지 않고도 20~25명의 학생을 한눈에 관리할 수 있습니다. ✨
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
        <div style={{ marginTop: '8px', textAlign: 'left' }}>
            {/* [슬림 고정 상단바] */}
            <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 100,
                background: '#FDFEFE',
                padding: '8px 12px',
                borderRadius: '10px',
                marginBottom: '12px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                border: '1px solid #E5E8E8'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h3 style={{ fontSize: '1rem', color: '#2C3E50', margin: 0, fontWeight: '900' }}>👦 리스트</h3>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#566573', cursor: 'pointer', background: '#F8F9F9', padding: '3px 8px', borderRadius: '6px', border: '1px solid #D5DBDB' }}>
                        <input type="checkbox" checked={students.length > 0 && selectedIds.length === students.length} onChange={toggleSelectAll} style={{ width: '13px', height: '13px' }} />
                        전체
                    </label>
                </div>

                <div style={{ flex: 1, display: 'flex', gap: '6px' }}>
                    <input
                        type="text"
                        placeholder="이름 입력 후 엔터"
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddStudent()}
                        style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid #D5DBDB', outline: 'none', fontSize: '0.85rem' }}
                    />
                    <Button onClick={handleAddStudent} disabled={isAdding} size="sm" style={{ padding: '0 10px', height: '32px' }}>추가</Button>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                    <Button
                        onClick={() => setIsPointModalOpen(true)}
                        size="sm"
                        disabled={selectedIds.length === 0}
                        style={{
                            background: selectedIds.length > 0 ? '#3498DB' : '#D5DBDB',
                            color: 'white',
                            height: '32px',
                            minWidth: '80px',
                            fontSize: '0.8rem'
                        }}
                    >
                        ⚡ 점수주기 {selectedIds.length > 0 && `(${selectedIds.length})`}
                    </Button>
                    <button
                        onClick={() => setIsCodeModalOpen(true)}
                        style={{ border: 'none', background: '#F4D03F', color: '#7E5109', borderRadius: '6px', padding: '0 8px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', height: '32px' }}
                    >
                        🔑 코드
                    </button>
                </div>
            </div>

            {/* [2열 종대 멀티 그리드 목록] */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                maxHeight: 'calc(100vh - 160px)',
                overflowY: 'auto',
                paddingRight: '4px'
            }}>
                {students.map((s, index) => (
                    <motion.div
                        key={s.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        whileHover={{ backgroundColor: '#F4F6F7' }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '6px 12px',
                            background: selectedIds.includes(s.id) ? '#E3F2FD' : 'white',
                            border: `1.5px solid ${selectedIds.includes(s.id) ? '#3498DB' : '#EBEDEF'}`,
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.1s',
                            position: 'relative'
                        }}
                        onClick={() => setSelectedIds(prev => prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                    >
                        {/* 번호 및 체크박스 */}
                        <div style={{ width: '45px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input type="checkbox" checked={selectedIds.includes(s.id)} readOnly style={{ width: '13px', height: '13px' }} />
                            <span style={{ fontSize: '0.75rem', color: '#95A5A6', fontWeight: 'bold' }}>{index + 1}</span>
                        </div>

                        {/* 이름 (가장 강조) */}
                        <div style={{ flex: 1, fontWeight: '800', color: '#2C3E50', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.name}
                        </div>

                        {/* 포인트 (강조) */}
                        <div style={{ padding: '0 10px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <span style={{ fontSize: '0.7rem', color: '#7F8C8D' }}>✨</span>
                            <motion.span
                                key={s.total_points}
                                animate={{ scale: [1, 1.3, 1] }}
                                style={{ fontWeight: '900', color: '#2C3E50', fontSize: '1rem' }}
                            >
                                {s.total_points || 0}
                            </motion.span>
                        </div>

                        {/* 관리 버튼 (작고 슬림하게) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <button
                                onClick={(e) => { e.stopPropagation(); openHistoryModal(s); }}
                                style={{ border: '1px solid #D5DBDB', background: 'white', color: '#7F8C8D', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer' }}
                                title="활동 내역"
                            >
                                📜
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); setIsDeleteModalOpen(true); }}
                                style={{ border: 'none', background: '#FADBD8', color: '#E74C3C', width: '24px', height: '24px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}
                                title="삭제"
                            >
                                🗑️
                            </button>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* [모달 공통 - 디자인 유지] */}
            <AnimatePresence>
                {/* 포인트 부여 모달 */}
                {isPointModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(44, 62, 80, 0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(2px)' }}>
                        <Card style={{ width: '340px', padding: '20px' }}>
                            <h2 style={{ fontSize: '1.1rem', color: '#2C3E50', marginBottom: '16px', textAlign: 'center' }}>⚡ {selectedIds.length}명 포인트 관리</h2>
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                                <button onClick={() => setPointFormData(p => ({ ...p, type: 'give' }))} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', background: pointFormData.type === 'give' ? '#3498DB' : '#F4F6F7', color: pointFormData.type === 'give' ? 'white' : '#95A5A6', fontWeight: 'bold', fontSize: '0.85rem' }}>(+) 주기</button>
                                <button onClick={() => setPointFormData(p => ({ ...p, type: 'take' }))} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', background: pointFormData.type === 'take' ? '#E74C3C' : '#F4F6F7', color: pointFormData.type === 'take' ? 'white' : '#95A5A6', fontWeight: 'bold', fontSize: '0.85rem' }}>(-) 빼기</button>
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ fontSize: '0.75rem', color: '#7F8C8D', display: 'block', marginBottom: '4px' }}>점수</label>
                                <input type="number" value={pointFormData.amount} onChange={(e) => setPointFormData(p => ({ ...p, amount: parseInt(e.target.value) || 0 }))} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D5DBDB' }} />
                            </div>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ fontSize: '0.75rem', color: '#7F8C8D', display: 'block', marginBottom: '4px' }}>활동 사유</label>
                                <input type="text" value={pointFormData.reason} onChange={(e) => setPointFormData(p => ({ ...p, reason: e.target.value }))} placeholder="이유를 입력해주세요" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D5DBDB' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <Button variant="ghost" style={{ flex: 1 }} onClick={() => setIsPointModalOpen(false)}>취소</Button>
                                <Button onClick={handleBulkProcessPoints} style={{ flex: 1.5, background: pointFormData.type === 'give' ? '#3498DB' : '#E74C3C', color: 'white' }}>반영하기</Button>
                            </div>
                        </Card>
                    </div>
                )}

                {/* 접속 코드 (인쇄용 기구축 기능 유지) */}
                {isCodeModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'white', zIndex: 2000, padding: '40px', overflowY: 'auto' }}>
                        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ fontSize: '1.2rem' }}>🔑 코드 명단</h2>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <Button onClick={() => window.print()} variant="primary" size="sm">🖨️ 인쇄</Button>
                                <Button onClick={() => setIsCodeModalOpen(false)} variant="ghost" size="sm">닫기</Button>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                            {students.map(s => (
                                <div key={s.id} style={{ border: '1px solid #eee', borderRadius: '10px', padding: '15px', textAlign: 'center' }}>
                                    <div style={{ fontWeight: 'bold' }}>{s.name}</div>
                                    <div style={{ fontSize: '1.2rem', color: '#FF8F00', fontWeight: '800' }}>{s.student_code}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 포인트 내역 */}
                {isHistoryModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
                        <Card style={{ width: '380px', maxHeight: '60vh', display: 'flex', flexDirection: 'column', padding: '20px' }}>
                            <h3 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: '#2C3E50' }}>📜 {historyStudent?.name} 기록</h3>
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                {loadingHistory ? <p>로딩 중...</p> : historyLogs.map(l => (
                                    <div key={l.id} style={{ padding: '8px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F8F9F9' }}>
                                        <div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: '600' }}>{l.reason}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#ABB2B9' }}>{new Date(l.created_at).toLocaleDateString()}</div>
                                        </div>
                                        <div style={{ fontWeight: 'bold', color: l.amount > 0 ? '#27AE60' : '#E74C3C' }}>
                                            {l.amount > 0 ? `+${l.amount}` : l.amount}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <Button variant="ghost" onClick={() => setIsHistoryModalOpen(false)} style={{ marginTop: '10px' }}>닫기</Button>
                        </Card>
                    </div>
                )}

                {/* 삭제 모달 */}
                {isDeleteModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200 }}>
                        <Card style={{ width: '320px', padding: '24px', textAlign: 'center' }}>
                            <h2 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>정말 삭제하시나요?</h2>
                            <p style={{ color: '#7F8C8D', fontSize: '0.85rem' }}>{deleteTarget?.name} 학생의 기록이 모두 사라집니다.</p>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                                <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)} style={{ flex: 1 }}>취소</Button>
                                <Button onClick={handleDeleteStudent} style={{ flex: 1, background: '#E74C3C', color: 'white' }}>삭제</Button>
                            </div>
                        </Card>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default StudentManager;
