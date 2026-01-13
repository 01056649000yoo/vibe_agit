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

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (session?.user?.id) {
            fetchAllClasses();
        }
    }, [session?.user?.id]);

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
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center', // 중앙 정렬 추가
            height: isMobile ? 'auto' : '100vh',
            minHeight: '100vh',
            width: '100%',
            background: '#F8F9FA',
            overflowX: 'hidden',
            overflowY: isMobile ? 'auto' : 'hidden'
        }}>
            <div style={{ // 중앙 정렬을 위한 내부 래퍼
                width: '100%',
                maxWidth: '1600px', // 전체 최대 너비 설정
                display: 'flex',
                flexDirection: 'column',
                height: isMobile ? 'auto' : '100vh',
                position: 'relative'
            }}>
                {/* 상단 슬림 헤더 (고정) */}
                <header style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: isMobile ? '8px 16px' : '12px 24px',
                    background: 'white', borderBottom: '1px solid #E9ECEF',
                    position: 'sticky', top: 0, zIndex: 100
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
                    position: 'sticky', top: isMobile ? '47px' : '55px', zIndex: 99
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

                {/* 메인 콘텐츠 영역 */}
                <main style={{
                    flex: 1,
                    padding: isMobile ? '16px' : 'clamp(16px, 3vw, 40px)', // 반응형 여백 적용
                    overflow: isMobile ? 'visible' : 'hidden',
                    boxSizing: 'border-box',
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'center'
                }}>
                    <div style={{ width: '100%', maxWidth: '1400px', height: '100%' }}>
                        <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px' }}>로딩 중... ✨</div>}>
                            {(!activeClass || hasZeroClasses) ? (
                                /* 학급이 없거나 선택되지 않은 경우: 학급 생성/관리 화면으로 전환 */
                                <div style={{ maxWidth: '600px', margin: isMobile ? '20px auto' : '40px auto' }}>
                                    <ClassManager
                                        userId={session.user.id}
                                        classes={classes}
                                        activeClass={activeClass}
                                        setActiveClass={setActiveClass}
                                        setClasses={setClasses}
                                        onClassDeleted={fetchAllClasses}
                                    />
                                </div>
                            ) : (
                                currentTab === 'dashboard' ? (
                                    <div style={{
                                        display: isMobile ? 'flex' : 'grid',
                                        flexDirection: isMobile ? 'column' : 'initial',
                                        gridTemplateColumns: isMobile ? 'initial' : 'minmax(0, 6.5fr) minmax(0, 3.5fr)', // 잘림 방지
                                        gap: isMobile ? '16px' : '24px',
                                        height: isMobile ? 'auto' : 'calc(100vh - 160px)', // 하단 여백 확보
                                        width: '100%',
                                        overflow: isMobile ? 'visible' : 'hidden'
                                    }}>
                                        {/* 왼쪽: 글쓰기 미션 관리 (6.5 비율) */}
                                        <section style={{
                                            background: 'white', borderRadius: '24px',
                                            border: '1px solid #E9ECEF', display: 'flex', flexDirection: 'column',
                                            overflow: isMobile ? 'visible' : 'hidden',
                                            boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                                            minHeight: isMobile ? '400px' : 'auto'
                                        }}>
                                            <div style={{
                                                flex: 1,
                                                overflowY: isMobile ? 'visible' : 'auto',
                                                padding: isMobile ? '16px' : '24px',
                                                boxSizing: 'border-box'
                                            }}>
                                                <MissionManager activeClass={activeClass} isDashboardMode={true} />
                                            </div>
                                        </section>

                                        {/* 오른쪽: 명예의 전당 및 활동 (3.5 비율) */}
                                        <aside style={{
                                            display: 'flex', flexDirection: 'column', gap: isMobile ? '16px' : '24px',
                                            height: isMobile ? 'auto' : '100%', overflow: isMobile ? 'visible' : 'hidden'
                                        }}>
                                            {/* 상단: 명예의 전당 (유동적 높이, 내부 스크롤) */}
                                            <section style={{
                                                flex: isMobile ? 'initial' : 2,
                                                background: 'white', borderRadius: '24px', padding: isMobile ? '16px' : '24px',
                                                border: '1px solid #E9ECEF', boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                                                overflowY: isMobile ? 'visible' : 'auto', boxSizing: 'border-box'
                                            }}>
                                                <StudentManager classId={activeClass?.id} isDashboardMode={true} />
                                            </section>

                                            {/* 하단: 최근 활동 (고정 혹은 유동, 내부 스크롤) */}
                                            <section style={{
                                                flex: isMobile ? 'initial' : 1,
                                                background: 'white', borderRadius: '24px', padding: isMobile ? '16px' : '24px',
                                                border: '1px solid #E9ECEF', boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                                                overflowY: isMobile ? 'visible' : 'auto', boxSizing: 'border-box'
                                            }}>
                                                <RecentActivity classId={activeClass?.id} />
                                            </section>
                                        </aside>
                                    </div>
                                ) : (
                                    <div style={{
                                        display: isMobile ? 'flex' : 'grid',
                                        flexDirection: isMobile ? 'column' : 'initial',
                                        gridTemplateColumns: isMobile ? 'initial' : 'minmax(0, 4fr) minmax(0, 6fr)', // 잘림 방지
                                        gap: isMobile ? '16px' : '24px',
                                        height: isMobile ? 'auto' : 'calc(100vh - 160px)',
                                        width: '100%',
                                        overflow: isMobile ? 'visible' : 'hidden'
                                    }}>
                                        {/* 왼쪽: 학급 정보 (40%) */}
                                        <aside style={{
                                            flex: 1, height: isMobile ? 'auto' : '100%',
                                            overflowY: isMobile ? 'visible' : 'auto',
                                            background: 'white', borderRadius: '24px', padding: isMobile ? '16px' : '24px',
                                            border: '1px solid #E9ECEF', boxSizing: 'border-box'
                                        }}>
                                            <ClassManager
                                                userId={session.user.id}
                                                classes={classes}
                                                activeClass={activeClass}
                                                setActiveClass={setActiveClass}
                                                setClasses={setClasses}
                                                onClassDeleted={fetchAllClasses}
                                            />
                                        </aside>

                                        {/* 오른쪽: 학생 명단 및 계정 관리 (60%) */}
                                        {activeClass && (
                                            <section style={{
                                                height: isMobile ? 'auto' : '100%',
                                                overflowY: isMobile ? 'visible' : 'auto',
                                                background: 'white', borderRadius: '24px', padding: isMobile ? '16px' : '24px',
                                                border: '1px solid #E9ECEF', boxSizing: 'border-box', boxShadow: '0 2px 12px rgba(0,0,0,0.03)'
                                            }}>
                                                <StudentManager classId={activeClass.id} isDashboardMode={false} />
                                            </section>
                                        )}
                                    </div>
                                )
                            )}
                        </Suspense>
                    </div>
                </main>
            </div>
        </div >
    );
};

