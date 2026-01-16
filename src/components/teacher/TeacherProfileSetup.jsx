import React, { useState, useEffect } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';

/**
 * 역할: 로그인 후 선생님 필수 정보(이름, 학교) 설정 페이지 ✨
 * props:
 *  - email: 사용자 이메일
 *  - onTeacherStart: 선생님으로 시작하기 버튼 클릭 시 실행될 함수
 */
const TeacherProfileSetup = ({ email, onTeacherStart }) => {
    const [loading, setLoading] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    // 선생님 필수 정보
    const [teacherName, setTeacherName] = useState('');
    const [schoolName, setSchoolName] = useState('');

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleSaveAndStart = async () => {
        if (!teacherName.trim()) {
            alert('선생님 이름을 입력해 주세요! 😊');
            return;
        }
        if (!schoolName.trim()) {
            alert('소속 학교명을 입력해 주세요! 🏫');
            return;
        }

        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('로그인이 필요합니다.');

            // 1. 프로필 역할 설정
            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    id: user.id,
                    role: 'TEACHER',
                    email: user.email,
                    full_name: teacherName.trim()
                });

            if (profileError) throw profileError;

            // 2. 선생님 상세 정보 저장
            const { error: teacherInfoError } = await supabase
                .from('teachers')
                .upsert({
                    id: user.id,
                    name: teacherName.trim(),
                    school_name: schoolName.trim(),
                    email: user.email
                });

            if (teacherInfoError) throw teacherInfoError;

            // 3. (선택) 첫 학급 자동 생성 (대시보드 즉시 활용을 위해)
            const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            await supabase
                .from('classes')
                .insert({
                    name: '우리 반',
                    invite_code: inviteCode,
                    teacher_id: user.id
                });

            // 4. 부모 컴포넌트 알림 및 새로고침
            await onTeacherStart();
            window.location.reload();
        } catch (err) {
            console.error('설정 저장 실패:', err.message);
            alert('저장 중 오류가 발생했습니다: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card style={{ textAlign: 'center', maxWidth: '500px', padding: '2rem' }} animate={true}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✨</div>
            <h2 style={{ fontSize: '1.8rem', marginBottom: '0.5rem', color: '#2C3E50', fontWeight: '900' }}>반갑습니다, 선생님!</h2>
            <p style={{ color: '#7FB3D5', fontWeight: '600', marginBottom: '2rem', fontSize: '1rem' }}>
                아지트에서 사용할 선생님의 정보를 알려주세요.
            </p>

            <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ background: '#FFFDE7', padding: '24px', borderRadius: '24px', border: '1px solid #FFF59D' }}>
                    <h3 style={{ fontSize: '1rem', color: '#F57F17', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        👤 기본 정보 설정
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.9rem', color: '#5D4037', fontWeight: 'bold', marginBottom: '8px' }}>
                                선생님 이름 (필수)
                            </label>
                            <input
                                type="text"
                                value={teacherName}
                                onChange={(e) => setTeacherName(e.target.value)}
                                placeholder="실명 또는 별칭을 입력해 주세요"
                                style={{
                                    width: '100%', padding: '14px', borderRadius: '16px',
                                    border: '2px solid #FFE082', fontSize: '1rem', outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.9rem', color: '#5D4037', fontWeight: 'bold', marginBottom: '8px' }}>
                                소속 학교명 (필수)
                            </label>
                            <input
                                type="text"
                                value={schoolName}
                                onChange={(e) => setSchoolName(e.target.value)}
                                placeholder="예: 서울미래초등학교"
                                style={{
                                    width: '100%', padding: '14px', borderRadius: '16px',
                                    border: '2px solid #FFE082', fontSize: '1rem', outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                    <Button
                        onClick={handleSaveAndStart}
                        size="lg"
                        variant="primary"
                        loading={loading}
                        style={{ width: '100%', borderRadius: '18px', height: '60px', fontSize: '1.2rem', fontWeight: '900' }}
                    >
                        🚀 아지트 시작하기
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => supabase.auth.signOut()}
                        size="sm"
                        style={{ borderRadius: '12px', color: '#999' }}
                    >
                        계정 전환하기 🚪
                    </Button>
                </div>
            </div>
        </Card>
    );
};

export default TeacherProfileSetup;
