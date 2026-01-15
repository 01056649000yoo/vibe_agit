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
    const [promptTemplate, setPromptTemplate] = useState('');
    const [loading, setLoading] = useState(false);
    const [testingKey, setTestingKey] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    // 새로운 설정 상태
    const [className, setClassName] = useState('우리 반 아지트');
    const [charStandard, setCharStandard] = useState(700);
    const [levelUpPoints, setLevelUpPoints] = useState(100);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        fetchExistingKey();
    }, []);

    const fetchExistingKey = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase
                .from('profiles')
                .select('gemini_api_key, ai_prompt_template')
                .eq('id', user.id)
                .single();
            if (data?.gemini_api_key) setApiKey(data.gemini_api_key);
            if (data?.ai_prompt_template) setPromptTemplate(data.ai_prompt_template);
        }
    };

    // [추가] API 연결 테스트 함수
    const handleTestGeminiKey = async () => {
        if (!apiKey.trim()) {
            alert('테스트할 API 키를 먼저 입력해주세요! 🔑');
            return;
        }
        setTestingKey(true);
        try {
            const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";
            const response = await fetch(`${baseUrl}?key=${apiKey.trim()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: "정상 연결 여부 확인을 위해 '연결 성공'이라고 짧게 대답해줘."
                        }]
                    }]
                })
            });

            if (response.ok) {
                const data = await response.json();
                const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '응답 없음';
                alert(`✅ 연결 성공!\nAI 응답: ${aiResponse}`);
            } else {
                const errorData = await response.json();
                const status = response.status;
                const msg = errorData?.error?.message || '알 수 없는 오류';
                throw new Error(`[Status ${status}] ${msg}`);
            }
        } catch (err) {
            console.error('API 테스트 실패:', err.message);
            alert(`❌ 연결 실패: ${err.message}\n\n키가 올바른지, 혹은 모델(gemini-3-flash-preview) 권한이 있는지 확인해 주세요.`);
        } finally {
            setTestingKey(false);
        }
    };

    const handleSaveAndStart = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('로그인이 필요합니다.');

            // 1. 프로필 정보 업데이트 (API 키, 프롬프트 등)
            // Note: DB에 char_standard, level_up_bonus 컬럼이 없을 수 있으므로 안전하게 처리
            const profileData = {
                id: user.id,
                gemini_api_key: apiKey.trim(),
                ai_prompt_template: promptTemplate.trim(),
                role: 'TEACHER'
            };

            const { error: profileError } = await supabase
                .from('profiles')
                .upsert(profileData);

            if (profileError) throw profileError;

            // 2. 초기 학급 생성 (이름이 입력된 경우)
            if (className.trim()) {
                const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
                const { error: classError } = await supabase
                    .from('classes')
                    .insert({
                        name: className.trim(),
                        invite_code: inviteCode,
                        teacher_id: user.id
                    });

                if (classError) console.error('학급 생성 실패(선택 사항):', classError.message);
            }

            // 3. 부모 컴포넌트 콜백 실행 및 새로고침
            await onTeacherStart();
            window.location.reload();
        } catch (err) {
            console.error('설정 저장 실패:', err.message);
            alert('설정 저장 중 오류가 발생했습니다: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card style={{ textAlign: 'center', maxWidth: '850px', padding: '1.25rem' }} animate={true}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✨</div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>선생님 공간에 오신 것을 환영합니다!</h2>
            <p style={{ color: 'var(--primary-color)', fontWeight: '600', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
                {email} 선생님, 아지트 설정을 마무리해볼까요?
            </p>

            <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 2단 그리드 레이아웃 */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>

                    {/* 왼쪽 칼럼: 기본 설정 */}
                    <div style={{ background: '#F0F7FF', padding: '16px', borderRadius: '16px', border: '1px solid #E3F2FD' }}>
                        <h3 style={{ fontSize: '0.95rem', color: '#1565C0', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>⚙️</span> 기본 설정
                        </h3>

                        {/* API 키 */}
                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#546E7A', fontWeight: 'bold', marginBottom: '4px' }}>
                                Gemini API Key
                            </label>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder="API 키 입력"
                                    style={{
                                        flex: 1, padding: '8px 12px', borderRadius: '10px',
                                        border: '1px solid #CFD8DC', fontSize: '0.85rem', outline: 'none'
                                    }}
                                />
                                <button
                                    onClick={handleTestGeminiKey}
                                    disabled={testingKey}
                                    style={{
                                        padding: '0 10px', background: 'white', color: '#1565C0',
                                        border: '1px solid #BBDEFB', borderRadius: '10px',
                                        fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer'
                                    }}
                                >
                                    {testingKey ? '...' : '테스트'}
                                </button>
                            </div>
                        </div>

                        {/* 학급 이름 */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#546E7A', fontWeight: 'bold', marginBottom: '4px' }}>
                                첫 학급 이름
                            </label>
                            <input
                                type="text"
                                value={className}
                                onChange={(e) => setClassName(e.target.value)}
                                placeholder="예: 3학년 1반, 무지개반"
                                style={{
                                    width: '100%', padding: '8px 12px', borderRadius: '10px',
                                    border: '1px solid #CFD8DC', fontSize: '0.85rem', outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>
                    </div>

                    {/* 오른쪽 칼럼: 글쓰기 보상 규칙 */}
                    <div style={{ background: '#FFF9F0', padding: '16px', borderRadius: '16px', border: '1px solid #FFF3E0' }}>
                        <h3 style={{ fontSize: '0.95rem', color: '#EF6C00', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>🏆</span> 글쓰기 보상 규칙
                        </h3>

                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#795548', fontWeight: 'bold', marginBottom: '4px' }}>
                                기준 글자 수 (포인트 지급 기준)
                            </label>
                            <input
                                type="number"
                                value={charStandard}
                                onChange={(e) => setCharStandard(Number(e.target.value))}
                                style={{
                                    width: '100%', padding: '8px 12px', borderRadius: '10px',
                                    border: '1px solid #FFE0B2', fontSize: '0.85rem', outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#795548', fontWeight: 'bold', marginBottom: '4px' }}>
                                미션 완료 보너스 포인트
                            </label>
                            <input
                                type="number"
                                value={levelUpPoints}
                                onChange={(e) => setLevelUpPoints(Number(e.target.value))}
                                style={{
                                    width: '100%', padding: '8px 12px', borderRadius: '10px',
                                    border: '1px solid #FFE0B2', fontSize: '0.85rem', outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* 하단: AI 피드백 프롬프트 (가로로 길게 배치) */}
                <div style={{ background: '#F8F9FA', padding: '16px', borderRadius: '16px', border: '1px solid #ECEFF1' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#455A64', fontWeight: 'bold', marginBottom: '4px' }}>
                        🤖 AI 피드백 프롬프트 설정 (선택 사항)
                    </label>
                    <textarea
                        value={promptTemplate}
                        onChange={(e) => setPromptTemplate(e.target.value)}
                        placeholder="다정한 말투로 칭찬 1개, 보완점 1개 써줘. (글자수 300자 이내)"
                        style={{
                            width: '100%', height: '60px', padding: '10px',
                            borderRadius: '10px', border: '1px solid #CFD8DC',
                            fontSize: '0.8rem', lineHeight: '1.4', resize: 'none',
                            boxSizing: 'border-box', fontFamily: 'inherit',
                            overflowY: 'auto'
                        }}
                    />
                    <p style={{ marginTop: '4px', fontSize: '0.7rem', color: '#90A4AE' }}>
                        * 이 프롬프트는 학생들이 글을 제출했을 때 AI가 참고하는 맞춤 가이드가 됩니다.
                    </p>
                </div>

                {/* 작업 버튼 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    <Button onClick={handleSaveAndStart} size="md" variant="primary" loading={loading} style={{ width: '100%', borderRadius: '12px' }}>
                        🎓 멋진 선생님으로 시작하기
                    </Button>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button variant="secondary" size="sm" disabled style={{ flex: 1, borderRadius: '10px', opacity: 0.6 }}>
                            🎒 학생 모드 (준비 중)
                        </Button>
                        <Button variant="ghost" onClick={() => supabase.auth.signOut()} size="sm" style={{ flex: 1, borderRadius: '10px' }}>
                            계정 전환 🚪
                        </Button>
                    </div>
                </div>
            </div>
        </Card>
    );
};

export default TeacherProfileSetup;
