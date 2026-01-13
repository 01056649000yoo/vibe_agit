import React, { useState, Suspense, lazy } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import TeacherHome from './TeacherHome';
import { supabase } from '../../lib/supabaseClient';

// 지연 로딩 적용
const ClassManager = lazy(() => import('./ClassManager'));
const StudentManager = lazy(() => import('./StudentManager'));
const MissionManager = lazy(() => import('./MissionManager'));

/**
 * 역할: 선생님 메인 대시보드 (탭 네비게이션 포함)
 * props:
 *  - profile: 선생님 프로필 정보
 *  - session: Supabase 세션 정보
 *  - currentClassId: 현재 선택된 학급 ID
 *  - setCurrentClassId: 학급 ID 변경 함수
 */
const TeacherDashboard = ({ profile, session, activeClass, setActiveClass }) => {
    const [currentTab, setCurrentTab] = useState('dashboard'); // 'dashboard', 'settings'
    const [classes, setClasses] = useState([]);
    const [loadingClasses, setLoadingClasses] = useState(true);

    useEffect(() => {
        if (session?.user?.id) {
            fetchAllClasses();
        }
    }, [session.user.id]);

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

            // 자동 학급 선택: 현재 선택된 학급이 없고 학급 목록이 있으면 첫 번째 학급 선택
            if (!activeClass && data && data.length > 0) {
                setActiveClass(data[0]);
            }
        } catch (err) {
            console.error('학급 목록 불러오기 실패:', err.message);
        } finally {
            setLoadingClasses(false);
        }
    };

    if (loadingClasses) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
                <p>학교 종소리를 기다리는 중... 🔔</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '90vh' }}>
            {/* 상단 헤더 & 학급 선택 */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 24px',
                borderBottom: '1px solid #ECEFF1'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#2C3E50' }}>
                        {activeClass ? `🏫 ${activeClass.name}` : '학급을 만들어보세요'}
                    </h2>
                    {classes.length > 1 && (
                        <select
                            value={activeClass?.id || ''}
                            onChange={(e) => setActiveClass(classes.find(c => c.id === e.target.value))}
                            style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid #ECEFF1' }}
                        >
                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
                    로그아웃
                </Button>
            </div>

            {/* 메인 탭 네비게이션 */}
            <div style={{ display: 'flex', gap: '2px', background: '#F8F9F9', padding: '4px', borderRadius: '0' }}>
                {[
                    { id: 'dashboard', label: '📊 학급 대시보드' },
                    { id: 'settings', label: '⚙️ 클래스 설정' }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setCurrentTab(tab.id)}
                        style={{
                            flex: 1, padding: '12px', border: 'none', cursor: 'pointer',
                            background: currentTab === tab.id ? 'white' : 'transparent',
                            color: currentTab === tab.id ? '#3498DB' : '#7F8C8D',
                            fontWeight: 'bold', transition: 'all 0.2s',
                            boxShadow: currentTab === tab.id ? '0 -2px 10px rgba(0,0,0,0.05)' : 'none',
                            borderRadius: '12px 12px 0 0'
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* 콘텐츠 영역 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: 'white' }}>
                <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px' }}>칠판을 닦는 중... ✨</div>}>
                    {currentTab === 'dashboard' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '48px', maxWidth: '1000px', margin: '0 auto' }}>
                            {/* Dashboard view content */}
                            <section>
                                <MissionManager activeClass={activeClass} isDashboardMode={true} />
                            </section>

                            <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1.2fr)', gap: '32px' }}>
                                <StudentManager classId={activeClass?.id} isDashboardMode={true} />
                                <RecentActivity classId={activeClass?.id} />
                            </section>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '48px', maxWidth: '1000px', margin: '0 auto' }}>
                            {/* Settings view content */}
                            <ClassManager userId={session.user.id} activeClass={activeClass} onClassFound={setActiveClass} />
                            <StudentManager classId={activeClass?.id} isDashboardMode={false} />
                        </div>
                    )}
                </Suspense>
            </div>
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
            // 학생 포스트와 학생 이름을 조인해서 가져옴
            const { data, error } = await supabase
                .from('student_posts')
                .select(`
                    id,
                    created_at,
                    mission_id,
                    student_id,
                    students (name)
                `)
                .order('created_at', { ascending: false })
                .limit(5);

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
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.4rem', color: '#2C3E50', fontWeight: '900' }}>🔔 최근 활동</h3>
            <div style={{ background: '#F8F9F9', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {loading ? (
                    <p style={{ textAlign: 'center', color: '#95A5A6' }}>활동 내역을 확인 중... 🔍</p>
                ) : activities.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#95A5A6', padding: '20px' }}>아직 올라온 글이 없어요. ✍️</p>
                ) : (
                    activities.map((act) => (
                        <div key={act.id} style={{
                            background: 'white', padding: '12px 16px', borderRadius: '12px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '4px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 'bold', color: '#3498DB' }}>{act.students?.name || '익명'}</span>
                                <span style={{ fontSize: '0.75rem', color: '#ABB2B9' }}>{new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <span style={{ fontSize: '0.9rem', color: '#5D6D7E' }}>새로운 글을 등록했습니다. 📝</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default TeacherDashboard;
