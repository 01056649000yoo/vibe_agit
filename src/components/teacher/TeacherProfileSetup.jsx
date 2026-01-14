import React, { useState, useEffect } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';

/**
 * 역할: 로그인 후 역할(선생님) 설정 페이지
 * props:
 *  - email: 사용자 이메일
 *  - onTeacherStart: 선생님으로 시작하기 버튼 클릭 시 실행될 함수
 */
const TeacherProfileSetup = ({ email, onTeacherStart }) => {
    const [apiKey, setApiKey] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchExistingKey();
    }, []);

    const fetchExistingKey = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase
                .from('profiles')
                .select('gemini_api_key')
                .eq('id', user.id)
                .single();
            if (data?.gemini_api_key) setApiKey(data.gemini_api_key);
        }
    };

    const handleSaveAndStart = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('로그인이 필요합니다.');

            // API 키 저장 (프로필 upsert와 통합해도 되지만, 여기서는 명시적으로 저장)
            const { error } = await supabase
                .from('profiles')
                .upsert({
                    id: user.id,
                    gemini_api_key: apiKey.trim(),
                    role: 'TEACHER' // 역할 설정도 함께 보장
                });

            if (error) throw error;

            // App.jsx의 다음 단계 로직 실행
            await onTeacherStart();

            // [추가] 상태 강제 갱신을 위해 페이지 새로고침 (API 키 인식 보장)
            window.location.reload();
        } catch (err) {
            console.error('설정 저장 실패:', err.message);
            alert('설정 저장 중 오류가 발생했습니다: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✨</div>
            <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>반가워요! 처음 만났네요.</h2>
            <p style={{ color: 'var(--primary-color)', fontWeight: '600', marginBottom: '1.5rem' }}>
                {email}
            </p>
            <p style={{ marginBottom: '2.5rem', fontSize: '1.1rem' }}>아지트에서 어떤 보람찬 일을 해볼까요?</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '2.5rem', maxWidth: '400px', margin: '0 auto 2.5rem auto' }}>
                <div style={{ textAlign: 'left', background: '#F8F9FA', padding: '20px', borderRadius: '16px', border: '1px solid #E9ECEF' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#607D8B', fontWeight: 'bold', marginBottom: '8px' }}>
                        Gemini API Key (선택 사항)
                    </label>
                    <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="AI 기능을 위한 키를 입력하세요"
                        style={{
                            width: '100%',
                            padding: '12px 16px',
                            borderRadius: '12px',
                            border: '1px solid #DEE2E6',
                            outline: 'none',
                            fontSize: '0.9rem',
                            boxSizing: 'border-box'
                        }}
                    />
                    <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: '#90A4AE', lineHeight: '1.4' }}>
                        * 나중에 설정 메뉴에서도 등록할 수 있습니다.
                    </p>
                </div>

                <Button onClick={handleSaveAndStart} size="lg" variant="primary" disabled={loading}>
                    {loading ? '준비 중...' : '🎓 멋진 선생님으로 시작하기'}
                </Button>
                <Button variant="secondary" size="lg" disabled>
                    🎒 씩씩한 학생으로 시작하기 (준비 중)
                </Button>
            </div>

            <Button variant="ghost" onClick={() => supabase.auth.signOut()} size="sm">
                혹시 다른 계정으로 로그인할까요? 🚪
            </Button>
        </Card>
    );
};

export default TeacherProfileSetup;
