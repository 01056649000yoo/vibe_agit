import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import Card from '../common/Card';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 역할: 선생님 - 학급 내 학생 명단 관리, 개별/일괄 포인트 관리, 접속 코드 확인 및 인쇄
 * 스크롤이 길어져도 상단 메뉴와 표 머리글이 고정되어 관리가 편리합니다. ✨
 * props:
 *  - classId: 현재 학급 ID
 */
const StudentManager = ({ classId }) => {
    const [studentName, setStudentName] = useState('');
    const [students, setStudents] = useState([]);
    const [isAdding, setIsAdding] = useState(false);

    // 개별 학생별 포인트 입력값 상태
    const [pointInputs, setPointInputs] = useState({});

    // 다중 선택 관련 상태
    const [selectedIds, setSelectedIds] = useState([]);

    // 각종 모달 상태
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);

    const [confirmData, setConfirmData] = useState({
        type: 'give', target: 'single', student: null, students: [], amount: 0, reason: ''
    });
    const [historyStudent, setHistoryStudent] = useState(null);
    const [historyLogs, setHistoryLogs] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);

    // 데이터 최신화
    useEffect(() => {
        if (classId) {
            fetchStudents();
        }
        return () => {
            setStudents([]);
            setSelectedIds([]);
        };
    }, [classId]);

    const fetchStudents = async () => {
        if (!classId) return;
        setStudents([]);
        const { data, error } = await supabase
            .from('students')
            .select('*')
            .eq('class_id', classId)
            .order('created_at', { ascending: true });

        if (!error && data) {
            setStudents(data);
            const initialInputs = {};
            data.forEach(s => {
                initialInputs[s.id] = 10;
            });
            setPointInputs(initialInputs);
        }
    };

    const handleDeleteStudent = async () => {
        if (!deleteTarget) return;
        try {
            const { error } = await supabase.from('students').delete().eq('id', deleteTarget.id);
            if (error) throw error;
            setStudents(prev => prev.filter(s => s.id !== deleteTarget.id));
            setSelectedIds(prev => prev.filter(id => id !== deleteTarget.id));
            alert(`${deleteTarget.name} 학생을 정리했습니다. 🧹`);
        } catch (error) {
            alert('삭제 중 오류가 생겼어요: ' + error.message);
        } finally {
            setIsDeleteModalOpen(false);
            setDeleteTarget(null);
        }
    };

    const handleProcessPoints = async () => {
        const { type, target, student, students: targetStudents, amount, reason } = confirmData;
        if (!reason.trim()) {
            alert('사유를 입력해주세요! 📝');
            return;
        }

        const actualAmount = type === 'give' ? amount : -amount;
        const targets = target === 'single' ? [student] : targetStudents;
        const previousStudents = [...students];

        setStudents(prev => prev.map(s => {
            const isTarget = targets.find(t => t.id === s.id);
            return isTarget ? { ...s, total_points: (s.total_points || 0) + actualAmount } : s;
        }));

        setIsConfirmModalOpen(false);

        try {
            const operations = targets.map(async (t) => {
                const newPoints = (t.total_points || 0) + actualAmount;
                const { error: upError } = await supabase.from('students').update({ total_points: newPoints }).eq('id', t.id);
                if (upError) throw upError;
                const { error: logError } = await supabase.from('point_logs').insert({ student_id: t.id, amount: actualAmount, reason: reason });
                if (logError) throw logError;
            });
            await Promise.all(operations);
            alert('반영되었습니다! ✨');
        } catch (error) {
            setStudents(previousStudents);
            alert('오류 발생: ' + error.message);
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
        if (!studentName.trim()) return alert('이름을 입력해주세요!');
        setIsAdding(true);
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));

        const { data, error } = await supabase.from('students').insert({ class_id: classId, name: studentName, student_code: code, total_points: 0 }).select();
        if (!error && data[0]) {
            setStudents(prev => [...prev, data[0]]);
            setPointInputs(prev => ({ ...prev, [data[0].id]: 10 }));
            setStudentName('');
        }
        setIsAdding(false);
    };

    return (
        <div style={{ marginTop: '24px', textAlign: 'left' }}>
            {/* [고정 레이아웃 1] 상단 컨트롤 바 (입력창 + 일괄 버튼) */}
            <div style={{
                position: 'sticky',
                top: '0px',
                zIndex: 100,
                background: 'var(--bg-primary)',
                paddingBottom: '16px',
                borderBottom: '1px solid rgba(255, 224, 130, 0.3)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h3 style={{ fontSize: '1.2rem', color: '#795548', margin: 0 }}>🎒 우리 반 학생 관리</h3>
                        <Button
                            onClick={() => setIsCodeModalOpen(true)}
                            variant="ghost"
                            size="sm"
                            style={{ background: '#FFFDE7', border: '1px solid #FFE082' }}
                        >
                            🔑 접속코드 확인
                        </Button>
                    </div>

                    {selectedIds.length > 0 && (
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} style={{ display: 'flex', gap: '8px' }}>
                            <Button onClick={() => { setConfirmData({ type: 'give', target: 'bulk', students: students.filter(s => selectedIds.includes(s.id)), amount: 10, reason: '단정하게 생활해요 ✨' }); setIsConfirmModalOpen(true); }} variant="primary" size="sm" style={{ background: '#4CAF50' }}>선택 {selectedIds.length}명 (+) 주기</Button>
                            <Button onClick={() => { setConfirmData({ type: 'take', target: 'bulk', students: students.filter(s => selectedIds.includes(s.id)), amount: 10, reason: '약속을 기억해요 📝' }); setIsConfirmModalOpen(true); }} variant="primary" size="sm" style={{ background: '#F44336' }}>선택 {selectedIds.length}명 (-) 빼기</Button>
                        </motion.div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                        type="text"
                        placeholder="새로운 친구 이름 추가"
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddStudent()}
                        style={{ flex: 1, padding: '12px 16px', borderRadius: '12px', border: '2px solid #FFE082', outline: 'none' }}
                    />
                    <Button onClick={handleAddStudent} disabled={isAdding} variant="primary">추가 ✨</Button>
                </div>
            </div>

            {/* [고정 레이아웃 2] 테이블 영역 고정 스크롤 */}
            <div style={{
                marginTop: '20px',
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #FFE082',
                boxShadow: '0 4px 12px rgba(255, 224, 130, 0.15)',
                maxHeight: '600px', // 스크롤 지옥 안녕!
                overflowY: 'auto',
                position: 'relative'
            }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'center' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#FFF9C4' }}>
                        <tr style={{ color: '#795548', fontSize: '0.85rem', fontWeight: 'bold' }}>
                            <th style={{ padding: '14px', borderBottom: '2px solid #FFE082' }}>
                                <input type="checkbox" onChange={(e) => setSelectedIds(e.target.checked ? students.map(s => s.id) : [])} checked={students.length > 0 && selectedIds.length === students.length} />
                            </th>
                            <th style={{ padding: '14px', borderBottom: '2px solid #FFE082' }}>번호</th>
                            <th style={{ padding: '14px', borderBottom: '2px solid #FFE082' }}>이름</th>
                            <th style={{ padding: '14px', borderBottom: '2px solid #FFE082' }}>코드</th>
                            <th style={{ padding: '14px', borderBottom: '2px solid #FFE082' }}>포인트</th>
                            <th style={{ padding: '14px', borderBottom: '2px solid #FFE082' }}>관리</th>
                            <th style={{ padding: '14px', borderBottom: '2px solid #FFE082' }}>기록</th>
                            <th style={{ padding: '14px', borderBottom: '2px solid #FFE082' }}>삭제</th>
                        </tr>
                    </thead>
                    <tbody>
                        {students.map((s, index) => (
                            <tr key={s.id} style={{
                                background: selectedIds.includes(s.id) ? '#FFFDE7' : 'transparent',
                                transition: 'background 0.2s'
                            }}>
                                <td style={{ padding: '12px', borderBottom: '1px solid #FFFDE7' }}>
                                    <input type="checkbox" checked={selectedIds.includes(s.id)} onChange={() => setSelectedIds(prev => prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id])} />
                                </td>
                                <td style={{ padding: '12px', borderBottom: '1px solid #FFFDE7', color: '#999' }}>{index + 1}</td>
                                <td style={{ padding: '12px', borderBottom: '1px solid #FFFDE7', fontWeight: '600' }}>{s.name}</td>
                                <td style={{ padding: '12px', borderBottom: '1px solid #FFFDE7', fontSize: '0.85rem', fontFamily: 'monospace' }}>{s.student_code}</td>
                                <td style={{ padding: '12px', borderBottom: '1px solid #FFFDE7' }}>
                                    <motion.span key={s.total_points} animate={{ scale: [1, 1.2, 1] }} style={{ fontWeight: 'bold', color: '#FF8F00' }}>✨ {s.total_points || 0}</motion.span>
                                </td>
                                <td style={{ padding: '12px', borderBottom: '1px solid #FFFDE7' }}>
                                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                        <input type="number" value={pointInputs[s.id] || 10} onChange={(e) => setPointInputs(prev => ({ ...prev, [s.id]: parseInt(e.target.value) || 0 }))} style={{ width: '45px', padding: '4px', borderRadius: '6px', border: '1px solid #FFE082', textAlign: 'center' }} />
                                        <Button size="sm" onClick={() => { setConfirmData({ type: 'give', target: 'single', student: s, amount: pointInputs[s.id] || 10, reason: '칭찬해요! 🌟' }); setIsConfirmModalOpen(true); }} style={{ padding: '4px 8px', background: '#E8F5E9', color: '#2E7D32' }}>+</Button>
                                        <Button size="sm" onClick={() => { setConfirmData({ type: 'take', target: 'single', student: s, amount: pointInputs[s.id] || 10, reason: '약속을 지켜요 😢' }); setIsConfirmModalOpen(true); }} style={{ padding: '4px 8px', background: '#FFEBEE', color: '#C62828' }}>-</Button>
                                    </div>
                                </td>
                                <td style={{ padding: '12px', borderBottom: '1px solid #FFFDE7' }}><Button variant="ghost" size="sm" onClick={() => openHistoryModal(s)}>📜 기록</Button></td>
                                <td style={{ padding: '12px', borderBottom: '1px solid #FFFDE7' }}><button onClick={() => { setDeleteTarget(s); setIsDeleteModalOpen(true); }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>🗑️</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* 🔑 접속코드 모달 (격자형 유지) */}
            <AnimatePresence>
                {isCodeModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'white', zIndex: 1000, overflowY: 'auto', padding: '40px' }}>
                        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
                            <h2 style={{ color: '#795548', margin: 0 }}>접속 코드 명찰 🔑</h2>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <Button onClick={() => window.print()} variant="primary" style={{ background: '#4CAF50' }}>🖨️ 인쇄하기</Button>
                                <Button onClick={() => setIsCodeModalOpen(false)} variant="ghost">닫기</Button>
                            </div>
                        </div>
                        <div className="print-area" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
                            {students.map(s => (
                                <div key={s.id} style={{ border: '2px dashed #FFE082', borderRadius: '12px', padding: '20px', textAlign: 'center', background: '#FFFDE7' }}>
                                    <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>{s.name}</div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#FF8F00', fontFamily: 'monospace' }}>{s.student_code}</div>
                                </div>
                            ))}
                        </div>
                        <style>{`@media print { .no-print { display: none !important; } .print-area { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; gap: 10mm; } }`}</style>
                    </div>
                )}
            </AnimatePresence>

            {/* 포인트 확인 모달 */}
            <AnimatePresence>
                {isConfirmModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
                        <Card style={{ width: '90%', maxWidth: '400px', padding: '24px' }}>
                            <h2 style={{ fontSize: '1.2rem', textAlign: 'center', marginBottom: '20px' }}>{confirmData.type === 'give' ? '🎁 포인트 주기' : '🧤 포인트 회수'}</h2>
                            <div style={{ background: '#F8F9FA', padding: '16px', borderRadius: '12px', marginBottom: '20px', textAlign: 'center' }}>
                                <strong>{confirmData.student?.name || `선택 한 ${confirmData.students.length}명`}</strong><br />
                                <span style={{ fontSize: '1.4rem', color: confirmData.type === 'give' ? '#2E7D32' : '#C62828' }}>{confirmData.type === 'give' ? '+' : '-'}{confirmData.amount} P</span>
                            </div>
                            <input type="text" value={confirmData.reason} onChange={(e) => setConfirmData(prev => ({ ...prev, reason: e.target.value }))} placeholder="사유를 적어주세요" autoFocus style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #FFE082', outline: 'none', marginBottom: '20px' }} />
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <Button variant="ghost" style={{ flex: 1 }} onClick={() => setIsConfirmModalOpen(false)}>취소</Button>
                                <Button variant="primary" style={{ flex: 2, background: confirmData.type === 'give' ? '#4CAF50' : '#F44336' }} disabled={!confirmData.reason.trim()} onClick={handleProcessPoints}>확인</Button>
                            </div>
                        </Card>
                    </div>
                )}
            </AnimatePresence>

            {/* 나머지 모달 생략 - 기능은 유지 */}
            {isHistoryModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <Card style={{ width: '90%', maxWidth: '450px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <h2 style={{ fontSize: '1.2rem' }}>📜 {historyStudent?.name}의 기록</h2>
                            <button onClick={() => setIsHistoryModalOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>&times;</button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {loadingHistory ? <div>조회 중...</div> : historyLogs.map(log => (
                                <div key={log.id} style={{ padding: '10px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
                                    <div><div style={{ fontWeight: '500' }}>{log.reason}</div><div style={{ fontSize: '0.75rem', color: '#999' }}>{new Date(log.created_at).toLocaleString()}</div></div>
                                    <div style={{ fontWeight: 'bold', color: log.amount > 0 ? '#4CAF50' : '#F44336' }}>{log.amount > 0 ? `+${log.amount}` : log.amount}</div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            )}
            {isDeleteModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
                    <Card style={{ width: '90%', maxWidth: '400px', padding: '32px', textAlign: 'center' }}>
                        <h2>정말 삭제할까요?</h2>
                        <p>{deleteTarget?.name} 학생의 소중한 명칭과 포인트가 모두 사라집니다.</p>
                        <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                            <Button variant="ghost" style={{ flex: 1 }} onClick={() => setIsDeleteModalOpen(false)}>취소</Button>
                            <Button variant="primary" style={{ flex: 1, background: '#E03131' }} onClick={handleDeleteStudent}>삭제</Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default StudentManager;