// 최근 활동 요약 컴포넌트
const RecentActivity = ({ classId }) => {
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
                    id, created_at, mission_id, student_id,
                    students!inner(name, class_id)
                `)
                .eq('students.class_id', classId)
                .order('created_at', { ascending: false })
                .limit(4);

            if (error) throw error;
            setActivities(data || []);
        } catch (err) {
            console.error('최근 활동 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ width: '100%' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#212529', fontWeight: '900' }}>🔔 최근 작성된 글</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {loading ? (
                    <p style={{ textAlign: 'center', color: '#ADB5BD', fontSize: '0.85rem' }}>로딩 중...</p>
                ) : activities.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#ADB5BD', fontSize: '0.85rem', padding: '20px' }}>아직 등록된 글이 없어요. ✍️</p>
                ) : (
                    activities.map((act) => (
                        <div key={act.id} style={{
                            padding: '12px 16px', borderRadius: '12px', background: '#F8F9FA',
                            border: '1px solid #F1F3F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            width: '100%', boxSizing: 'border-box', wordBreak: 'keep-all', overflowWrap: 'break-word'
                        }}>
                            <div>
                                <span style={{ fontWeight: 'bold', color: '#3498DB', fontSize: '0.9rem' }}>{act.students?.name}</span>
                                <span style={{ fontSize: '0.85rem', color: '#495057', marginLeft: '8px' }}>새 글 등록</span>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#ADB5BD' }}>
                                {new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default TeacherDashboard;
