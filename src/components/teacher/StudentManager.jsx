import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import Card from '../common/Card';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 역할: 선생님 - 학급 내 학생 명단 관리, 개별/일괄 포인트 관리 (더하기/빼기), 및 내역 확인
 * props:
 *  - classId: 현재 학급 ID
 */
const StudentManager = ({ classId }) => {
    const [studentName, setStudentName] = useState('');
    const [students, setStudents] = useState([]);
    const [isAdding, setIsAdding] = useState(false);
    const [updatingId, setUpdatingId] = useState(null);

    // 개별 학생별 포인트 입력값 상태 { studentId: amount }
    const [pointInputs, setPointInputs] = useState({});

    // 다중 선택 관련 상태
    const [selectedIds, setSelectedIds] = useState([]);

    // 포인트 지급/차감 확인 모달 상태
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [confirmData, setConfirmData] = useState({
        type: 'give', // 'give' 또는 'take'
        target: 'single', // 'single' 또는 'bulk'
        student: null, // 단일 대상일 때
        students: [], // 일괄 대상일 때
        amount: 0,
        reason: ''
    });

    // 포인트 내역 모달 상태
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [historyStudent, setHistoryStudent] = useState(null);
    const [historyLogs, setHistoryLogs] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    useEffect(() => {
        if (classId) fetchStudents();
    }, [classId]);

    const fetchStudents = async () => {
        const { data } = await supabase
            .from('students')
            .select('*')
            .eq('class_id', classId)
            .order('created_at', { ascending: true });

        setStudents(data || []);

        // 입력값 초기화
        const initialInputs = {};
        (data || []).forEach(s => {
            initialInputs[s.id] = 10; // 기본값 10
        });
        setPointInputs(initialInputs);
    };

    // 체크박스 처리
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

    // 모달 열기 (개별)
    const openConfirmModal = (student, type) => {
        const amount = pointInputs[student.id] || 0;
        if (amount <= 0) {
            alert('0보다 큰 점수를 입력해주세요! 🔢');
            return;
        }
        setConfirmData({
            type,
            target: 'single',
            student,
            students: [],
            amount,
            reason: type === 'give' ? '수업 태도 우수 ✨' : '약속을 지키지 못했어요 😢'
        });
        setIsConfirmModalOpen(true);
    };

    // 모달 열기 (일괄)
    const openBulkConfirmModal = (type) => {
        if (selectedIds.length === 0) return;

        // 첫 번째 선택된 학생의 입력값을 기본값으로 사용하거나 고정값 10 사용
        const amount = 10;
        setConfirmData({
            type,
            target: 'bulk',
            student: null,
            students: students.filter(s => selectedIds.includes(s.id)),
            amount,
            reason: type === 'give' ? '훌륭한 단체 활동! 🌟' : '공동체 약속을 잊었어요 📝'
        });
        setIsConfirmModalOpen(true);
    };

    // 실제 포인트 처리 (트랜잭션 지향 루프)
    const handleProcessPoints = async () => {
        const { type, target, student, students: targetStudents, amount, reason } = confirmData;
        if (!reason.trim()) {
            alert('사유를 꼭 입력해주세요! ✍️');
            return;
        }

        const actualAmount = type === 'give' ? amount : -amount;
        const targets = target === 'single' ? [student] : targetStudents;
        const previousStudents = [...students];

        // 1. 낙관적 업데이트
        setStudents(prev => prev.map(s => {
            const isTarget = targets.find(t => t.id === s.id);
            return isTarget ? { ...s, total_points: (s.total_points || 0) + actualAmount } : s;
        }));

        setIsConfirmModalOpen(false);

        try {
            // 2. DB 반영 (각 학생별 업데이트 및 로그 기록)
            // Tip: 실제 상용 환경에서는 이 부분을 Database Function (RPC)으로 처리하는 것이 단일 트랜잭션 보장에 가장 좋습니다.
            const operations = targets.map(async (t) => {
                const newPoints = (t.total_points || 0) + actualAmount;

                // 포인트 업데이트
                const { error: upError } = await supabase
                    .from('students')
                    .update({ total_points: newPoints })
                    .eq('id', t.id);
                if (upError) throw upError;

                // 로그 기록
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

            alert(`${targets.length}명의 학생에게 포인트 처리가 완료되었습니다! ✨`);
            if (target === 'bulk') setSelectedIds([]);
        } catch (error) {
            // 실패 시 롤백
            setStudents(previousStudents);
            alert('처리 중 오류가 발생했습니다: ' + error.message);
        }
    };

    // 내역 보기 모달 열기
    const openHistoryModal = async (student) => {
        setHistoryStudent(student);
        setIsHistoryModalOpen(true);
        setLoadingHistory(true);

        const { data, error } = await supabase
            .from('point_logs')
            .select('*')
            .eq('student_id', student.id)
            .order('created_at', { ascending: false });

        if (error) {
            alert('내역을 불러오지 못했어요: ' + error.message);
        } else {
            setHistoryLogs(data || []);
        }
        setLoadingHistory(false);
    };

    const generateCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    };

    const handleAddStudent = async () => {
        if (!studentName.trim()) {
            alert('학생 이름을 입력해주세요! 😊');
            return;
        }
        setIsAdding(true);
        const code = generateCode();
        const { error } = await supabase
            .from('students')
            .insert({
                class_id: classId,
                name: studentName,
                student_code: code,
                total_points: 0
            });

        if (error) {
            alert('학생 등록 중 문제가 생겼어요: ' + error.message);
        } else {
            setStudentName('');
            fetchStudents();
        }
        setIsAdding(false);
    };

    return (
        <div style={{ marginTop: '24px', textAlign: 'left' }}>
            {/* 상단 헤더 및 일괄 처리 버튼 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🎒</span> 우리 반 학생 명단
                </h3>

                {selectedIds.length > 0 && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button
                            onClick={() => openBulkConfirmModal('give')}
                            variant="primary"
                            size="sm"
                            style={{ background: '#4CAF50' }}
                        >
                            선택 {selectedIds.length}명 (+) 주기
                        </Button>
                        <Button
                            onClick={() => openBulkConfirmModal('take')}
                            variant="primary"
                            size="sm"
                            style={{ background: '#F44336' }}
                        >
                            선택 {selectedIds.length}명 (-) 빼기
                        </Button>
                    </div>
                )}
            </div>

            {/* 학생 추가 입력창 */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                <input
                    type="text"
                    placeholder="새로운 학생 이름을 적어주세요"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddStudent()}
                    style={{
                        flex: 1,
                        padding: '12px 16px',
                        borderRadius: '12px',
                        border: '2px solid #FFE082',
                        outline: 'none',
                        fontSize: '1rem'
                    }}
                />
                <Button onClick={handleAddStudent} disabled={isAdding} variant="primary">
                    명단에 추가 ✨
                </Button>
            </div>

            {/* 학생 목록 테이블 */}
            <div style={{
                background: 'white',
                borderRadius: '16px',
                overflow: 'hidden',
                border: '1px solid #FFE082',
                boxShadow: '0 4px 12px rgba(255, 224, 130, 0.15)'
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
                    <thead>
                        <tr style={{ background: '#FFF9C4', color: '#795548', fontSize: '0.85rem', fontWeight: 'bold' }}>
                            <th style={{ padding: '14px' }}>
                                <input
                                    type="checkbox"
                                    onChange={handleSelectAll}
                                    checked={students.length > 0 && selectedIds.length === students.length}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                            </th>
                            <th style={{ padding: '14px' }}>번호</th>
                            <th style={{ padding: '14px' }}>이름</th>
                            <th style={{ padding: '14px' }}>현재 포인트</th>
                            <th style={{ padding: '14px' }}>포인트 관리</th>
                            <th style={{ padding: '14px' }}>기록</th>
                        </tr>
                    </thead>
                    <tbody>
                        {students.map((s, index) => (
                            <tr key={s.id} style={{
                                borderTop: '1px solid #FFFDE7',
                                transition: 'background 0.2s',
                                background: selectedIds.includes(s.id) ? '#FFFDE7' : 'transparent'
                            }}>
                                <td style={{ padding: '12px' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.includes(s.id)}
                                        onChange={() => handleSelectOne(s.id)}
                                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                    />
                                </td>
                                <td style={{ padding: '12px', color: '#999', fontSize: '0.9rem' }}>{index + 1}</td>
                                <td style={{ padding: '12px', fontWeight: '600', color: '#555' }}>{s.name}</td>
                                <td style={{ padding: '12px' }}>
                                    <motion.span
                                        key={s.total_points}
                                        initial={{ y: 0 }}
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
                                            type="number"
                                            value={pointInputs[s.id] || 10}
                                            onChange={(e) => handleInputChange(s.id, e.target.value)}
                                            style={{
                                                width: '50px',
                                                padding: '6px',
                                                borderRadius: '8px',
                                                border: '1px solid #FFE082',
                                                textAlign: 'center',
                                                fontSize: '0.9rem',
                                                outline: 'none'
                                            }}
                                        />
                                        <Button
                                            size="sm"
                                            onClick={() => openConfirmModal(s, 'give')}
                                            style={{ padding: '6px 10px', background: '#E8F5E9', color: '#2E7D32', border: '1px solid #A5D6A7' }}
                                        >
                                            +
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => openConfirmModal(s, 'take')}
                                            style={{ padding: '6px 10px', background: '#FFEBEE', color: '#C62828', border: '1px solid #EF9A9A' }}
                                        >
                                            -
                                        </Button>
                                    </div>
                                </td>
                                <td style={{ padding: '12px' }}>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openHistoryModal(s)}
                                        style={{ fontSize: '0.8rem', padding: '4px 8px', color: '#795548' }}
                                    >
                                        📜 내역
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {students.length === 0 && (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                        아직 등록된 학생이 없어요. 🎒
                    </div>
                )}
            </div>

            {/* 1. 포인트 부여/차감 확인 모달 */}
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
                                    {confirmData.type === 'give' ? '🎁 포인트 선물하기' : '🧤 포인트 차감하기'}
                                </h2>

                                <div style={{ background: '#F8F9FA', padding: '16px', borderRadius: '12px', marginBottom: '20px', textAlign: 'center' }}>
                                    <p style={{ margin: '0 0 8px 0', fontSize: '1rem', color: '#555' }}>
                                        {confirmData.target === 'single'
                                            ? <strong>{confirmData.student?.name}</strong>
                                            : <strong>선택한 {confirmData.students.length}명</strong>} 학생에게
                                    </p>
                                    <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold', color: confirmData.type === 'give' ? '#2E7D32' : '#C62828' }}>
                                        {confirmData.type === 'give' ? '+' : '-'}{confirmData.amount} 포인트
                                    </p>
                                </div>

                                <div style={{ marginBottom: '24px' }}>
                                    <label style={{ display: 'block', fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>활동 사유 (필수 입력) 📝</label>
                                    <input
                                        type="text"
                                        value={confirmData.reason}
                                        onChange={(e) => setConfirmData(prev => ({ ...prev, reason: e.target.value }))}
                                        placeholder="이유를 짧게 적어주세요"
                                        autoFocus
                                        style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #FFE082', outline: 'none' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <Button variant="ghost" style={{ flex: 1 }} onClick={() => setIsConfirmModalOpen(false)}>취소</Button>
                                    <Button
                                        variant="primary"
                                        style={{
                                            flex: 2,
                                            background: !confirmData.reason.trim() ? '#eee' : (confirmData.type === 'give' ? '#4CAF50' : '#F44336'),
                                            cursor: !confirmData.reason.trim() ? 'not-allowed' : 'pointer'
                                        }}
                                        disabled={!confirmData.reason.trim()}
                                        onClick={handleProcessPoints}
                                    >
                                        정말 {confirmData.type === 'give' ? '줄게요' : '뺄게요'}!
                                    </Button>
                                </div>
                            </Card>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* 2. 포인트 내역 확인 모달 */}
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
                                    <h2 style={{ fontSize: '1.3rem', margin: 0, color: 'var(--text-primary)' }}>
                                        📜 {historyStudent?.name}의 포인트 통장
                                    </h2>
                                    <button onClick={() => setIsHistoryModalOpen(false)} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999' }}>&times;</button>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', marginBottom: '20px', paddingRight: '8px' }}>
                                    {loadingHistory ? (
                                        <div style={{ textAlign: 'center', padding: '40px' }}>내역을 찾는 중... 🔍</div>
                                    ) : historyLogs.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>아직 기록이 없어요. ✨</div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {historyLogs.map(log => (
                                                <div key={log.id} style={{
                                                    padding: '12px',
                                                    background: '#F8F9FA',
                                                    borderRadius: '10px',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    borderLeft: `4px solid ${log.amount > 0 ? '#4CAF50' : '#F44336'}`
                                                }}>
                                                    <div>
                                                        <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: '600' }}>{log.reason}</p>
                                                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#999' }}>{new Date(log.created_at).toLocaleString()}</p>
                                                    </div>
                                                    <span style={{
                                                        fontWeight: 'bold',
                                                        color: log.amount > 0 ? '#2E7D32' : '#C62828',
                                                        fontSize: '1.1rem'
                                                    }}>
                                                        {log.amount > 0 ? `+${log.amount}` : log.amount}
                                                    </span>
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

            <p style={{ marginTop: '16px', fontSize: '0.85rem', color: '#999', textAlign: 'center' }}>
                💡 포인트 지급/차감 시 사유를 입력하면 아이들이 자신의 활동을 더 잘 이해할 수 있어요! 🌟
            </p>
        </div>
    );
};

export default StudentManager;
