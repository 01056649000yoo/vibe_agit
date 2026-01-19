import React, { useState, useEffect } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';
import TermsOfService from '../layout/TermsOfService';
import PrivacyPolicy from '../layout/PrivacyPolicy';

/**
 * 역할: 로그인 후 선생님 필수 정보(이름, 학교, 연락처) 설정 페이지 ✨
 * 단계: 1. 약관 동의 -> 2. 정보 입력
 */
const TeacherProfileSetup = ({ email, onTeacherStart }) => {
    const [step, setStep] = useState(1); // 1: 약관동의, 2: 정보입력
    const [loading, setLoading] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    // 약관 동의 상태
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);

    // 선생님 입력 정보
    const [teacherName, setTeacherName] = useState('');
    const [schoolName, setSchoolName] = useState('');
    const [phone, setPhone] = useState('');

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleNextStep = () => {
        if (!agreedToTerms || !agreedToPrivacy) {
            alert('서비스 이용약관 및 개인정보 처리방침에 모두 동의해 주세요. 🙏');
            return;
        }
        setStep(2);
    };

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
                    phone: phone.trim(),
                    email: user.email
                });

            if (teacherInfoError) throw teacherInfoError;

            // 3. 부모 컴포넌트 알림 및 새로고침
            await onTeacherStart();
            window.location.reload();
        } catch (err) {
            console.error('설정 저장 실패:', err.message);
            alert('저장 중 오류가 발생했습니다: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // 공통 카드 스타일
    const cardStyle = {
        textAlign: 'center',
        maxWidth: step === 1 ? '800px' : '500px', // 약관 단계에선 조금 더 넓게
        width: '100%',
        padding: '2rem',
        margin: '0 auto'
    };

    // 스크롤 박스 스타일
    const scrollBoxStyle = {
        height: '200px',
        overflowY: 'auto',
        textAlign: 'left',
        background: '#F8F9FA',
        padding: '16px',
        borderRadius: '12px',
        border: '1px solid #E9ECEF',
        marginBottom: '8px',
        fontSize: '0.9rem'
    };

    return (
        <Card style={cardStyle} animate={true}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✨</div>
            <h2 style={{ fontSize: '1.8rem', marginBottom: '0.5rem', color: '#2C3E50', fontWeight: '900' }}>
                {step === 1 ? '서비스 이용 약관 동의' : '선생님 정보 입력'}
            </h2>
            <p style={{ color: '#7FB3D5', fontWeight: '600', marginBottom: '2rem', fontSize: '1rem' }}>
                {step === 1 ? '안전하고 즐거운 서비스 이용을 위해 약관을 확인해 주세요.' : '아지트 시작을 위한 정보를 입력해 주세요.'}
            </p>

            {step === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', textAlign: 'left' }}>
                    {/* 이용약관 */}
                    <div>
                        <h4 style={{ margin: '0 0 10px 0', color: '#34495E' }}>📜 서비스 이용약관 (필수)</h4>
                        <div style={scrollBoxStyle}>
                            <TermsOfService />
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px', fontSize: '1rem', fontWeight: 'bold', color: '#2C3E50' }}>
                            <input
                                type="checkbox"
                                checked={agreedToTerms}
                                onChange={(e) => setAgreedToTerms(e.target.checked)}
                                style={{ width: '20px', height: '20px' }}
                            />
                            이용약관에 동의합니다.
                        </label>
                    </div>

                    {/* 개인정보 처리방침 */}
                    <div>
                        <h4 style={{ margin: '0 0 10px 0', color: '#34495E' }}>🔒 개인정보 처리방침 (필수)</h4>
                        <div style={scrollBoxStyle}>
                            <PrivacyPolicy />
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px', fontSize: '1rem', fontWeight: 'bold', color: '#2C3E50' }}>
                            <input
                                type="checkbox"
                                checked={agreedToPrivacy}
                                onChange={(e) => setAgreedToPrivacy(e.target.checked)}
                                style={{ width: '20px', height: '20px' }}
                            />
                            개인정보 수집 및 이용에 동의합니다.
                        </label>
                    </div>

                    <div style={{ marginTop: '20px' }}>
                        <Button
                            onClick={handleNextStep}
                            size="lg"
                            variant="primary"
                            disabled={!agreedToTerms || !agreedToPrivacy}
                            style={{ width: '100%', borderRadius: '18px', height: '60px', fontSize: '1.2rem', fontWeight: '900' }}
                        >
                            다음 단계로 ➡️
                        </Button>
                    </div>
                </div>
            )}

            {step === 2 && (
                <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ background: '#FFFDE7', padding: '24px', borderRadius: '24px', border: '1px solid #FFF59D' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* 성명 */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.9rem', color: '#5D4037', fontWeight: 'bold', marginBottom: '8px' }}>
                                    교사 성명 (필수)
                                </label>
                                <input
                                    type="text"
                                    value={teacherName}
                                    onChange={(e) => setTeacherName(e.target.value)}
                                    placeholder="성함을 입력해 주세요"
                                    style={{
                                        width: '100%', padding: '14px', borderRadius: '16px',
                                        border: '2px solid #FFE082', fontSize: '1rem', outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            {/* 소속학교 */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.9rem', color: '#5D4037', fontWeight: 'bold', marginBottom: '8px' }}>
                                    소속 학교명 (필수)
                                </label>
                                <input
                                    type="text"
                                    value={schoolName}
                                    onChange={(e) => setSchoolName(e.target.value)}
                                    placeholder="학교명을 입력해 주세요"
                                    style={{
                                        width: '100%', padding: '14px', borderRadius: '16px',
                                        border: '2px solid #FFE082', fontSize: '1rem', outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            {/* 전화번호 (선택) */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.9rem', color: '#5D4037', fontWeight: 'bold', marginBottom: '8px' }}>
                                    전화번호 (선택)
                                </label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="010-0000-0000"
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
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <Button
                                variant="ghost"
                                onClick={() => setStep(1)}
                                size="sm"
                                style={{ flex: 1, borderRadius: '12px', color: '#999' }}
                            >
                                ⬅️ 이전 단계
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={() => supabase.auth.signOut()}
                                size="sm"
                                style={{ flex: 1, borderRadius: '12px', color: '#999' }}
                            >
                                계정 전환하기 🚪
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
};

export default TeacherProfileSetup;
