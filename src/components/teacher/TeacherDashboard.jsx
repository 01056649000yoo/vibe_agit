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
            setClasses(data || []);

            // 강제 자동 선택: 학급 목록이 있고 현재 선택된 학급이 실제 목록에 없는 경우 첫 번째 선택
            if (data && data.length > 0) {
                const isCurrentValid = activeClass && data.some(c => c.id === activeClass.id);
                if (!isCurrentValid) {
                    setActiveClass(data[0]);
                }
            }
        } catch (err) {
            console.error('❌ TeacherDashboard: 학급 목록 불러오기 실패:', err.message);
        } finally {
            setLoadingClasses(false);
        }
    };

    if (loadingClasses) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#F8F9FA' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔔</div>
                    <p style={{ color: '#7F8C8D', fontWeight: 'bold' }}>학급 정보를 연결하는 중...</p>
                </div>
            </div>
        );
    }

    const hasZeroClasses = classes.length === 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#F8F9FA', overflow: 'hidden' }}>
            {/* 상단 슬림 헤더 */}
            <header style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 24px', background: 'white', borderBottom: '1px solid #E9ECEF'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#212529', fontWeight: '900' }}>
                        {activeClass ? `🏫 ${activeClass.name}` : '시작하기'}
                    </h2>
                    {classes.length > 1 && (
                        <select
                            value={activeClass?.id || ''}
                            onChange={(e) => setActiveClass(classes.find(c => c.id === e.target.value))}
                            style={{
                                padding: '4px 8px', borderRadius: '8px', border: '1px solid #DEE2E6',
                                background: '#F8F9FA', color: '#495057', fontSize: '0.85rem', fontWeight: 'bold'
                            }}
                        >
                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.85rem', color: '#6C757D' }}>{profile?.full_name} 선생님</span>
                    <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()} style={{ fontSize: '0.8rem', color: '#DC3545' }}>
                        로그아웃
                    </Button>
                </div>
            </header>

            {/* 탭 네비게이션 */}
            <nav style={{ display: 'flex', background: 'white', borderBottom: '1px solid #E9ECEF', padding: '0 24px' }}>
                {['dashboard', 'settings'].map((tabId) => (
                    <button
                        key={tabId}
                        onClick={() => setCurrentTab(tabId)}
                        style={{
                            padding: '12px 20px', border: 'none', background: 'transparent',
                            borderBottom: currentTab === tabId ? '3px solid #3498DB' : '3px solid transparent',
                            color: currentTab === tabId ? '#3498DB' : '#ADB5BD',
                            fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.95rem'
                        }}
                    >
                        {tabId === 'dashboard' ? '📊 학급 대시보드' : '⚙️ 클래스 설정'}
                    </button>
                ))}
            </nav>

            {/* 메인 콘텐츠 영역 (독립 스크롤 구조) */}
            <main style={{ flex: 1, padding: '24px', overflow: 'hidden', boxSizing: 'border-box' }}>
                <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px' }}>데이터를 불러오는 중... ✨</div>}>
                    {hasZeroClasses ? (
                        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                            <ClassManager userId={session.user.id} onClassFound={fetchAllClasses} />
                        </div>
                    ) : (
                        currentTab === 'dashboard' ? (
                            <div style={{ display: 'flex', gap: '24px', height: '100%', maxWidth: '1400px', margin: '0 auto' }}>
                                {/* 왼쪽: 글쓰기 미션 관리 (넓게 - 1.6) */}
                                <section style={{
                                    flex: 1.6, background: 'white', borderRadius: '20px',
                                    border: '1px solid #E9ECEF', display: 'flex', flexDirection: 'column',
                                    overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                                }}>
                                    <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                                        <MissionManager activeClass={activeClass} isDashboardMode={true} />
                                    </div>
                                </section>

                                {/* 오른쪽: 명예의 전당 및 활동 (좁게 - 1) */}
                                <aside style={{
                                    flex: 1, display: 'flex', flexDirection: 'column', gap: '24px',
                                    overflowY: 'auto', paddingRight: '4px'
                                }}>
                                    <section style={{
                                        background: 'white', borderRadius: '20px', padding: '20px',
                                        border: '1px solid #E9ECEF', boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                                    }}>
                                        <StudentManager classId={activeClass?.id} isDashboardMode={true} />
                                    </section>
                                    <section style={{
                                        background: 'white', borderRadius: '20px', padding: '20px',
                                        border: '1px solid #E9ECEF', boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                                    }}>
                                        <RecentActivity classId={activeClass?.id} />
                                    </section>
                                </aside>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '24px', height: '100%', maxWidth: '1400px', margin: '0 auto' }}>
                                {/* 왼쪽: 학급 정보 (40%) */}
                                <aside style={{ flex: 1 }}>
                                    <ClassManager userId={session.user.id} activeClass={activeClass} onClassFound={(cls) => {
                                        setClasses(prev => prev.some(c => c.id === cls.id) ? prev : [cls, ...prev]);
                                        setActiveClass(cls);
                                    }} />
                                </aside>

                                {/* 오른쪽: 학생 명단 및 계정 관리 (60%) */}
                                {activeClass && (
                                    <section style={{
                                        flex: 1.5, background: 'white', borderRadius: '20px', padding: '24px',
                                        border: '1px solid #E9ECEF', overflowY: 'auto'
                                    }}>
                                        <StudentManager classId={activeClass.id} isDashboardMode={false} />
                                    </section>
                                )}
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
                            border: '1px solid #F1F3F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
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
