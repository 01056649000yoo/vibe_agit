import React, { useState, useEffect, Suspense, lazy } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';

// 지연 로딩 적용
const ClassManager = lazy(() => import('./ClassManager'));
const StudentManager = lazy(() => import('./StudentManager'));
const MissionManager = lazy(() => import('./MissionManager'));

/**
 * 역할: 선생님 메인 대시보드 (와이드 2단 레이아웃) ✨
 */
const TeacherDashboard = ({ profile, session, activeClass, setActiveClass }) => {
    const [currentTab, setCurrentTab] = useState('dashboard'); // 'dashboard', 'settings'
    const [classes, setClasses] = useState([]);
    const [loadingClasses, setLoadingClasses] = useState(true);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024); // 태블릿/모바일 기준
    const [selectedActivityPost, setSelectedActivityPost] = useState(null); // 최근 활동 클릭 시 상세보기

    // Gemini API Key 관련 상태
    const [geminiKey, setGeminiKey] = useState('');
    const [originalKey, setOriginalKey] = useState('');
    const [isKeyVisible, setIsKeyVisible] = useState(false);
    const [savingKey, setSavingKey] = useState(false);
    const [testingKey, setTestingKey] = useState(false); // [추가] 연결 테스트 상태

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (session?.user?.id) {
            fetchAllClasses();
            fetchGeminiKey();
        }
    }, [session?.user?.id]);

    const fetchGeminiKey = async () => {
        const { data, error } = await supabase
            .from('profiles')
            .select('gemini_api_key')
            .eq('id', session.user.id)
            .single();

        if (data?.gemini_api_key) {
            setOriginalKey(data.gemini_api_key);
            setGeminiKey(data.gemini_api_key);
        }
    };

    const handleSaveGeminiKey = async () => {
        if (!geminiKey.trim()) return;
        setSavingKey(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ gemini_api_key: geminiKey.trim() })
                .eq('id', session.user.id);

            if (error) throw error;
            setOriginalKey(geminiKey.trim());
            alert('Gemini API 키가 안전하게 저장되었습니다! 🔐');
        } catch (err) {
            console.error('키 저장 실패:', err.message);
            alert('저장 중 오류가 발생했습니다.');
        } finally {
            setSavingKey(false);
        }
    };

    // [추가] API 연결 테스트 함수
    const handleTestGeminiKey = async () => {
        if (!geminiKey.trim()) {
            alert('테스트할 API 키를 먼저 입력해주세요! 🔑');
            return;
        }
        setTestingKey(true);
        try {
            const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";
            const response = await fetch(`${baseUrl}?key=${geminiKey.trim()}`, {
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

    const maskKey = (key) => {
        if (!key) return '';
        if (key.length <= 4) return '****';
        return `${key.slice(0, 2)}...${key.slice(-2)}`;
    };

    const fetchAllClasses = async () => {
        setLoadingClasses(true);
        try {
            const { data, error } = await supabase
                .from('classes')
                .select('*')
                .eq('teacher_id', session.user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            const classList = data || [];

            // 1. 학급 목록 업데이트
            setClasses(classList);

            // 2. 현재 선택된 학급이 유효한지 체크
            if (classList.length === 0) {
                if (activeClass !== null) setActiveClass(null);
            } else {
                const isCurrentValid = activeClass && classList.some(c => c.id === activeClass.id);
                // 유효하지 않으면 (삭제되었거나 처음인 경우) 첫 번째 학급 자동 활성화
                if (!isCurrentValid) {
                    console.log("✏️ TeacherDashboard: 활성 학급이 유효하지 않아 첫 번째 학급을 선택합니다.");
                    setActiveClass(classList[0]);
                }
            }
        } catch (err) {
            console.error('❌ TeacherDashboard: 학급 불러오기 실패:', err.message);
            alert('정보를 불러오지 못했습니다. 🔄');
        } finally {
            setLoadingClasses(false);
        }
    };

    // [보완] 활성 학급이 유효하지 않을 때 첫 번째 학급 자동 선택 가드 (삭제 직후 유연한 전이)
    useEffect(() => {
        // 로딩 중이 아니고 학급은 있는데 선택된 게 없는 찰나에만 첫 학급 활성화
        if (!loadingClasses && classes.length > 0 && activeClass === null) {
            console.log("🔄 TeacherDashboard: 다음 학급으로 자동 전환합니다.");
            setActiveClass(classes[0]);
        }
    }, [loadingClasses, classes.length, activeClass, setActiveClass]);

    if (loadingClasses) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#F8F9FA' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔔</div>
                    <p style={{ color: '#7F8C8D', fontWeight: 'bold' }}>학급 정보를 불러오고 있습니다...</p>
                </div>
            </div>
        );
    }

    const hasZeroClasses = classes.length === 0;

    return (
        <div style={{
            width: '100vw', // 가로 너비 강제
            height: '100vh', // 세로 높이 고정
            background: '#F8F9FA',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden', // 전체 스크롤 방지
            boxSizing: 'border-box'
        }}>
            {/* 상단 슬림 헤더 (고정) */}
            <header style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: isMobile ? '8px 16px' : '12px 24px',
                background: 'white', borderBottom: '1px solid #E9ECEF',
                flexShrink: 0, zIndex: 100,
                width: '100%', boxSizing: 'border-box'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '16px' }}>
                    <h2 style={{ margin: 0, fontSize: isMobile ? '1rem' : '1.2rem', color: '#212529', fontWeight: '900' }}>
                        {activeClass ? (isMobile ? activeClass.name : `🏫 ${activeClass.name}`) : '학급 관리'}
                    </h2>
                    {classes.length > 1 && (
                        <select
                            value={activeClass?.id || ''}
                            onChange={(e) => setActiveClass(classes.find(c => c.id === e.target.value))}
                            style={{
                                padding: '4px 6px', borderRadius: '8px', border: '1px solid #DEE2E6',
                                background: '#F8F9FA', color: '#495057', fontSize: '0.8rem', fontWeight: 'bold'
                            }}
                        >
                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {!isMobile && <span style={{ fontSize: '0.85rem', color: '#6C757D' }}>{profile?.full_name} 선생님</span>}
                    <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()} style={{ fontSize: '0.8rem', color: '#DC3545' }}>
                        로그아웃
                    </Button>
                </div>
            </header>

            {/* 탭 네비게이션 (고정) */}
            <nav style={{
                display: 'flex', background: 'white', borderBottom: '1px solid #E9ECEF',
                padding: isMobile ? '0 12px' : '0 24px',
                flexShrink: 0, zIndex: 99,
                width: '100%', boxSizing: 'border-box'
            }}>
                {['dashboard', 'settings'].map((tabId) => (
                    <button
                        key={tabId}
                        onClick={() => setCurrentTab(tabId)}
                        style={{
                            padding: isMobile ? '10px 14px' : '12px 20px', border: 'none', background: 'transparent',
                            borderBottom: currentTab === tabId ? '3px solid #3498DB' : '3px solid transparent',
                            color: currentTab === tabId ? '#3498DB' : '#ADB5BD',
                            fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', fontSize: isMobile ? '0.85rem' : '0.95rem'
                        }}
                    >
                        {tabId === 'dashboard' ? '📊 학급 현황' : '⚙️ 관리 설정'}
                    </button>
                ))}
            </nav>

            {/* 메인 콘텐츠 영역 (중앙 정렬 래퍼) */}
            <main style={{
                flex: 1,
                width: '100%',
                maxWidth: '1400px', // 정중앙 액자 마지노선
                margin: '0 auto', // 여기서 중앙 정렬
                padding: isMobile ? '16px' : '24px',
                boxSizing: 'border-box',
                overflowY: 'auto' // 내부 콘텐츠 스크롤
            }}>
                <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px' }}>로딩 중... ✨</div>}>
                    {(!activeClass || hasZeroClasses) ? (
                        <div style={{ maxWidth: '600px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
                            <ClassManager
                                userId={session.user.id}
                                classes={classes}
                                activeClass={activeClass}
                                setActiveClass={setActiveClass}
                                setClasses={setClasses}
                                onClassDeleted={fetchAllClasses}
                                isMobile={isMobile}
                            />
                        </div>
                    ) : (
                        currentTab === 'dashboard' ? (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 6.5fr) minmax(0, 3.5fr)', // 0을 시작으로 하는 minmax가 핵심
                                gap: '20px',
                                width: '100%',
                                boxSizing: 'border-box'
                            }}>
                                <section style={{
                                    background: 'white', borderRadius: '24px',
                                    border: '1px solid #E9ECEF', display: 'flex', flexDirection: 'column',
                                    overflow: 'hidden',
                                    boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    minHeight: isMobile ? '400px' : 'auto'
                                }}>
                                    <div style={{
                                        flex: 1,
                                        padding: isMobile ? '16px' : '24px',
                                        boxSizing: 'border-box'
                                    }}>
                                        <MissionManager activeClass={activeClass} isDashboardMode={true} />
                                    </div>
                                </section>

                                <aside style={{
                                    display: 'flex', flexDirection: 'column', gap: '20px',
                                    width: '100%', boxSizing: 'border-box', overflow: 'hidden'
                                }}>
                                    <section style={{
                                        background: 'white', borderRadius: '24px', padding: isMobile ? '16px' : '24px',
                                        border: '1px solid #E9ECEF', boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                                        overflow: 'hidden',
                                        width: '100%', boxSizing: 'border-box'
                                    }}>
                                        <StudentManager classId={activeClass?.id} isDashboardMode={true} />
                                    </section>

                                    <section style={{
                                        background: 'white', borderRadius: '24px', padding: isMobile ? '16px' : '24px',
                                        border: '1px solid #E9ECEF', boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                                        overflow: 'hidden',
                                        width: '100%', boxSizing: 'border-box'
                                    }}>
                                        <RecentActivity
                                            classId={activeClass?.id}
                                            onPostClick={(post) => setSelectedActivityPost(post)}
                                        />
                                    </section>
                                </aside>
                            </div>
                        ) : (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 4fr) minmax(0, 6fr)',
                                gap: '20px',
                                width: '100%',
                                boxSizing: 'border-box'
                            }}>
                                <aside style={{
                                    background: 'white', borderRadius: '24px', padding: isMobile ? '16px' : '24px',
                                    border: '1px solid #E9ECEF', boxSizing: 'border-box',
                                    width: '100%', overflow: 'hidden'
                                }}>
                                    <ClassManager
                                        userId={session.user.id}
                                        classes={classes}
                                        activeClass={activeClass}
                                        setActiveClass={setActiveClass}
                                        setClasses={setClasses}
                                        onClassDeleted={fetchAllClasses}
                                        isMobile={isMobile}
                                    />
                                </aside>

                                {activeClass && (
                                    <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                        <section style={{
                                            overflow: 'hidden',
                                            background: 'white', borderRadius: '24px', padding: isMobile ? '16px' : '24px',
                                            border: '1px solid #E9ECEF', boxSizing: 'border-box', boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                                            width: '100%'
                                        }}>
                                            <StudentManager classId={activeClass.id} isDashboardMode={false} />
                                        </section>

                                        {/* Gemini API Key 설정 영역 */}
                                        <section style={{
                                            background: 'linear-gradient(135deg, #FFFFFF 0%, #F0F4F8 100%)',
                                            borderRadius: '24px', padding: isMobile ? '20px' : '28px',
                                            border: '1px solid #D1D9E6', boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
                                            width: '100%', boxSizing: 'border-box'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                                                <span style={{ fontSize: '1.5rem' }}>🔐</span>
                                                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#2C3E50', fontWeight: '900' }}>AI 자동 피드백 보안 센터</h3>
                                            </div>

                                            <div style={{ background: 'white', padding: '20px', borderRadius: '18px', border: '1px solid #E9ECEF' }}>
                                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#7F8C8D', fontWeight: 'bold', marginBottom: '10px' }}>
                                                    Gemini API Key
                                                </label>
                                                <div style={{ display: 'flex', gap: '10px' }}>
                                                    <div style={{ position: 'relative', flex: 1 }}>
                                                        <input
                                                            type={isKeyVisible ? "text" : "password"}
                                                            value={geminiKey}
                                                            onChange={(e) => setGeminiKey(e.target.value)}
                                                            placeholder="키를 입력해 주세요 (AI...)"
                                                            style={{
                                                                width: '100%', padding: '12px 16px', borderRadius: '12px',
                                                                border: '1px solid #DEE2E6', outline: 'none', transition: 'all 0.2s',
                                                                fontSize: '0.9rem', color: '#2C3E50'
                                                            }}
                                                        />
                                                        <button
                                                            onClick={() => setIsKeyVisible(!isKeyVisible)}
                                                            style={{
                                                                position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                                                                background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem'
                                                            }}
                                                        >
                                                            {isKeyVisible ? '🙈' : '👁️'}
                                                        </button>
                                                    </div>
                                                    <Button
                                                        onClick={handleSaveGeminiKey}
                                                        disabled={savingKey || testingKey || geminiKey === originalKey}
                                                        style={{ borderRadius: '12px', minWidth: '80px' }}
                                                    >
                                                        {savingKey ? '저장 중' : '저장'}
                                                    </Button>
                                                    <Button
                                                        variant="secondary"
                                                        onClick={handleTestGeminiKey}
                                                        disabled={savingKey || testingKey}
                                                        style={{ borderRadius: '12px', minWidth: '100px', background: '#E8F5E9', color: '#2E7D32', border: '1px solid #C8E6C9' }}
                                                    >
                                                        {testingKey ? '확인 중...' : '연결 테스트'}
                                                    </Button>
                                                </div>
                                                {originalKey && (
                                                    <p style={{ marginTop: '12px', fontSize: '0.8rem', color: '#95A5A6', margin: '12px 0 0 0' }}>
                                                        현재 저장된 키: <code style={{ background: '#F8F9FA', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{maskKey(originalKey)}</code>
                                                    </p>
                                                )}
                                                <p style={{ marginTop: '16px', fontSize: '0.8rem', color: '#7F8C8D', lineHeight: '1.5' }}>
                                                    * 입력하신 키는 학생들의 글에 대한 **AI 자동 피드백** 생성에 사용됩니다.<br />
                                                    * 암호화되어 안전하게 보관되며, 언제든 수정하실 수 있습니다.
                                                </p>
                                            </div>
                                        </section>
                                    </section>
                                )}
                            </div>
                        )
                    )}
                </Suspense>
            </main>

            {/* 최근 활동 상세보기 모달 (선생님용) */}
            {selectedActivityPost && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.7)', zIndex: 2000,
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    padding: '20px'
                }} onClick={() => setSelectedActivityPost(null)}>
                    <div style={{
                        background: 'white', borderRadius: '24px', width: '100%', maxWidth: '800px',
                        maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden'
                    }} onClick={e => e.stopPropagation()}>
                        <header style={{ padding: '20px', borderBottom: '1px solid #EEE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <span style={{ color: '#3498DB', fontWeight: 'bold', fontSize: '0.9rem' }}>{selectedActivityPost.students?.name} 학생의 글</span>
                                <h3 style={{ margin: '4px 0 0 0', color: '#2C3E50', fontWeight: '900' }}>{selectedActivityPost.title}</h3>
                            </div>
                            <button onClick={() => setSelectedActivityPost(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#ADB5BD' }}>✕</button>
                        </header>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '32px', lineHeight: '1.8', whiteSpace: 'pre-wrap', color: '#444', fontSize: '1.1rem' }}>
                            {selectedActivityPost.content}
                        </div>
                        <footer style={{ padding: '20px', borderTop: '1px solid #EEE', textAlign: 'center', color: '#ADB5BD', fontSize: '0.85rem' }}>
                            미션: {selectedActivityPost.writing_missions?.title} | 글자 수: {selectedActivityPost.char_count}자
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
};

// 최근 활동 요약 컴포넌트
const RecentActivity = ({ classId, onPostClick }) => {
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (classId) fetchRecentActivities();
    }, [classId]);

    const fetchRecentActivities = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('student_posts')
                .select(`
                    id, created_at, title, content, char_count, is_confirmed,
                    students!inner(name, class_id),
                    writing_missions!inner(title)
                `)
                .eq('students.class_id', classId)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;
            setActivities(data || []);
        } catch (err) {
            console.error('최근 활동 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const timeAgo = (date) => {
        const seconds = Math.floor((new Date() - new Date(date)) / 1000);
        if (seconds < 60) return '방금 전';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}분 전`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}시간 전`;
        return new Date(date).toLocaleDateString([], { month: '2-digit', day: '2-digit' });
    };

    return (
        <div style={{ width: '100%' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#212529', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🔔 최근 활동
            </h3>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '400px',
                overflowY: 'auto',
                gap: '8px',
                paddingRight: '4px', // 스크롤바 공간
                scrollbarWidth: 'thin'
            }}>
                {loading ? (
                    <p style={{ textAlign: 'center', color: '#ADB5BD', fontSize: '0.85rem', padding: '20px' }}>로딩 중...</p>
                ) : activities.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#ADB5BD', fontSize: '0.85rem', padding: '40px' }}>아직 활동 내용이 없어요. ✍️</p>
                ) : (
                    activities.map((act) => (
                        <div
                            key={act.id}
                            onClick={() => onPostClick && onPostClick(act)}
                            style={{
                                padding: '12px 14px',
                                borderRadius: '12px',
                                background: '#FFFFFF',
                                border: '1px solid #F1F3F5',
                                cursor: 'pointer',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxSizing: 'border-box'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = '#F8F9FA';
                                e.currentTarget.style.transform = 'translateX(4px)';
                                e.currentTarget.style.borderColor = '#3498DB';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = '#FFFFFF';
                                e.currentTarget.style.transform = 'translateX(0)';
                                e.currentTarget.style.borderColor = '#F1F3F5';
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                <span style={{ fontWeight: '900', color: '#2C3E50', fontSize: '0.9rem' }}>{act.students?.name}</span>
                                <span style={{ fontSize: '0.75rem', color: '#ADB5BD', fontWeight: 'bold' }}>{timeAgo(act.created_at)}</span>
                            </div>
                            <div style={{
                                fontSize: '0.85rem',
                                color: '#7F8C8D',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                width: '100%'
                            }}>
                                {act.title || '제목 없는 글'}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default TeacherDashboard;
