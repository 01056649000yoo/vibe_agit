import React, { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';

/**
 * 역할: 학생 로그인 (8자리 코드 입력 + Supabase 익명 로그인)
 * 
 * [보안 개편] localStorage 직접 저장 방식에서 Supabase Anonymous Auth로 전환
 * 흐름:
 *  1. 학생이 8자리 코드를 입력
 *  2. supabase.auth.signInAnonymously()로 익명 세션 생성
 *  3. RPC(bind_student_auth)를 통해 학생 레코드에 auth_id 바인딩
 *  4. 세션 기반 자동 로그인 지원
 * 
 * props:
 *  - onLoginSuccess: 로그인 성공 시 실행되는 콜백 (학생 데이터 전달)
 *  - onBack: 랜딩 페이지로 돌아가는 함수
 */
const StudentLogin = ({ onLoginSuccess, onBack }) => {
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const handleLogin = async () => {
        if (code.length < 8) {
            setErrorMsg('로그인 코드 8자리를 정확히 입력해주세요! 🎒');
            return;
        }

        setLoading(true);
        setErrorMsg('');

        try {
            // ── Step 1: 현재 세션 확인 또는 익명 로그인 ──
            let currentSession = null;
            const { data: { session: existingSession } } = await supabase.auth.getSession();

            if (existingSession) {
                // 이미 세션이 있으면 재사용 (이전에 익명 로그인한 적 있는 경우)
                currentSession = existingSession;
            } else {
                // 새로운 익명 세션 생성
                const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
                if (anonError) {
                    console.error('익명 로그인 실패:', anonError);
                    setErrorMsg('로그인 서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
                    setLoading(false);
                    return;
                }
                currentSession = anonData.session;
            }

            if (!currentSession) {
                setErrorMsg('세션 생성에 실패했어요. 페이지를 새로고침 후 다시 시도해주세요.');
                setLoading(false);
                return;
            }

            // ── Step 2: RPC를 통해 학생 코드와 auth_id 바인딩 ──
            const { data: bindResult, error: bindError } = await supabase
                .rpc('bind_student_auth', { p_student_code: code.toUpperCase() });

            if (bindError) {
                console.error('학생 바인딩 실패:', bindError);
                setErrorMsg('서버 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
                setLoading(false);
                return;
            }

            if (!bindResult?.success) {
                setErrorMsg(bindResult?.error || '코드가 일치하는 학생을 찾을 수 없어요. 다시 확인해볼까요? 🔍');
                setLoading(false);
                return;
            }

            // ── Step 3: 세션 데이터 구성 및 콜백 ──
            const studentInfo = bindResult.student;
            const sessionData = {
                id: studentInfo.id,
                name: studentInfo.name,
                code: studentInfo.code,
                classId: studentInfo.classId,
                className: studentInfo.className,
                role: 'STUDENT'
            };

            // localStorage에는 최소 식별 정보만 저장 (세션 복구 힌트용)
            localStorage.setItem('student_session', JSON.stringify(sessionData));

            // 부모 컴포넌트에 학생 데이터 전달
            onLoginSuccess({
                id: studentInfo.id,
                name: studentInfo.name,
                student_code: studentInfo.code,
                class_id: studentInfo.classId,
                classes: { name: studentInfo.className }
            });

        } catch (err) {
            console.error('로그인 처리 중 예외:', err);
            setErrorMsg('알 수 없는 오류가 발생했어요. 페이지를 새로고침 후 다시 시도해주세요.');
        } finally {
            setLoading(false);
        }
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
                onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setErrorMsg(''); // 입력 시 에러 메시지 초기화
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !loading) handleLogin();
                }}
                style={{
                    width: '100%',
                    padding: '20px',
                    borderRadius: '16px',
                    border: errorMsg ? '2px solid #EF5350' : '2px solid #FFE082',
                    fontSize: '1.8rem',
                    textAlign: 'center',
                    fontWeight: '800',
                    letterSpacing: '4px',
                    marginBottom: '8px',
                    outline: 'none',
                    background: '#FFFDE7',
                    color: '#795548',
                    transition: 'border-color 0.2s ease'
                }}
            />

            {/* 에러 메시지 표시 */}
            {errorMsg ? (
                <p style={{
                    color: '#EF5350',
                    fontSize: '0.9rem',
                    marginBottom: '16px',
                    fontWeight: '600',
                    minHeight: '1.4em'
                }}>
                    {errorMsg}
                </p>
            ) : (
                <div style={{ minHeight: '1.4em', marginBottom: '16px' }} />
            )}

            <Button
                variant="secondary"
                size="lg"
                style={{ width: '100%', height: '60px', fontSize: '1.2rem', background: '#FBC02D' }}
                onClick={handleLogin}
                disabled={loading}
            >
                {loading ? '안전하게 로그인 중... 🔐' : '아지트로 들어가기 🎉'}
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
