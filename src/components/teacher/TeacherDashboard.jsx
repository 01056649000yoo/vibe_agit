import React, { useState, useEffect, Suspense, lazy } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';

// 지연 로딩 적용
const ClassManager = lazy(() => import('./ClassManager'));
const StudentManager = lazy(() => import('./StudentManager'));
const MissionManager = lazy(() => import('./MissionManager'));

/**
 * 역할: 선생님 메인 대시보드 (탭 네비게이션 포함)
 * 최적화 포인트: 화이트 스크린 방지 및 데이터 로딩 안정성 확보 ✨
 */
const TeacherDashboard = ({ profile, session, activeClass, setActiveClass }) => {
    const [currentTab, setCurrentTab] = useState('dashboard'); // 'dashboard', 'settings'
    const [classes, setClasses] = useState([]);
    const [loadingClasses, setLoadingClasses] = useState(true);

    useEffect(() => {
        console.log("🔍 TeacherDashboard: Initializing with session user:", session?.user?.id);
        if (session?.user?.id) {
            fetchAllClasses();
        }
    }, [session?.user?.id]);

    const fetchAllClasses = async () => {
        console.log("📡 TeacherDashboard: Fetching all classes...");
        setLoadingClasses(true);
        try {
            const { data, error } = await supabase
                .from('classes')
                .select('*')
                .eq('teacher_id', session.user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            console.log("✅ TeacherDashboard: Classes loaded:", data?.length || 0);
            setClasses(data || []);

            // 자동 학급 선택: 현재 선택된 학급이 없고 학급 목록이 있으면 첫 번째 학급 선택
            if (!activeClass && data && data.length > 0) {
                console.log("🏫 TeacherDashboard: Auto-selecting first class:", data[0].name);
                setActiveClass(data[0]);
            }
        } catch (err) {
            console.error('❌ TeacherDashboard: 학급 목록 불러오기 실패:', err.message);
        } finally {
            setLoadingClasses(false);
        }
    };

    // 로딩 상태 처리
    if (loadingClasses) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#F8F9F9' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔔</div>
                    <p style={{ color: '#7F8C8D', fontWeight: 'bold' }}>학급 소식을 가져오고 있습니다...</p>
                </div>
            </div>
        );
    }

    // 학급이 하나도 없는 경우 처리 (Settings 탭의 ClassManager가 생성 유도)
    const hasZeroClasses = classes.length === 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '100vh', background: '#F8F9F9' }}>
            {/* 상단 헤더 & 학급 선택 */}
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 24px',
                background: 'white',
                borderBottom: '1px solid #ECEFF1',
                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#2C3E50', fontWeight: '900' }}>
                        {activeClass ? `🏫 ${activeClass.name}` : '새로운 시작'}
                    </h2>
                    {classes.length > 1 && (
                        <select
                            value={activeClass?.id || ''}
                            onChange={(e) => setActiveClass(classes.find(c => c.id === e.target.value))}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '10px',
                                border: '1px solid #E0E4E7',
                                background: '#FDFEFE',
                                color: '#2C3E50',
                                fontWeight: 'bold',
                                outline: 'none'
                            }}
                        >
                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.9rem', color: '#7F8C8D', fontWeight: 'bold' }}>{profile?.full_name} 선생님</span>
                    <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()} style={{ background: '#FEF9F9', color: '#E74C3C' }}>
                        로그아웃
                    </Button>
                </div>
            </header>

            {/* 메인 탭 네비게이션 */}
            <nav style={{ display: 'flex', gap: '2px', background: 'white', padding: '8px 24px 0 24px', borderBottom: '1px solid #ECEFF1' }}>
                {[
                    { id: 'dashboard', label: '📊 학급 대시보드' },
                    { id: 'settings', label: '⚙️ 클래스 설정' }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => {
                            console.log("🎯 TeacherDashboard: Switching tab to:", tab.id);
                            setCurrentTab(tab.id);
                        }}
                        style={{
                            padding: '12px 24px',
                            border: 'none',
                            borderBottom: currentTab === tab.id ? '3px solid #3498DB' : '3px solid transparent',
                            cursor: 'pointer',
                            background: 'transparent',
                            color: currentTab === tab.id ? '#3498DB' : '#7F8C8D',
                            fontWeight: 'bold',
                            transition: 'all 0.2s',
                            fontSize: '1rem'
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>

            {/* 콘텐츠 영역 */}
            <main style={{ flex: 1, overflowY: 'auto', padding: '24px', boxSizing: 'border-box' }}>
                <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px', color: '#95A5A6' }}>콘텐츠를 불러오는 중... ✨</div>}>
                    {hasZeroClasses ? (
                        <div style={{ maxWidth: '600px', margin: '40px auto' }}>
                            <ClassManager userId={session.user.id} onClassFound={(cls) => {
                                console.log("🆕 TeacherDashboard: Class created, updating list...");
                                fetchAllClasses();
                                setActiveClass(cls);
                            }} />
                        </div>
                    ) : (
                        currentTab === 'dashboard' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '40px', maxWidth: '1200px', margin: '0 auto' }}>
                                {/* Dashboard View: Mission + (Ranking & Activity) */}
                                {activeClass ? (
                                    <>
                                        <section>
                                            <MissionManager activeClass={activeClass} isDashboardMode={true} />
                                        </section>

                                        <section style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                                            gap: '32px',
                                            alignItems: 'start'
                                        }}>
                                            <StudentManager classId={activeClass.id} isDashboardMode={true} />
                                            <RecentActivity classId={activeClass.id} />
                                        </section>
                                    </>
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '60px', color: '#95A5A6' }}>학급을 선택해주세요.</div>
                                )}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '40px', maxWidth: '1000px', margin: '0 auto' }}>
                                {/* Settings View: Invite Code + Student List Management */}
                                <ClassManager userId={session.user.id} activeClass={activeClass} onClassFound={(cls) => {
                                    setClasses(prev => prev.some(c => c.id === cls.id) ? prev : [cls, ...prev]);
                                    setActiveClass(cls);
                                }} />
                                {activeClass && <StudentManager classId={activeClass.id} isDashboardMode={false} />}
                            </div>
                        )
                    )}
                </Suspense>
            </main>
        </div>
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
        console.log("📡 RecentActivity: Fetching activities for class:", classId);
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('student_posts')
                .select(`
                    id,
                    created_at,
                    mission_id,
                    student_id,
                    students!inner(name, class_id)
                `)
                .eq('students.class_id', classId)
                .order('created_at', { ascending: false })
                .limit(5);

            if (error) throw error;
            console.log("✅ RecentActivity: Activities loaded:", data?.length || 0);
            setActivities(data || []);
        } catch (err) {
            console.error('❌ RecentActivity: 최근 활동 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card style={{ padding: '24px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', borderRadius: '24px' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', color: '#2C3E50', fontWeight: '900' }}>🔔 최근 작성된 글</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {loading ? (
                    <p style={{ textAlign: 'center', color: '#95A5A6', fontSize: '0.9rem' }}>로딩 중... 🔍</p>
                ) : activities.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', background: '#FDFEFE', borderRadius: '16px', border: '1px dashed #E0E4E7' }}>
                        <p style={{ color: '#95A5A6', fontSize: '0.9rem', margin: 0 }}>아직 등록된 글이 없어요. ✍️</p>
                    </div>
                ) : (
                    activities.map((act) => (
                        <div key={act.id} style={{
                            background: '#FDFEFE', padding: '16px', borderRadius: '16px',
                            border: '1px solid #F2F4F4', display: 'flex', flexDirection: 'column', gap: '6px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: '900', color: '#3498DB', fontSize: '1rem' }}>{act.students?.name}</span>
                                <span style={{ fontSize: '0.75rem', color: '#ABB2B9', fontWeight: 'bold' }}>
                                    {new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                            <span style={{ fontSize: '0.85rem', color: '#5D6D7E', fontWeight: '500' }}>새로운 미션글을 등록했습니다. 📝</span>
                        </div>
                    ))
                )}
            </div>
        </Card>
    );
};

export default TeacherDashboard;
