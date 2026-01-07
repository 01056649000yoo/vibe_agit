import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import Card from '../common/Card';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 역할: 선생님 - 학급 내 학생 명단 관리, 개별/일괄 포인트 관리 (더하기/빼기), 내역 확인 및 학생 삭제
 * 학생 삭제 및 포인트 기록을 동기화하여 데이터 일관성을 지킵니다. ✨
 * props:
 *  - classId: 현재 학급 ID
 */
const StudentManager = ({ classId }) => {
    const [studentName, setStudentName] = useState('');
    const [students, setStudents] = useState([]);
    const [isAdding, setIsAdding] = useState(false);

    // 개별 학생별 포인트 입력값 상태 { studentId: amount }
    const [pointInputs, setPointInputs] = useState({});

    // 다중 선택 관련 상태
    const [selectedIds, setSelectedIds] = useState([]);

    // 포인트 지급/차감 확인 모달 상태
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [confirmData, setConfirmData] = useState({
        type: 'give', // 'give' 또는 'take'
        target: 'single',
        student: null,
        students: [],
        amount: 0,
        reason: ''
    });

    // 포인트 내역 모달 상태
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [historyStudent, setHistoryStudent] = useState(null);
    const [historyLogs, setHistoryLogs] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // 학생 삭제 확인 모달 상태
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);

    // 페이지 진입 시 데이터 초기화 및 최신화
    useEffect(() => {
        if (classId) {
            fetchStudents();
        }

        // 데이터 고스트 현상 방지를 위한 정리 로직
        return () => {
            setStudents([]);
            setSelectedIds([]);
        };
    }, [classId]);

    // 학생 명단 불러오기 (DB와 화면의 100% 동기화를 보장합니다)
    const fetchStudents = async () => {
        if (!classId) return;

        // 조회를 시작하기 전 기존 데이터를 깨끗이 비워요.
        setStudents([]);

        const { data, error } = await supabase
            .from('students')
            .select('*')
            .eq('class_id', classId)
            .order('created_at', { ascending: true });

        if (!error && data) {
            // 가져온 최신 명단으로 완전히 교체해요.
            setStudents(data);

            // 포인트 입력 기본값 세팅 (10점)
            const initialInputs = {};
            data.forEach(s => {
                initialInputs[s.id] = 10;
            });
            setPointInputs(initialInputs);
        }
    };

    // 학생 삭제 핵심 로직 (DB 삭제와 상태 제거를 동시에!)
    const handleDeleteStudent = async () => {
        if (!deleteTarget) return;

        try {
            // 1. DB에서 학생을 확실히 지워요.
            const { error } = await supabase
                .from('students')
                .delete()
                .eq('id', deleteTarget.id);

            if (error) {
                alert('학생 삭제에 실패했어요: ' + error.message);
                return;
            }

            // 2. 삭제에 성공했다면 화면에서 즉시 제거하고 안내를 띄워요.
            setStudents(prev => prev.filter(s => s.id !== deleteTarget.id));
            setSelectedIds(prev => prev.filter(id => id !== deleteTarget.id));

            alert(`${deleteTarget.name} 학생의 소중한 명단을 안전하게 정리했습니다. 🧹`);

            // 3. 페이지 재진입 시에도 유지되도록 최종 동기화 완료!
            fetchStudents();
        } catch (error) {
            alert('삭제 과정 중 문제가 생겼어요: ' + error.message);
        } finally {
            setIsDeleteModalOpen(false);
            setDeleteTarget(null);
        }
    };

    // 포인트 지급/차감 상세 로직 (트랜잭션처럼 기록과 잔액을 묶어서 처리)
    const handleProcessPoints = async () => {
        const { type, target, student, students: targetStudents, amount, reason } = confirmData;
        if (!reason.trim()) {
            alert('왜 이 포인트를 주는지 사유를 적어주세요! 📝');
            return;
        }

        const actualAmount = type === 'give' ? amount : -amount;
        const targets = target === 'single' ? [student] : targetStudents;
        const previousStudents = [...students];

        // 1. 낙관적 업데이트: 화면의 숫자를 먼저 바꿔서 기분 좋게 해줘요.
        setStudents(prev => prev.map(s => {
            const isTarget = targets.find(t => t.id === s.id);
            return isTarget ? { ...s, total_points: (s.total_points || 0) + actualAmount } : s;
        }));

        setIsConfirmModalOpen(false);

        try {
            // 2. DB 동기화: 잔액 업데이트와 로그 기록을 순차적으로 수행해요.
            const operations = targets.map(async (t) => {
                const newPoints = (t.total_points || 0) + actualAmount;

                // 통장 잔액 업데이트
                const { error: upError } = await supabase
                    .from('students')
                    .update({ total_points: newPoints })
                    .eq('id', t.id);
                if (upError) throw upError;

                // 포인트 통장 로그 남기기
                const { error: logError } = await supabase
                    .from('point_logs')
                    .insert({
                        student_id: t.id,
                        amount: actualAmount,
                        reason: reason
                    });
                if (logError) throw logError;
            });

            await Promise.all(operations);
            alert(`${targets.length}명의 포인트 처리를 기록부에 안전하게 저장했습니다! ✨`);
            if (target === 'bulk') setSelectedIds([]);
        } catch (error) {
            // 실패 시 다시 되돌려서 데이터 고스트 현상을 막아요.
            setStudents(previousStudents);
            alert('데이터 저장 중 문제가 발생해 원래대로 복구했습니다: ' + error.message);
        }
    };

    // 포인트 내역 보기 (최신순 정렬 및 스크롤 적용)
    const openHistoryModal = async (student) => {
        setHistoryStudent(student);
        setIsHistoryModalOpen(true);
        setLoadingHistory(true);

        const { data, error } = await supabase
            .from('point_logs')
            .select('*')
            .eq('student_id', student.id)
            .order('created_at', { ascending: false }); // 최신 기록이 위로!

        if (error) {
            alert('내역을 불러오는 데 실패했어요: ' + error.message);
        } else {
            setHistoryLogs(data || []);
        }
        setLoadingHistory(false);
    };

    // 체크박스 제어
    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedIds(students.map(s => s.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const handleInputChange = (id, val) => {
        setPointInputs(prev => ({ ...prev, [id]: parseInt(val) || 0 }));
    };

    const generateCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    };

    // 학생 등록
    const handleAddStudent = async () => {
        if (!studentName.trim()) {
            alert('새로운 친구의 이름을 알려주세요! 😊');
            return;
        }
        setIsAdding(true);
        const code = generateCode();

        try {
            const { data, error } = await supabase
                .from('students')
                .insert({
                    class_id: classId,
                    name: studentName,
                    student_code: code,
                    total_points: 0
                })
                .select();

            if (error) throw error;

            if (data && data[0]) {
                const newStudent = data[0];
                // 서버 부하를 줄이기 위해 로컬 상태에 직접 추가해요.
                setStudents(prev => [...prev, newStudent]);
                setPointInputs(prev => ({ ...prev, [newStudent.id]: 10 }));
                setStudentName('');
            }
        } catch (error) {
            alert('학생 등록 중 문제가 생겼어요: ' + error.message);
        } finally {
            setIsAdding(false);
        }
    };

    return (
        <div style={{ marginTop: '24px', textAlign: 'left' }}>
            {/* 제목 및 일괄 포인트 관리 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🎒</span> 우리 반 학생 명찰
                </h3>

                {selectedIds.length > 0 && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button
                            onClick={() => {
                                setConfirmData({
                                    type: 'give', target: 'bulk', student: null,
                                    students: students.filter(s => selectedIds.includes(s.id)),
                                    amount: 10, reason: '훌륭한 단체 활동! 🌟'
                                });
                                setIsConfirmModalOpen(true);
                            }}
                            variant="primary" size="sm" style={{ background: '#4CAF50' }}
                        >
                            선택 {selectedIds.length}명 (+) 주기
                        </Button>
                        <Button
                            onClick={() => {
                                setConfirmData({
                                    type: 'take', target: 'bulk', student: null,
                                    students: students.filter(s => selectedIds.includes(s.id)),
                                    amount: 10, reason: '공동체 약속을 잊었어요 📝'
                                });
                                setIsConfirmModalOpen(true);
                            }}
                            variant="primary" size="sm" style={{ background: '#F44336' }}
                        >
                            선택 {selectedIds.length}명 (-) 빼기
                        </Button>
                    </div>
                )}
            </div>

            {/* 학생 추가 */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                <input
                    type="text"
                    placeholder="새로운 친구의 이름을 적어주세요"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddStudent()}
                    style={{
                        flex: 1, padding: '12px 16px', borderRadius: '12px',
                        border: '2px solid #FFE082', outline: 'none', fontSize: '1rem'
                    }}
                />
                <Button onClick={handleAddStudent} disabled={isAdding} variant="primary">
                    친구 합류하기 ✨
                </Button>
            </div>

            {/* 명단 테이블 */}
            <div style={{
                background: 'white', borderRadius: '16px', overflow: 'hidden',
                border: '1px solid #FFE082', boxShadow: '0 4px 12px rgba(255, 224, 130, 0.15)'
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
                    <thead>
                        <tr style={{ background: '#FFF9C4', color: '#795548', fontSize: '0.85rem', fontWeight: 'bold' }}>
                            <th style={{ padding: '14px' }}>
                                <input
                                    type="checkbox" onChange={handleSelectAll}
                                    checked={students.length > 0 && selectedIds.length === students.length}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                            </th>
                            <th style={{ padding: '14px' }}>번호</th>
                            <th style={{ padding: '14px' }}>이름</th>
                            <th style={{ padding: '14px' }}>현재 포인트</th>
                            <th style={{ padding: '14px' }}>포인트 관리</th>
                            <th style={{ padding: '14px' }}>기록</th>
                            <th style={{ padding: '14px' }}>설정</th>
                        </tr>
                    </thead>
                    <tbody>
                        {students.map((s, index) => (
                            <tr key={s.id} style={{
                                borderTop: '1px solid #FFFDE7', transition: 'background 0.2s',
                                background: selectedIds.includes(s.id) ? '#FFFDE7' : 'transparent'
                            }}>
                                <td style={{ padding: '12px' }}>
                                    <input
                                        type="checkbox" checked={selectedIds.includes(s.id)}
                                        onChange={() => handleSelectOne(s.id)}
                                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                    />
                                </td>
                                <td style={{ padding: '12px', color: '#999', fontSize: '0.9rem' }}>{index + 1}</td>
                                <td style={{ padding: '12px', fontWeight: '600', color: '#555' }}>{s.name}</td>
                                <td style={{ padding: '12px' }}>
                                    <motion.span
                                        key={s.total_points} initial={{ y: 0 }}
                                        animate={{ y: [0, -8, 0], scale: [1, 1.15, 1] }}
                                        transition={{ duration: 0.3 }}
                                        style={{ fontWeight: 'bold', color: 'var(--primary-color)', display: 'inline-block' }}
                                    >
                                        ✨ {s.total_points || 0}
                                    </motion.span>
                                </td>
                                <td style={{ padding: '12px' }}>
                                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                                        <input
                                            type="number" value={pointInputs[s.id] || 10}
                                            onChange={(e) => handleInputChange(s.id, e.target.value)}
                                            style={{
                                                width: '50px', padding: '6px', borderRadius: '8px',
                                                border: '1px solid #FFE082', textAlign: 'center', fontSize: '0.9rem'
                                            }}
                                        />
                                        <Button
                                            size="sm"
                                            onClick={() => {
                                                setConfirmData({
                                                    type: 'give', target: 'single', student: s, students: [],
                                                    amount: pointInputs[s.id] || 10, reason: '수업 태도 우수 ✨'
                                                });
                                                setIsConfirmModalOpen(true);
                                            }}
                                            style={{ padding: '6px 10px', background: '#E8F5E9', color: '#2E7D32', border: '1px solid #A5D6A7' }}
                                        >
                                            +
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => {
                                                setConfirmData({
                                                    type: 'take', target: 'single', student: s, students: [],
                                                    amount: pointInputs[s.id] || 10, reason: '약속을 지키지 못했어요 😢'
                                                });
                                                setIsConfirmModalOpen(true);
                                            }}
                                            style={{ padding: '6px 10px', background: '#FFEBEE', color: '#C62828', border: '1px solid #EF9A9A' }}
                                        >
                                            -
                                        </Button>
                                    </div>
                                </td>
                                <td style={{ padding: '12px' }}>
                                    <Button
                                        variant="ghost" size="sm" onClick={() => openHistoryModal(s)}
                                        style={{ fontSize: '0.8rem', padding: '4px 8px', color: '#795548' }}
                                    >
                                        📜 내역
                                    </Button>
                                </td>
                                <td style={{ padding: '12px' }}>
                                    <button
                                        onClick={() => { setDeleteTarget(s); setIsDeleteModalOpen(true); }}
                                        style={{
                                            border: 'none', background: '#FFF5F5', color: '#E03131',
                                            padding: '6px', borderRadius: '8px', cursor: 'pointer'
                                        }}
                                        title="학생 삭제"
                                    >
                                        🗑️
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* 포인트 확인 모달 */}
            <AnimatePresence>
                {isConfirmModalOpen && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center',
                        alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)'
                    }}>
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}>
                            <Card style={{ width: '90%', maxWidth: '400px', padding: '24px' }}>
                                <h2 style={{ fontSize: '1.4rem', marginBottom: '16px', color: 'var(--text-primary)', textAlign: 'center' }}>
                                    {confirmData.type === 'give' ? '🎁 포인트 선물하기' : '🧤 포인트 회수하기'}
                                </h2>
                                <div style={{ background: '#F8F9FA', padding: '16px', borderRadius: '12px', marginBottom: '20px', textAlign: 'center' }}>
                                    <p style={{ margin: '0 0 8px 0', fontSize: '1rem', color: '#555' }}>
                                        <strong>{confirmData.target === 'single' ? confirmData.student?.name : `선택한 ${confirmData.students.length}명`}</strong> 학생에게
                                    </p>
                                    <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold', color: confirmData.type === 'give' ? '#2E7D32' : '#C62828' }}>
                                        {confirmData.type === 'give' ? '+' : '-'}{confirmData.amount} 포인트
                                    </p>
                                </div>
                                <div style={{ marginBottom: '24px' }}>
                                    <label style={{ display: 'block', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>활동 사유 (필수 작성) 📝</label>
                                    <input
                                        type="text" value={confirmData.reason}
                                        onChange={(e) => setConfirmData(prev => ({ ...prev, reason: e.target.value }))}
                                        placeholder="이유를 짧게 적어주세요" autoFocus
                                        style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #FFE082', outline: 'none' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <Button variant="ghost" style={{ flex: 1 }} onClick={() => setIsConfirmModalOpen(false)}>취소</Button>
                                    <Button
                                        variant="primary" style={{ flex: 2, background: confirmData.type === 'give' ? '#4CAF50' : '#F44336' }}
                                        disabled={!confirmData.reason.trim()} onClick={handleProcessPoints}
                                    >
                                        정말 반영할게요!
                                    </Button>
                                </div>
                            </Card>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* 내역 보기 모달 */}
            <AnimatePresence>
                {isHistoryModalOpen && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center',
                        alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)'
                    }}>
                        <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}>
                            <Card style={{ width: '90%', maxWidth: '450px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                    <h2 style={{ fontSize: '1.3rem', margin: 0, color: 'var(--text-primary)' }}>📜 {historyStudent?.name}의 포인트 기록</h2>
                                    <button onClick={() => setIsHistoryModalOpen(false)} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999' }}>&times;</button>
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto', marginBottom: '20px', paddingRight: '8px', maxHeight: '400px' }}>
                                    {loadingHistory ? (
                                        <div style={{ textAlign: 'center', padding: '40px' }}>기록을 꼼꼼히 찾는 중... 🔍</div>
                                    ) : historyLogs.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>아직 포인트 기록이 없어요! ✨</div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {historyLogs.map(log => (
                                                <div key={log.id} style={{
                                                    padding: '14px', background: 'white', borderRadius: '14px',
                                                    display: 'flex', justifyContent: 'space-between', border: '1px solid #F1F3F5'
                                                }}>
                                                    <div>
                                                        <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#495057' }}>{log.reason}</div>
                                                        <span style={{ fontSize: '0.75rem', color: '#ADB5BD' }}>{new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                    <div style={{ fontSize: '1.1rem', fontWeight: '800', color: log.amount > 0 ? '#37B24D' : '#F03E3E' }}>
                                                        {log.amount > 0 ? `+${log.amount}` : log.amount}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <Button variant="secondary" onClick={() => setIsHistoryModalOpen(false)}>닫기</Button>
                            </Card>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* 삭제 확인 모달 */}
            <AnimatePresence>
                {isDeleteModalOpen && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center',
                        alignItems: 'center', zIndex: 1100, backdropFilter: 'blur(4px)'
                    }}>
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}>
                            <Card style={{ width: '90%', maxWidth: '400px', padding: '32px', textAlign: 'center' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '16px' }}>⚠️</div>
                                <h2 style={{ fontSize: '1.5rem', marginBottom: '12px', color: '#E03131' }}>정말 삭제할까요?</h2>
                                <p style={{ color: '#666', marginBottom: '24px' }}>
                                    {deleteTarget?.name} 학생을 삭제하면 모든 포인트 내역이 사라집니다.
                                </p>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <Button variant="ghost" style={{ flex: 1 }} onClick={() => setIsDeleteModalOpen(false)}>취소</Button>
                                    <Button variant="primary" style={{ flex: 1, background: '#E03131' }} onClick={handleDeleteStudent}>삭제하기</Button>
                                </div>
                            </Card>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default StudentManager;
