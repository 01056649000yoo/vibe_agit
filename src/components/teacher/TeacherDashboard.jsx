import React, { useState, useEffect, Suspense, lazy } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';

// 지연 로딩 적용
const ClassManager = lazy(() => import('./ClassManager'));
const StudentManager = lazy(() => import('./StudentManager'));
const MissionManager = lazy(() => import('./MissionManager'));
const ArchiveManager = lazy(() => import('./ArchiveManager'));
const UsageGuide = lazy(() => import('./UsageGuide'));

/**
 * 역할: 선생님 메인 대시보드 (와이드 2단 레이아웃) ✨
 */
const TeacherDashboard = ({ profile, session, activeClass, setActiveClass, onProfileUpdate }) => {
    const [currentTab, setCurrentTab] = useState('dashboard'); // 'dashboard', 'settings'
    const [classes, setClasses] = useState([]);
    const [loadingClasses, setLoadingClasses] = useState(true);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024); // 태블릿/모바일 기준
    const [selectedActivityPost, setSelectedActivityPost] = useState(null); // 최근 활동 클릭 시 상세보기

    // Gemini API Key 및 AI 프롬프트 관련 상태
    const [geminiKey, setGeminiKey] = useState('');
    const [originalKey, setOriginalKey] = useState('');
    const [promptTemplate, setPromptTemplate] = useState('');
    const [originalPrompt, setOriginalPrompt] = useState('');
    const [isKeyVisible, setIsKeyVisible] = useState(false);
    const [savingKey, setSavingKey] = useState(false);
    const [testingKey, setTestingKey] = useState(false); // [추가] 연결 테스트 상태

    // [신규] 선생님 인적 사항 상태
    const [teacherInfo, setTeacherInfo] = useState({ name: '', school_name: '', phone: '' });
    const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
    const [editName, setEditName] = useState('');
    const [editSchool, setEditSchool] = useState('');
    const [editPhone, setEditPhone] = useState('');

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (session?.user?.id) {
            fetchAllClasses();
            fetchGeminiKey();
            fetchTeacherInfo();
        }
    }, [session?.user?.id]);

    const fetchTeacherInfo = async () => {
        try {
            const { data, error } = await supabase
                .from('teachers')
                .select('name, school_name')
                .eq('id', session.user.id)
                .single();

            if (data) {
                setTeacherInfo(data);
                setEditName(data.name || '');
                setEditSchool(data.school_name || '');
                setEditPhone(data.phone || '');
            }
        } catch (err) {
            console.log('선생님 정보 fetch 알림 (미등록 상태일 수 있음)');
        }
    };

    const handleUpdateTeacherProfile = async () => {
        if (!editName.trim()) {
            alert('이름(별칭)을 입력해주세요! 😊');
            return;
        }
        try {
            const { error } = await supabase
                .from('teachers')
                .upsert({
                    id: session.user.id,
                    name: editName.trim(),
                    school_name: editSchool.trim(),
                    phone: editPhone.trim(),
                    email: session.user.email
                });

            if (error) throw error;
            setTeacherInfo({ name: editName.trim(), school_name: editSchool.trim(), phone: editPhone.trim() });
            alert('프로필 정보가 업데이트되었습니다! ✨');
            setIsEditProfileOpen(false);
        } catch (err) {
            console.error('프로필 저장 실패:', err.message);
            alert('저장 중 오류가 발생했습니다.');
        }
    };

    const fetchGeminiKey = async () => {
        const { data, error } = await supabase
            .from('profiles')
            .select('gemini_api_key, ai_prompt_template')
            .eq('id', session.user.id)
            .single();

        if (data) {
            if (data.gemini_api_key) {
                setOriginalKey(data.gemini_api_key);
                setGeminiKey(data.gemini_api_key);
            }
            if (data.ai_prompt_template) {
                setOriginalPrompt(data.ai_prompt_template);
                setPromptTemplate(data.ai_prompt_template);
            }
        }
    };

    const handleSaveTeacherSettings = async () => {
        setSavingKey(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    gemini_api_key: geminiKey.trim(),
                    ai_prompt_template: promptTemplate.trim()
                })
                .eq('id', session.user.id);

            if (error) throw error;
            setOriginalKey(geminiKey.trim());
            setOriginalPrompt(promptTemplate.trim());
            alert('설정이 안전하게 저장되었습니다! ✨');
        } catch (err) {
            console.error('설정 저장 실패:', err.message);
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

            // 🆕 주 학급 정보 확인 로직 강화
            let autoSelectedClass = null;
            if (classList.length > 0) {
                // 1순위: 주 학급이 설정되어 있는가? (profile prop 활용)
                const primaryId = profile?.primary_class_id;
                const primaryClass = classList.find(c => c.id === primaryId);

                if (primaryClass) {
                    autoSelectedClass = primaryClass;
                } else {
                    autoSelectedClass = classList[0];
                }
            }

            // 1. 학급 목록 업데이트
            setClasses(classList);

            // 2. 현재 선택된 학급이 유효한지 체크 및 자동 선택
            const isCurrentValid = activeClass && classList.some(c => c.id === activeClass.id);
            if (!isCurrentValid && autoSelectedClass) {
                console.log("✏️ TeacherDashboard: 주 학급 또는 기본 학급으로 자동 설정합니다.");
                setActiveClass(autoSelectedClass);
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
        // 로딩 완료 후 학급은 있는데 선택된 게 없을 때만 실행
        if (!loadingClasses && classes.length > 0 && !activeClass) {
            const primaryId = profile?.primary_class_id;
            const primary = classes.find(c => c.id === primaryId);
            console.log("🔄 TeacherDashboard: 새 학급으로 자동 전환합니다.");
            setActiveClass(primary || classes[0]);
        }
    }, [loadingClasses, classes, activeClass, profile]);

    // [추가] 주 학급 설정 기능
    const handleSetPrimaryClass = async (classId) => {
        if (!classId) return;
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ primary_class_id: classId })
                .eq('id', session.user.id);

            if (error) throw error;

            if (onProfileUpdate) await onProfileUpdate();
            alert('이 학급이 주 학급(기본)으로 설정되었습니다! ⭐');
        } catch (err) {
            console.error('주 학급 설정 실패:', err.message);
            alert('주 학급 설정 중 오류가 발생했습니다. (DB 컬럼 확인 필요)');
        }
    };

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
                    {!isMobile && (
                        <span style={{ fontSize: '0.85rem', color: '#6C757D', fontWeight: 'bold' }}>
                            {teacherInfo.name || profile?.full_name} 선생님
                        </span>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setIsEditProfileOpen(true)} style={{ fontSize: '0.8rem', color: '#6C757D', border: '1px solid #E9ECEF', borderRadius: '8px' }}>
                        ⚙️ 정보 수정
                    </Button>
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
                {['dashboard', 'archive', 'settings', 'guide'].map((tabId) => (
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
                        {tabId === 'dashboard' ? '📊 미션 현황' : tabId === 'archive' ? '📂 글 보관함' : tabId === 'settings' ? '⚙️ 관리 설정' : '📖 앱 사용법'}
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
                    {currentTab === 'guide' ? (
                        <UsageGuide isMobile={isMobile} />
                    ) : currentTab === 'archive' ? (
                        <ArchiveManager activeClass={activeClass} isMobile={isMobile} />
                    ) : (!activeClass || hasZeroClasses) ? (
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
                                {/* 학급 종합 분석 섹션 (신규) */}
                                <ClassAnalysis classId={activeClass.id} isMobile={isMobile} />

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 6.5fr) minmax(0, 3.5fr)',
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
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
                                {/* 1. 상단: 학급 추가/선택 배너 (가로 와이드) */}
                                <section style={{
                                    background: 'white', borderRadius: '24px', padding: isMobile ? '16px' : '24px',
                                    border: '1px solid #E9ECEF', boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                                    width: '100%', boxSizing: 'border-box', overflow: 'hidden'
                                }}>
                                    <ClassManager
                                        userId={session.user.id}
                                        classes={classes}
                                        activeClass={activeClass}
                                        setActiveClass={setActiveClass}
                                        setClasses={setClasses}
                                        onClassDeleted={fetchAllClasses}
                                        isMobile={isMobile}
                                        primaryClassId={profile?.primary_class_id}
                                        onSetPrimaryClass={handleSetPrimaryClass}
                                    />
                                </section>

                                {activeClass && (
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 5.5fr) minmax(0, 4.5fr)',
                                        gap: '24px',
                                        width: '100%',
                                        boxSizing: 'border-box'
                                    }}>
                                        {/* 2. 좌측: 학생 명단 및 계정 관리 */}
                                        <section style={{
                                            background: 'white', borderRadius: '24px', padding: isMobile ? '20px' : '28px',
                                            border: '1px solid #E9ECEF', boxSizing: 'border-box', boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                                            width: '100%', display: 'flex', flexDirection: 'column'
                                        }}>

                                            <div style={{ flex: 1 }}>
                                                <StudentManager classId={activeClass.id} isDashboardMode={false} />
                                            </div>
                                        </section>

                                        {/* 3. 우측: AI 자동 피드백 보안 센터 */}
                                        <section style={{
                                            background: 'linear-gradient(135deg, #FFFFFF 0%, #F0F4F8 100%)',
                                            borderRadius: '24px', padding: isMobile ? '20px' : '28px',
                                            border: '1px solid #D1D9E6', boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
                                            width: '100%', boxSizing: 'border-box',
                                            display: 'flex', flexDirection: 'column'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                                                <span style={{ fontSize: '1.5rem' }}>🔐</span>
                                                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#2C3E50', fontWeight: '900' }}>AI 자동 피드백 보안 센터</h3>
                                            </div>

                                            <div style={{
                                                background: 'white', padding: '20px', borderRadius: '18px', border: '1px solid #E9ECEF',
                                                flex: 1, display: 'flex', flexDirection: 'column'
                                            }}>
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
                                                        variant="secondary"
                                                        onClick={handleTestGeminiKey}
                                                        disabled={savingKey || testingKey}
                                                        style={{ borderRadius: '12px', minWidth: '90px', background: '#E8F5E9', color: '#2E7D32', border: '1px solid #C8E6C9', fontSize: '0.85rem' }}
                                                    >
                                                        {testingKey ? '...' : '테스트'}
                                                    </Button>
                                                </div>
                                                {originalKey && (
                                                    <p style={{ marginTop: '10px', fontSize: '0.75rem', color: '#95A5A6' }}>
                                                        사용 중인 키: <code style={{ background: '#F8F9FA', padding: '2px 4px', borderRadius: '4px' }}>{maskKey(originalKey)}</code>
                                                    </p>
                                                )}

                                                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px dashed #DEE2E6', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#7F8C8D', fontWeight: 'bold', marginBottom: '8px' }}>
                                                        AI 피드백 프롬프트
                                                    </label>
                                                    <textarea
                                                        value={promptTemplate}
                                                        onChange={(e) => setPromptTemplate(e.target.value)}
                                                        placeholder="선생님만의 피드백 규칙을 입력하세요."
                                                        style={{
                                                            width: '100%', flex: 1, minHeight: '100px', padding: '12px', borderRadius: '12px',
                                                            border: '1px solid #DEE2E6', fontSize: '0.85rem', lineHeight: '1.5',
                                                            color: '#2C3E50', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit'
                                                        }}
                                                    />
                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                                                        <Button
                                                            onClick={handleSaveTeacherSettings}
                                                            disabled={savingKey || (geminiKey === originalKey && promptTemplate === originalPrompt)}
                                                            size="sm"
                                                            style={{ borderRadius: '10px', padding: '8px 20px' }}
                                                        >
                                                            {savingKey ? '저장 중...' : '설정 저장'}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </section>
                                    </div>
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
                                <span style={{ color: '#3498DB', fontWeight: 'bold', fontSize: '0.9rem' }}>{selectedActivityPost?.students?.name || '학생'}의 글</span>
                                <h3 style={{ margin: '4px 0 0 0', color: '#2C3E50', fontWeight: '900' }}>{selectedActivityPost?.title || '제목 없음'}</h3>
                            </div>
                            <button onClick={() => setSelectedActivityPost(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#ADB5BD' }}>✕</button>
                        </header>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '32px', lineHeight: '1.8', whiteSpace: 'pre-wrap', color: '#444', fontSize: '1.1rem' }}>
                            {selectedActivityPost?.content || '내용이 없습니다.'}
                        </div>
                        <footer style={{ padding: '20px', borderTop: '1px solid #EEE', textAlign: 'center', color: '#ADB5BD', fontSize: '0.85rem' }}>
                            미션: {selectedActivityPost?.writing_missions?.title || (Array.isArray(selectedActivityPost?.writing_missions) ? selectedActivityPost?.writing_missions[0]?.title : '정보 없음')} | 글자 수: {selectedActivityPost?.char_count || 0}자
                        </footer>
                    </div>
                </div>
            )}
            {/* 선생님 정보 수정 모달 */}
            <AnimatePresence>
                {isEditProfileOpen && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                        zIndex: 2500, backdropFilter: 'blur(4px)'
                    }}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            style={{ width: '90%', maxWidth: '420px' }}
                        >
                            <Card style={{ padding: '32px', borderRadius: '28px', border: 'none', boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}>
                                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                                    <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>👤</div>
                                    <h3 style={{ margin: 0, fontSize: '1.4rem', color: '#2C3E50', fontWeight: '900' }}>선생님 프로필 수정</h3>
                                    <p style={{ margin: '4px 0 0 0', color: '#7F8C8D', fontSize: '0.9rem' }}>실명 또는 별칭을 입력해 주세요.</p>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', color: '#5D4037', fontWeight: 'bold', marginBottom: '6px' }}>이름 (또는 별칭)</label>
                                        <input
                                            type="text"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            placeholder="예: 홍길동 선생님"
                                            style={{
                                                width: '100%', padding: '12px', borderRadius: '12px',
                                                border: '2px solid #ECEFF1', fontSize: '1rem', outline: 'none'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', color: '#5D4037', fontWeight: 'bold', marginBottom: '6px' }}>소속 학교명</label>
                                        <input
                                            type="text"
                                            value={editSchool}
                                            onChange={(e) => setEditSchool(e.target.value)}
                                            placeholder="예: 서울미래초등학교"
                                            style={{
                                                width: '100%', padding: '12px', borderRadius: '12px',
                                                border: '2px solid #ECEFF1', fontSize: '1rem', outline: 'none'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', color: '#5D4037', fontWeight: 'bold', marginBottom: '6px' }}>전화번호 (선택)</label>
                                        <input
                                            type="tel"
                                            value={editPhone}
                                            onChange={(e) => setEditPhone(e.target.value)}
                                            placeholder="010-0000-0000"
                                            style={{
                                                width: '100%', padding: '12px', borderRadius: '12px',
                                                border: '2px solid #ECEFF1', fontSize: '1rem', outline: 'none'
                                            }}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <Button variant="ghost" style={{ flex: 1, height: '50px', borderRadius: '14px' }} onClick={() => setIsEditProfileOpen(false)}>취소</Button>
                                    <Button variant="primary" style={{ flex: 2, height: '50px', borderRadius: '14px', fontWeight: 'bold' }} onClick={handleUpdateTeacherProfile}>저장하기 ✨</Button>
                                </div>
                            </Card>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
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
                                <span style={{ fontWeight: '900', color: '#2C3E50', fontSize: '0.9rem' }}>{act.students?.name || '알 수 없는 학생'}</span>
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
                            <div style={{ fontSize: '0.7rem', color: '#3498DB', marginTop: '2px' }}>
                                미션: {act.writing_missions?.title || act.writing_missions?.[0]?.title || '미션 정보 없음'}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

// [추가] 학급 학습 현황 분석 컴포넌트
const ClassAnalysis = ({ classId, isMobile }) => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        studentCount: 0,
        avgChars: 0,
        submissionRate: 0,
        topStudents: [],
        notSubmitted: [],
        trendData: [],
        todayRate: 0
    });

    useEffect(() => {
        if (classId) fetchAnalysisData();
    }, [classId]);

    const fetchAnalysisData = async () => {
        setLoading(true);
        try {
            // 1. 기초 데이터 로드 (학생, 미션, 제출물)
            const { data: students, error: sErr } = await supabase.from('students').select('id, name').eq('class_id', classId);
            if (sErr || !students || students.length === 0) {
                setStats(prev => ({ ...prev, studentCount: 0 }));
                setLoading(false);
                return;
            }

            const [
                { data: missions },
                { data: posts }
            ] = await Promise.all([
                supabase.from('writing_missions').select('id, title, created_at').eq('class_id', classId).order('created_at', { ascending: false }),
                supabase.from('student_posts').select('*').in('student_id', students.map(s => s.id))
            ]);

            // 2. 통계 계산
            const totalChars = posts?.reduce((sum, p) => sum + (p.char_count || 0), 0) || 0;
            const avgChars = students.length > 0 ? Math.round(totalChars / students.length) : 0;

            // 학생별 제출 현황 및 랭킹
            const studentStats = students.map(s => {
                const myPosts = posts?.filter(p => p.student_id === s.id && p.is_submitted) || [];
                const myChars = myPosts.reduce((sum, p) => sum + (p.char_count || 0), 0);
                return { name: s.name, count: myPosts.length, chars: myChars };
            });

            const topStudents = studentStats.sort((a, b) => b.chars - a.chars).slice(0, 5);

            // 미제출자 파악 (가장 최근 미션 기준)
            let notSubmittedStudents = [];
            if (missions && missions.length > 0) {
                const latestMissionId = missions[0].id;
                const submittedPosts = posts ? posts.filter(p => p.mission_id === latestMissionId && p.is_submitted) : [];
                const submittedIds = new Set(submittedPosts.map(p => p.student_id));
                notSubmittedStudents = students.filter(s => !submittedIds.has(s.id)).map(s => s.name);
            }

            // 오늘 제출 확률
            const today = new Date().toISOString().split('T')[0];
            const todaySubmittedCount = posts ? posts.filter(p => p.is_submitted && p.created_at?.startsWith(today)).length : 0;
            const todayRate = students.length > 0 ? Math.round((todaySubmittedCount / students.length) * 100) : 0;

            // 제출 트렌드 (최근 7일)
            const trend = Array.from({ length: 7 }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dayStr = d.toISOString().split('T')[0];
                const count = posts ? posts.filter(p => p.is_submitted && p.created_at?.startsWith(dayStr)).length : 0;
                return { date: dayStr, count };
            }).reverse();

            setStats({
                studentCount: students.length,
                avgChars,
                submissionRate: posts?.length || 0,
                topStudents,
                notSubmitted: notSubmittedStudents,
                trendData: trend,
                todayRate
            });
        } catch (err) {
            console.error('분석 데이터 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div style={{ padding: '24px', background: 'white', borderRadius: '24px', border: '1px solid #E9ECEF', boxShadow: '0 2px 12px rgba(0,0,0,0.03)' }}>
                <div style={{ height: '24px', width: '200px', background: '#F1F3F5', borderRadius: '4px', marginBottom: '24px', animation: 'pulse 1.5s infinite' }} />
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '20px' }}>
                    {[1, 2, 3].map(i => (
                        <div key={i} style={{ height: '120px', background: '#F8F9FA', borderRadius: '16px', animation: 'pulse 1.5s infinite' }} />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <section style={{
            background: 'white', borderRadius: '24px', padding: isMobile ? '20px' : '28px',
            border: '1px solid #E9ECEF', boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
            width: '100%', boxSizing: 'border-box'
        }}>
            <h3 style={{ margin: '0 0 24px 0', fontSize: '1.2rem', color: '#2C3E50', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px' }}>
                📊 학급 학습 활동 분석판
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '24px' }}>
                {/* 1. 핵심 지표 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ background: '#E3F2FD', padding: '20px', borderRadius: '20px', border: '1px solid #BBDEFB' }}>
                        <div style={{ fontSize: '0.85rem', color: '#1976D2', fontWeight: 'bold', marginBottom: '8px' }}>✍️ 학급 평균 글자 수</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#0D47A1' }}>{stats.avgChars.toLocaleString()}자</div>
                    </div>

                    <div style={{ background: '#F8F9FA', padding: '20px', borderRadius: '20px', border: '1px solid #E9ECEF' }}>
                        <div style={{ fontSize: '0.85rem', color: '#666', fontWeight: 'bold', marginBottom: '12px' }}>🎯 오늘 미션 완료율</div>
                        <div style={{ height: '12px', background: '#E0E0E0', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${stats.todayRate}%` }}
                                transition={{ duration: 1, ease: 'easeOut' }}
                                style={{ height: '100%', background: 'linear-gradient(90deg, #3498DB, #5CC6FF)' }}
                            />
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '0.9rem', fontWeight: 'bold', color: '#3498DB' }}>{stats.todayRate}%</div>
                    </div>
                </div>

                {/* 2. 학생 랭킹 (열정 TOP 5) */}
                <div style={{ background: '#FDFCF0', padding: '20px', borderRadius: '24px', border: '1px solid #FFE082' }}>
                    <h4 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', color: '#795548', fontWeight: '900' }}>🔥 열정 작가 TOP 5</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {stats.topStudents.map((s, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                                <span style={{ color: '#5D4037', fontWeight: '700' }}>{i + 1}. {s.name}</span>
                                <span style={{ color: '#FBC02D', fontWeight: '900' }}>{s.chars.toLocaleString()}자</span>
                            </div>
                        ))}
                        {stats.topStudents.length === 0 && <p style={{ color: '#9E9E9E', fontSize: '0.8rem', textAlign: 'center', marginTop: '20px' }}>활동 내역이 없습니다.</p>}
                    </div>
                </div>

                {/* 3. 주의 깊게 볼 내용 (미제출 알림) */}
                <div style={{ background: '#FFEBEE', padding: '20px', borderRadius: '24px', border: '1px solid #FFCDD2' }}>
                    <h4 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', color: '#D32F2F', fontWeight: '900' }}>⚠️ 미제출 알림 (최근 미션)</h4>
                    <div style={{ fontSize: '0.85rem', color: '#C62828', lineHeight: '1.6' }}>
                        {stats.notSubmitted.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {stats.notSubmitted.slice(0, 15).map(name => (
                                    <span key={name} style={{ background: 'white', padding: '4px 10px', borderRadius: '10px', border: '1px solid #FFCDD2', fontWeight: 'bold' }}>{name}</span>
                                ))}
                                {stats.notSubmitted.length > 15 && <span style={{ padding: '4px', fontWeight: 'bold' }}>외 {stats.notSubmitted.length - 15}명</span>}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '20px', fontSize: '1rem' }}>모든 학생이 제출했습니다! 👏</div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default TeacherDashboard;
