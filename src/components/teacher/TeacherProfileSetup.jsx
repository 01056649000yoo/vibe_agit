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

            // API 키 및 프롬프트 템플릿 저장
            const { error } = await supabase
                .from('profiles')
                .upsert({
                    id: user.id,
                    gemini_api_key: apiKey.trim(),
                    ai_prompt_template: promptTemplate.trim(),
                    role: 'TEACHER'
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '2.5rem', maxWidth: '500px', margin: '0 auto 2.5rem auto' }}>
                <div style={{ textAlign: 'left', background: '#F8F9FA', padding: '24px', borderRadius: '20px', border: '1px solid #E9ECEF' }}>

                    {/* API 키 섹션 */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '0.9rem', color: '#607D8B', fontWeight: 'bold', marginBottom: '8px' }}>
                            Gemini API Key (선택 사항)
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="AI 기능을 위한 키를 입력하세요"
                                style={{
                                    flex: 2,
                                    padding: '12px 16px',
                                    borderRadius: '12px',
                                    border: '1px solid #DEE2E6',
                                    outline: 'none',
                                    fontSize: '0.9rem',
                                    boxSizing: 'border-box'
                                }}
                            />
                            <button
                                onClick={handleTestGeminiKey}
                                disabled={testingKey}
                                style={{
                                    flex: 1,
                                    background: '#E8F5E9',
                                    color: '#2E7D32',
                                    border: '1px solid #C8E6C9',
                                    borderRadius: '12px',
                                    fontSize: '0.8rem',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {testingKey ? '확인 중' : '연결 테스트'}
                            </button>
                        </div>
                    </div>

                    {/* AI 프롬프트 템플릿 섹션 */}
                    <div style={{ marginBottom: '8px' }}>
                        <label style={{ display: 'block', fontSize: '0.9rem', color: '#607D8B', fontWeight: 'bold', marginBottom: '8px' }}>
                            AI 피드백 프롬프트 설정 (선택 사항)
                        </label>
                        <textarea
                            value={promptTemplate}
                            onChange={(e) => setPromptTemplate(e.target.value)}
                            placeholder="선생님만의 피드백 규칙을 정해주세요. (예: 다정한 말투로 칭찬 1개, 보완점 1개 써줘. 글자수는 300자 이내로 작성해줘.)"
                            style={{
                                width: '100%',
                                minHeight: '120px',
                                padding: '14px',
                                borderRadius: '12px',
                                border: '1px solid #DEE2E6',
                                outline: 'none',
                                fontSize: '0.9rem',
                                lineHeight: '1.6',
                                resize: 'none',
                                boxSizing: 'border-box',
                                fontFamily: 'inherit'
                            }}
                        />
                    </div>
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
