import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import Card from '../common/Card';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 역할: 선생님 - 학급 내 학생 명단 관리 (슬림 2열 그리드 버전)
 * 상단 컨트롤 바를 2줄로 구성하여 여유 공간을 확보하고, 학생 카드를 슬림하게 조정했습니다. ✨
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
        <div style={{ marginTop: '4px', textAlign: 'left' }}>
            {/* [상단 컨트롤 바 - 2줄 구성] */}
            <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 100,
                background: '#FDFEFE',
                padding: '12px 16px',
                borderRadius: '12px',
                marginBottom: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                border: '1px solid #E5E8E8'
            }}>
                {/* 1행: 학생 추가 영역 */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <input
                        type="text"
                        placeholder="새로운 친구의 이름을 입력하세요 🎒"
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddStudent()}
                        style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1px solid #D5DBDB', outline: 'none', fontSize: '1rem' }}
                    />
                    <Button onClick={handleAddStudent} disabled={isAdding} style={{ padding: '0 20px', fontWeight: 'bold' }}>명단에 추가 ✨</Button>
                </div>

                {/* 2행: 포인트 및 코드 관리 영역 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', color: '#5D6D7E', cursor: 'pointer', background: '#F8F9F9', padding: '6px 12px', borderRadius: '8px', border: '1px solid #D5DBDB', fontWeight: 'bold' }}>
                            <input type="checkbox" checked={students.length > 0 && selectedIds.length === students.length} onChange={toggleSelectAll} style={{ width: '16px', height: '16px' }} />
                            전체 선택
                        </label>
                        <Button
                            onClick={() => setIsPointModalOpen(true)}
                            size="sm"
                            disabled={selectedIds.length === 0}
                            style={{
                                background: selectedIds.length > 0 ? '#3498DB' : '#D5DBDB',
                                color: 'white',
                                height: '36px',
                                padding: '0 16px',
                                fontWeight: 'bold'
                            }}
                        >
                            ⚡ 선택한 학생 포인트 관리 {selectedIds.length > 0 && `(${selectedIds.length})`}
                        </Button>
                    </div>

                    <Button
                        onClick={() => setIsCodeModalOpen(true)}
                        variant="ghost"
                        size="sm"
                        style={{ background: '#FFF9C4', border: '1px solid #FFE082', color: '#7E5109', fontWeight: 'bold', height: '36px' }}
                    >
                        🔑 접속코드 크게 보기 / 인쇄
                    </Button>
                </div>
            </div>

            {/* [슬림 2열 그리드 학생 목록] */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                paddingBottom: '40px'
            }}>
                {students.map((s, index) => (
                    <motion.div
                        key={s.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        whileHover={{ y: -2, boxShadow: '0 4px 8px rgba(0,0,0,0.08)' }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '8px 16px',
                            background: selectedIds.includes(s.id) ? '#EBF5FB' : 'white',
                            border: `1.5px solid ${selectedIds.includes(s.id) ? '#3498DB' : '#F2F4F4'}`,
                            borderRadius: '12px',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                            position: 'relative'
                        }}
                        onClick={() => setSelectedIds(prev => prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                    >
                        {/* 번호 */}
                        <div style={{ width: '35px', fontSize: '0.85rem', color: '#95A5A6', fontWeight: 'bold' }}>
                            {index + 1}
                        </div>

                        {/* 이름 (진한 텍스트) */}
                        <div style={{
                            flex: 1,
                            fontWeight: '800',
                            color: '#2C3E50',
                            fontSize: '1.05rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                        }}>
                            {s.name}
                        </div>

                        {/* 포인트 (강조) */}
                        <div style={{
                            padding: '0 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}>
                            <span style={{ fontSize: '0.9rem' }}>✨</span>
                            <motion.span
                                key={s.total_points}
                                animate={{ scale: [1, 1.2, 1] }}
                                style={{ fontWeight: '900', color: '#2C3E50', fontSize: '1.1rem' }}
                            >
                                {s.total_points || 0}
                            </motion.span>
                        </div>

                        {/* 관리 버튼들 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                                onClick={(e) => { e.stopPropagation(); openHistoryModal(s); }}
                                style={{ border: '1px solid #D5DBDB', background: 'white', color: '#7F8C8D', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                📜 내역
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); setIsDeleteModalOpen(true); }}
                                style={{ border: 'none', background: '#FDEDEC', color: '#E74C3C', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}
                                title="삭제"
                            >
                                🗑️
                            </button>
                        </div>

                        {/* 선택 체크 커스텀 표시 */}
                        {selectedIds.includes(s.id) && (
                            <div style={{ position: 'absolute', left: '-6px', top: '50%', transform: 'translateY(-50%)', background: '#3498DB', color: 'white', borderRadius: '4px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                                ✓
                            </div>
                        )}
                    </motion.div>
                ))}
            </div>

            {/* 모달 공통 - 스타일 유지 */}
            <AnimatePresence>
                {isPointModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(44, 62, 80, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(3px)' }}>
                        <Card style={{ width: '380px', padding: '24px' }}>
                            <h2 style={{ fontSize: '1.2rem', color: '#2C3E50', marginBottom: '20px', textAlign: 'center', fontWeight: 'bold' }}>⚡ 포인트 일괄 관리</h2>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                <button onClick={() => setPointFormData(p => ({ ...p, type: 'give' }))} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: pointFormData.type === 'give' ? '#3498DB' : '#F1F3F5', color: pointFormData.type === 'give' ? 'white' : '#95A5A6', fontWeight: 'bold' }}>(+) 주기</button>
                                <button onClick={() => setPointFormData(p => ({ ...p, type: 'take' }))} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: pointFormData.type === 'take' ? '#E74C3C' : '#F1F3F5', color: pointFormData.type === 'take' ? 'white' : '#95A5A6', fontWeight: 'bold' }}>(-) 빼기</button>
                            </div>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ fontSize: '0.8rem', color: '#5D6D7E', display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>점수</label>
                                <input type="number" value={pointFormData.amount} onChange={(e) => setPointFormData(p => ({ ...p, amount: parseInt(e.target.value) || 0 }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #D5DBDB' }} />
                            </div>
                            <div style={{ marginBottom: '24px' }}>
                                <label style={{ fontSize: '0.8rem', color: '#5D6D7E', display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>사유 ✍️</label>
                                <input type="text" value={pointFormData.reason} onChange={(e) => setPointFormData(p => ({ ...p, reason: e.target.value }))} placeholder="이유를 입력해주세요" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #D5DBDB' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <Button variant="ghost" style={{ flex: 1 }} onClick={() => setIsPointModalOpen(false)}>취소</Button>
                                <Button onClick={handleBulkProcessPoints} style={{ flex: 1.5, background: pointFormData.type === 'give' ? '#3498DB' : '#E74C3C', color: 'white' }}>반영하기</Button>
                            </div>
                        </Card>
                    </div>
                )}

                {/* 접속 코드 (인쇄용) */}
                {isCodeModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'white', zIndex: 2000, padding: '40px', overflowY: 'auto' }}>
                        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                            <h2 style={{ color: '#2C3E50', fontWeight: 'bold' }}>🔑 학생 접속 코드 명단</h2>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <Button onClick={() => window.print()} variant="primary">🖨️ 명단 인쇄</Button>
                                <Button onClick={() => setIsCodeModalOpen(false)} variant="ghost">닫기</Button>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
                            {students.map(s => (
                                <div key={s.id} style={{ border: '1.5px dashed #D5DBDB', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#2C3E50', marginBottom: '8px' }}>{s.name}</div>
                                    <div style={{ fontSize: '1.6rem', color: '#F39C12', fontWeight: '900', fontFamily: 'monospace' }}>{s.student_code}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 활동 내역 */}
                {isHistoryModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
                        <Card style={{ width: '400px', maxHeight: '70vh', display: 'flex', flexDirection: 'column', padding: '20px' }}>
                            <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', color: '#2C3E50', borderBottom: '2px solid #F4F6F7', paddingBottom: '10px' }}>📜 {historyStudent?.name} 기록</h3>
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                {loadingHistory ? <p>로딩 중...</p> : historyLogs.map(l => (
                                    <div key={l.id} style={{ padding: '10px 0', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #FDFEFE' }}>
                                        <div>
                                            <div style={{ fontWeight: '600', color: '#34495E', fontSize: '0.9rem' }}>{l.reason}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#ABB2B9' }}>{new Date(l.created_at).toLocaleString()}</div>
                                        </div>
                                        <div style={{ fontWeight: 'bold', color: l.amount > 0 ? '#27AE60' : '#E74C3C', fontSize: '1.05rem' }}>
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
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200 }}>
                        <Card style={{ width: '320px', padding: '28px', textAlign: 'center' }}>
                            <h2 style={{ fontSize: '1.1rem', marginBottom: '10px', color: '#2C3E50' }}>정말 삭제하시겠습니까?</h2>
                            <p style={{ color: '#7F8C8D', fontSize: '0.85rem' }}>선택한 학생의 모든 데이터가 소멸됩니다.</p>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
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
