import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import Card from '../common/Card';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 역할: 선생님 - 학급 내 학생 명단 관리 (그리드 대시보드 버전)
 * 마우스 휠을 내리지 않고도 약 25명의 학생을 한눈에 관리할 수 있습니다. ✨
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
        type: 'give', // 'give'(+) 또는 'take'(-)
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
            .order('name', { ascending: true }); // 이름순 정렬

        if (!error && data) setStudents(data);
    };

    // 포인트 일괄 처리 로직
    const handleBulkProcessPoints = async () => {
        if (selectedIds.length === 0) return;
        if (!pointFormData.reason.trim()) return alert('활동 사유를 입력해주세요! ✍️');

        const { type, amount, reason } = pointFormData;
        const actualAmount = type === 'give' ? amount : -amount;
        const targets = students.filter(s => selectedIds.includes(s.id));
        const previousStudents = [...students];

        // 1. 낙관적 업데이트
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
            alert('오류가 발생해 복구했습니다: ' + error.message);
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

    // 전체 선택 토글
    const toggleSelectAll = () => {
        if (selectedIds.length === students.length) setSelectedIds([]);
        else setSelectedIds(students.map(s => s.id));
    };

    return (
        <div style={{ marginTop: '20px', textAlign: 'left' }}>
            {/* [고정 레이아웃] 상단 컨트롤 바 */}
            <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 100,
                background: '#FFF9C4',
                padding: '16px',
                borderRadius: '16px',
                marginBottom: '20px',
                boxShadow: '0 4px 12px rgba(255, 224, 130, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                border: '1px solid #FFE082'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h3 style={{ fontSize: '1.2rem', color: '#795548', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>👨‍🏫</span> 학급 대시보드
                        </h3>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', color: '#795548', cursor: 'pointer', background: 'white', padding: '6px 10px', borderRadius: '10px', border: '1px solid #FFE082' }}>
                            <input type="checkbox" checked={students.length > 0 && selectedIds.length === students.length} onChange={toggleSelectAll} style={{ width: '16px', height: '16px' }} />
                            전체 선택
                        </label>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button
                            onClick={() => setIsPointModalOpen(true)}
                            variant="primary"
                            disabled={selectedIds.length === 0}
                            style={{ background: selectedIds.length > 0 ? '#4CAF50' : '#E0E0E0' }}
                        >
                            ➕ 포인트 부여하기 {selectedIds.length > 0 && `(${selectedIds.length}명)`}
                        </Button>
                        <Button
                            onClick={() => setIsCodeModalOpen(true)}
                            variant="ghost"
                            size="sm"
                            style={{ background: 'white', border: '1px solid #FFE082' }}
                        >
                            🔑 전체 코드
                        </Button>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                        type="text"
                        placeholder="새 학생 이름 엔터"
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddStudent()}
                        style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: '2px solid #FFE082', outline: 'none' }}
                    />
                    <Button onClick={handleAddStudent} disabled={isAdding} size="sm">추가</Button>
                </div>
            </div>

            {/* [그리드 레이아웃] 학생 미니 카드 목록 */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '12px',
                paddingBottom: '40px'
            }}>
                {students.map((s, index) => (
                    <motion.div
                        key={s.id}
                        whileHover={{ scale: 1.02 }}
                        style={{
                            background: selectedIds.includes(s.id) ? '#FFF9C4' : 'white',
                            border: `2px solid ${selectedIds.includes(s.id) ? '#FFB300' : '#FFE082'}`,
                            borderRadius: '16px',
                            padding: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            position: 'relative',
                            boxShadow: selectedIds.includes(s.id) ? '0 4px 12px rgba(255,179,0,0.2)' : '0 2px 6px rgba(0,0,0,0.03)',
                            cursor: 'pointer'
                        }}
                        onClick={() => setSelectedIds(prev => prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(s.id)}
                                    readOnly
                                    style={{ width: '16px', height: '16px' }}
                                />
                                <span style={{ fontSize: '0.8rem', color: '#999' }}>{index + 1}</span>
                                <span style={{ fontWeight: '800', fontSize: '1.05rem', color: '#555' }}>{s.name}</span>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); openHistoryModal(s); }}
                                style={{ padding: '4px 6px', fontSize: '0.8rem' }}
                            >
                                📜
                            </Button>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                            <div className="code-hint" style={{ fontSize: '0.75rem', color: '#ABB2B9', fontFamily: 'monospace' }}>
                                <code>{s.student_code}</code>
                                <style>{`
                                    .code-hint { opacity: 0.2; transition: opacity 0.2s; }
                                    div:hover .code-hint { opacity: 1; color: #FF8F00; font-weight: bold; }
                                `}</style>
                            </div>
                            <motion.div
                                key={s.total_points}
                                initial={{ scale: 1 }}
                                animate={{ scale: [1, 1.2, 1] }}
                                style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#FF8F00' }}
                            >
                                ✨ {s.total_points || 0}
                            </motion.div>
                        </div>

                        {/* 삭제 버튼 (작게 배치) */}
                        <button
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); setIsDeleteModalOpen(true); }}
                            style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#FF5252', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                        >
                            ✕
                        </button>
                    </motion.div>
                ))}
            </div>

            {/* [통합 모달] 포인트 부여/차감 */}
            <AnimatePresence>
                {isPointModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                            <Card style={{ width: '90%', maxWidth: '400px', padding: '24px' }}>
                                <h2 style={{ fontSize: '1.4rem', textAlign: 'center', marginBottom: '20px' }}>🎁 포인트 선물 상자</h2>

                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px' }}>증감 선택</label>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button
                                            onClick={() => setPointFormData(p => ({ ...p, type: 'give' }))}
                                            style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: pointFormData.type === 'give' ? '#4CAF50' : '#F1F3F5', color: pointFormData.type === 'give' ? 'white' : '#777', fontWeight: 'bold' }}
                                        >
                                            (+) 주기
                                        </button>
                                        <button
                                            onClick={() => setPointFormData(p => ({ ...p, type: 'take' }))}
                                            style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: pointFormData.type === 'take' ? '#F44336' : '#F1F3F5', color: pointFormData.type === 'take' ? 'white' : '#777', fontWeight: 'bold' }}
                                        >
                                            (-) 빼기
                                        </button>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px' }}>포인트 점수</label>
                                        <input
                                            type="number"
                                            value={pointFormData.amount}
                                            onChange={(e) => setPointFormData(p => ({ ...p, amount: parseInt(e.target.value) || 0 }))}
                                            style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #FFE082' }}
                                        />
                                    </div>
                                </div>

                                <div style={{ marginBottom: '24px' }}>
                                    <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px' }}>활동 사유 📝</label>
                                    <input
                                        type="text"
                                        value={pointFormData.reason}
                                        onChange={(e) => setPointFormData(p => ({ ...p, reason: e.target.value }))}
                                        placeholder="어떤 멋진 일을 했나요?"
                                        style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #FFE082' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <Button variant="ghost" style={{ flex: 1 }} onClick={() => setIsPointModalOpen(false)}>취소</Button>
                                    <Button
                                        variant="primary"
                                        style={{ flex: 2, background: pointFormData.type === 'give' ? '#4CAF50' : '#F44336' }}
                                        onClick={handleBulkProcessPoints}
                                    >
                                        {selectedIds.length}명에게 반영하기
                                    </Button>
                                </div>
                            </Card>
                        </motion.div>
                    </div>
                )}

                {/* 접속 코드 전체 확인 (인쇄용 기구축 기능 유지) */}
                {isCodeModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'white', zIndex: 2000, padding: '40px', overflowY: 'auto' }}>
                        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', marginBottom: '40px' }}>
                            <h2>접속 코드 인쇄 명단 🔑</h2>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <Button onClick={() => window.print()} variant="primary" style={{ background: '#4CAF50' }}>🖨️ 인쇄하기</Button>
                                <Button onClick={() => setIsCodeModalOpen(false)} variant="ghost">닫기</Button>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '20px' }}>
                            {students.map(s => (
                                <div key={s.id} style={{ border: '2px dashed #FFE082', borderRadius: '16px', padding: '24px', textAlign: 'center', background: '#FFFDE7' }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '1.2rem', color: '#795548', marginBottom: '8px' }}>{s.name}</div>
                                    <div style={{ fontSize: '2rem', fontWeight: '800', color: '#FF8F00', fontFamily: 'monospace' }}>{s.student_code}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 역사 내역 모달 */}
                {isHistoryModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
                        <Card style={{ width: '90%', maxWidth: '450px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '20px' }}>
                            <h3>📜 {historyStudent?.name}의 기록</h3>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
                                {loadingHistory ? <p>불러오는 중...</p> : historyLogs.map(l => (
                                    <div key={l.id} style={{ padding: '10px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
                                        <div><div style={{ fontWeight: '500' }}>{l.reason}</div><div style={{ fontSize: '0.7rem', color: '#999' }}>{new Date(l.created_at).toLocaleString()}</div></div>
                                        <div style={{ fontWeight: 'bold', color: l.amount > 0 ? '#4CAF50' : '#F44336' }}>{l.amount > 0 ? `+${l.amount}` : l.amount}</div>
                                    </div>
                                ))}
                            </div>
                            <Button variant="secondary" onClick={() => setIsHistoryModalOpen(false)}>닫기</Button>
                        </Card>
                    </div>
                )}

                {/* 삭제 확인 모달 */}
                {isDeleteModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200 }}>
                        <Card style={{ padding: '30px', textAlign: 'center' }}>
                            <h2>정말 삭제하시겠어요?</h2>
                            <p>{deleteTarget?.name} 학생의 소중한 포인트와 기록이 삭제됩니다.</p>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                                <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>취소</Button>
                                <Button onClick={handleDeleteStudent} style={{ background: '#F44336' }}>삭제하기</Button>
                            </div>
                        </Card>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default StudentManager;
