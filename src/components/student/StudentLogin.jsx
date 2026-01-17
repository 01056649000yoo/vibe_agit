import React, { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';

/**
 * 역할: 학생 로그인 (8자리 코드 입력)
 * props:
 *  - onLoginSuccess: 로그인 성공 시 실행되는 콜백 (학생 데이터 전달)
 *  - onBack: 랜딩 페이지로 돌아가는 함수
 */
const StudentLogin = ({ onLoginSuccess, onBack }) => {
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (code.length < 8) {
            alert('로그인 코드 8자리를 정확히 입력해주세요! 🎒');
            return;
        }

        setLoading(true);
        const { data, error } = await supabase
            .from('students')
            .select('*, classes(name)')
            .eq('student_code', code.toUpperCase())
            .maybeSingle();

        if (error || !data) {
            alert('코드가 일치하는 학생을 찾을 수 없어요. 다시 확인해볼까요? 🔍');
        } else {
            // 로컬 스토리지에 학생 정보 저장
            localStorage.setItem('student_session', JSON.stringify({
                id: data.id,
                name: data.name,
                code: data.student_code,
                classId: data.class_id,
                className: data.classes?.name,
                role: 'STUDENT'
            }));
            onLoginSuccess(data);
        }
        setLoading(false);
    };

    return (
        <Card style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '16px' }}>🎒</div>
            <h2 style={{ fontSize: '2rem', marginBottom: '8px', color: 'var(--text-primary)' }}>
                학생 로그인을 도와줄게요!
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
                선생님께 받은 8자리 코드를<br />아래 칸에 입력하고 입장해주세요! ✨
            </p>

            <input
                type="text"
                placeholder="ABC123XY"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                style={{
                    width: '100%',
                    padding: '20px',
                    borderRadius: '16px',
                    border: '2px solid #FFE082',
                    fontSize: '1.8rem',
                    textAlign: 'center',
                    fontWeight: '800',
                    letterSpacing: '4px',
                    marginBottom: '24px',
                    outline: 'none',
                    background: '#FFFDE7',
                    color: '#795548'
                }}
            />

            <Button
                variant="secondary"
                size="lg"
                style={{ width: '100%', height: '60px', fontSize: '1.2rem', background: '#FBC02D' }}
                onClick={handleLogin}
                disabled={loading}
            >
                {loading ? '확인 중...' : '아지트로 들어가기 🎉'}
            </Button>

            <Button
                variant="ghost"
                size="sm"
                style={{ marginTop: '24px' }}
                onClick={onBack}
            >
                뒤로 가기
            </Button>
        </Card>
    );
};

export default StudentLogin;
