import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 역할: 선생님 - 학급 내 학생 명단 관리 및 개별 코드 발급, 포인트 지급 기능
 * props:
 *  - classId: 현재 학급 ID
 */
const StudentManager = ({ classId }) => {
    const [studentName, setStudentName] = useState('');
    const [students, setStudents] = useState([]);
    const [isAdding, setIsAdding] = useState(false);
    const [updatingId, setUpdatingId] = useState(null);

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
                total_points: 0 // 초기 포인트 0 설정
            });

        if (error) {
            alert('학생 등록 중 문제가 생겼어요: ' + error.message);
        } else {
            setStudentName('');
            fetchStudents();
        }
        setIsAdding(false);
    };

    // 포인트 지급 로직 (낙관적 업데이트 적용)
    const handleGivePoints = async (student, amount) => {
        // 1. 낙관적 업데이트: 서버 응답을 기다리지 않고 로컬 상태를 즉시 변경
        const previousStudents = [...students];
        const newTotal = (student.total_points || 0) + amount;

        setStudents(prev => prev.map(s =>
            s.id === student.id ? { ...s, total_points: newTotal } : s
        ));

        setUpdatingId(student.id);

        try {
            // 2. 서버 업데이트 시도
            const { error: updateError } = await supabase
                .from('students')
                .update({ total_points: newTotal })
                .eq('id', student.id);

            if (updateError) throw updateError;

            // 3. 포인트 로그 저장 (선택 사항)
            const { error: logError } = await supabase
                .from('point_logs')
                .insert({
                    student_id: student.id,
                    amount: amount,
                    reason: '선생님 칭찬 포인트'
                });

            if (logError) console.warn('포인트 로그 저장 실패:', logError.message);

            // 최종 성공 후 추가 데이터 동기화가 필요하다면 여기서 fetch 가능
            // (이미 낙관적으로 업데이트했으므로 생략 가능하나 필요시 추가)
        } catch (error) {
            // 4. 실패 시 원래 상태로 롤백
            setStudents(previousStudents);
            alert('포인트 지급 중 오류가 발생했습니다: ' + error.message);
        } finally {
            setUpdatingId(null);
        }
    };

    return (
        <div style={{ marginTop: '24px', textAlign: 'left' }}>
            <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🎒</span> 우리 반 학생 명단
            </h3>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                <input
                    type="text"
                    placeholder="이름을 적어주세요"
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

            <div style={{
                background: 'white',
                borderRadius: '16px',
                overflow: 'hidden',
                border: '1px solid #FFE082',
                boxShadow: '0 4px 12px rgba(255, 224, 130, 0.15)'
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
                    <thead>
                        <tr style={{ background: '#FFF9C4', color: '#795548', fontSize: '0.9rem', fontWeight: 'bold' }}>
                            <th style={{ padding: '14px' }}>번호</th>
                            <th style={{ padding: '14px' }}>이름</th>
                            <th style={{ padding: '14px' }}>로그인 코드</th>
                            <th style={{ padding: '14px' }}>현재 포인트</th>
                            <th style={{ padding: '14px' }}>포인트 주기</th>
                        </tr>
                    </thead>
                    <tbody>
                        {students.map((s, index) => (
                            <tr key={s.id} style={{ borderTop: '1px solid #FFFDE7', transition: 'background 0.2s' }}>
                                <td style={{ padding: '12px', color: '#999' }}>{index + 1}</td>
                                <td style={{ padding: '12px', fontWeight: '600', color: '#555' }}>{s.name}</td>
                                <td style={{ padding: '12px' }}>
                                    <span style={{
                                        background: '#FDFCF0',
                                        padding: '6px 10px',
                                        borderRadius: '8px',
                                        letterSpacing: '1px',
                                        color: '#D4A017',
                                        fontWeight: '800',
                                        border: '1px dashed #FFE082',
                                        fontFamily: 'monospace',
                                        fontSize: '0.9rem'
                                    }}>
                                        {s.student_code}
                                    </span>
                                </td>
                                <td style={{ padding: '12px' }}>
                                    <motion.span
                                        key={s.total_points}
                                        initial={{ y: 0 }}
                                        animate={{ y: [0, -10, 0], scale: [1, 1.2, 1] }}
                                        transition={{ duration: 0.3 }}
                                        style={{ fontWeight: 'bold', color: 'var(--primary-color)', display: 'inline-block' }}
                                    >
                                        ✨ {s.total_points || 0}
                                    </motion.span>
                                </td>
                                <td style={{ padding: '12px' }}>
                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            style={{ minWidth: '50px', padding: '4px 8px', fontSize: '0.8rem', background: '#FFF9C4', color: '#795548' }}
                                            onClick={() => handleGivePoints(s, 10)}
                                            disabled={updatingId === s.id}
                                        >
                                            +10
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            style={{ minWidth: '50px', padding: '4px 8px', fontSize: '0.8rem', background: '#FFECB3', color: '#795548' }}
                                            onClick={() => handleGivePoints(s, 50)}
                                            disabled={updatingId === s.id}
                                        >
                                            +50
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {students.length === 0 && (
                            <tr>
                                <td colSpan="5" style={{ padding: '40px', color: '#94a3b8', fontSize: '0.9rem' }}>
                                    아직 등록된 학생이 없어요.<br />친구의 이름을 한 명씩 추가해주세요! 🎒
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <p style={{ marginTop: '12px', fontSize: '0.85rem', color: '#999', textAlign: 'center' }}>
                💡 칭찬 포인트로 학생들의 의욕을 북돋아주세요! 🌟
            </p>
        </div>
    );
};

export default StudentManager;
