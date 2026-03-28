import { useState, useEffect, Suspense, lazy } from 'react'
import { supabase } from './lib/supabaseClient'
import './App.css'

// 레이아웃 및 공통 컴포넌트
import Layout from './components/layout/Layout'
import Loading from './components/common/Loading'
import ErrorBoundary from './components/common/ErrorBoundary'
import { useAuthStore } from './store/useAuthStore';
import { useAppStore } from './store/useAppStore';

// 지연 로딩 (Lazy Loading) 적용
const LandingPage = lazy(() => import('./components/layout/LandingPage'))
const StudentLogin = lazy(() => import('./components/student/StudentLogin'))
const StudentDashboard = lazy(() => import('./components/student/StudentDashboard'))
const TeacherProfileSetup = lazy(() => import('./components/teacher/TeacherProfileSetup'))
const TeacherDashboard = lazy(() => import('./components/teacher/TeacherDashboard'))
const PendingApproval = lazy(() => import('./components/teacher/PendingApproval'))
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard')) // [추가] 관리자 대시보드
const StudentWriting = lazy(() => import('./components/student/StudentWriting'))
const MissionList = lazy(() => import('./components/student/MissionList'))
const FriendsHideout = lazy(() => import('./components/student/FriendsHideout'))
const StudentBottomNav = lazy(() => import('./components/student/StudentBottomNav'))
const PrivacyPolicy = lazy(() => import('./components/layout/PrivacyPolicy'))
const TermsOfService = lazy(() => import('./components/layout/TermsOfService'))

/**
 * 역할: 전역 상태 관리 및 라우팅 (메인 진입점)
 * 주요 상태:
 *  - session: 구글 로그인 세션 (선생님용)
 *  - profile: 선생님 프로필 정보
 *  - studentSession: 학생 코드 로그인 데이터
 *  - isStudentLoginMode: 학생 로그인 화면 표시 여부
 *  - currentClassId: 선생님이 선택한 현재 학급 ID
 */
function App() {
  const { 
    session, profile, studentSession, loading, 
    checkSessions, fetchProfile, logout: handleLogout, studentLogout: handleStudentLogout 
  } = useAuthStore();

  const [activeClass, setActiveClass] = useState(null)
  const [isReEditing, setIsReEditing] = useState(false)
  
  const { 
    internalPage, setInternalPage, 
    directPath, setDirectPath,
    isStudentLoginMode, setIsStudentLoginMode,
    isAdminMode, setAdminMode: setAdminModeHandler
  } = useAppStore();

  // 상태 변경 감지 로그
  useEffect(() => {
  }, [isAdminMode]);

  useEffect(() => {
    checkSessions();

    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          const isAnonymous = session.user?.is_anonymous === true;
          if (isAnonymous) return;

          // 교사 로그인 시 상태 갱신
          useAuthStore.getState().setSession(session);
          useAuthStore.getState().fetchProfile(session.user.id);
        } else {
          useAuthStore.getState().setSession(null);
          useAuthStore.getState().setProfile(null);
        }
      });
      return () => {
        data.subscription.unsubscribe();
      }
    }
  }, [checkSessions])

  // [보안 수정] 교사 프로필 설정 - 서버 사이드 RPC 사용
  const handleTeacherStart = async () => {
    if (!session) return

    const { data, error } = await supabase.rpc('setup_teacher_profile', {
      p_full_name: session.user.user_metadata.full_name,
      p_email: session.user.email
    });

    if (!error && data?.success) {
      fetchProfile(session.user.id);
    } else {
      alert('역할 저장 중 오류가 발생했습니다: ' + (error?.message || data?.error || '알 수 없는 오류'))
    }
  }


  // Supabase 설정이 없을 경우 안내 화면 표시
  if (!supabase) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        textAlign: 'center',
        background: '#f8d7da',
        color: '#721c24'
      }}>
        <h1>🔧 설정 오류 (Configuration Error)</h1>
        <p>Supabase 환경 변수가 설정되지 않았습니다.</p>
        <p>프로젝트 루트의 <code>.env</code> 파일에 <code>VITE_SUPABASE_URL</code>과 <code>VITE_SUPABASE_ANON_KEY</code>를 입력해주세요.</p>
      </div>
    );
  }

  return (
    <Layout full={!!studentSession || (!!session && !!profile)}>
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>
        {loading ? (
          <Loading />
        ) : directPath ? (
          /* [0순위] 직접 주소 접근 시 (약관/개인정보) */
          <div style={{
            padding: '60px 20px',
            maxWidth: '1200px',
            margin: '0 auto',
            width: '100%',
            minHeight: 'calc(100vh - 200px)'
          }}>
            <div style={{
              background: 'white',
              padding: '40px',
              borderRadius: '24px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.05)',
              border: '1px solid #f0f0f0'
            }}>
              <h1 style={{
                fontSize: '2rem',
                marginBottom: '30px',
                color: '#2C3E50',
                borderBottom: '2px solid #F1F3F5',
                paddingBottom: '20px'
              }}>
                {directPath === 'terms' ? '서비스 이용약관 📜' : '개인정보 처리방침 🛡️'}
              </h1>

              <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '10px' }}>
                {directPath === 'terms' ? <TermsOfService /> : <PrivacyPolicy />}
              </div>

              <div style={{ marginTop: '50px', display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={() => {
                    window.history.pushState({}, '', '/');
                    setDirectPath(null);
                  }}
                  style={{
                    padding: '14px 32px',
                    backgroundColor: '#4A90E2',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '1.1rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(74, 144, 226, 0.3)',
                    transition: 'all 0.2s'
                  }}
                >
                  메인 화면으로 가기
                </button>
              </div>
            </div>
          </div>
        ) : session ? (
          /* [1순위] 교사 세션 존재 시 */
          (!profile || !profile.role) ? (
            <TeacherProfileSetup
              email={session.user.email}
              onTeacherStart={handleTeacherStart}
              onLogout={handleLogout}
            />
          ) : (profile?.role === 'ADMIN' && isAdminMode) ? ( /* [0순위] 관리자 모드 활성화 시 최우선 노출 */
            <AdminDashboard
              session={session}
              onLogout={handleLogout}
              onSwitchToTeacherMode={() => setAdminModeHandler(false)}
            />
          ) : (profile?.role !== 'ADMIN' && (!profile?.teacherName || !profile?.schoolName || isReEditing)) ? (
            <TeacherProfileSetup
              email={session.user.email}
              profile={profile}
              onTeacherStart={async () => {
                await handleTeacherStart();
                setIsReEditing(false);
              }}
              onLogout={handleLogout}
            />
          ) : (profile.role !== 'ADMIN' && !profile.is_approved) ? (
            <PendingApproval onLogout={handleLogout} onReEdit={() => setIsReEditing(true)} />
          ) : (
              <TeacherDashboard
                profile={profile}
                session={session}
                activeClass={activeClass}
                setActiveClass={setActiveClass}
                onProfileUpdate={() => fetchProfile(session.user.id)}
                onLogout={handleLogout}
                onNavigate={setInternalPage} // store 액션 직접 전달
                internalPage={internalPage}
                setInternalPage={setInternalPage}
                isAdmin={profile?.role === 'ADMIN'}
                onSwitchToAdminMode={() => setAdminModeHandler(true)}
              />
            )
          ) : studentSession ? (
            /* [2순위] 학생 모드 (교사 세션이 없을 때) */
            <>
              {internalPage.name === 'main' && (
                <StudentDashboard
                  studentSession={studentSession}
                  onLogout={handleStudentLogout}
                  onNavigate={setInternalPage}
                />
              )}
              {internalPage.name === 'mission_list' && (
                <MissionList
                  studentSession={studentSession}
                  onBack={() => setInternalPage('main')}
                  onNavigate={setInternalPage}
                />
              )}
              {internalPage.name === 'writing' && (
                <StudentWriting
                  studentSession={studentSession}
                  missionId={internalPage.params.missionId}
                  params={internalPage.params}
                  onBack={() => setInternalPage('mission_list')}
                  onNavigate={setInternalPage}
                />
              )}
              {internalPage.name === 'friends_hideout' && (
                <FriendsHideout
                  studentSession={studentSession}
                  params={internalPage.params}
                  onBack={() => setInternalPage('main')}
                />
              )}
  
              {/* [신규] 학생용 하단 모바일 내비게이션 (모바일에서만 표시됨) */}
              <Suspense fallback={null}>
                <StudentBottomNav
                  activeTab={internalPage.name}
                  onNavigate={setInternalPage}
                />
              </Suspense>
            </>
        ) : isStudentLoginMode ? (
          /* [3순위] 학생 로그인 화면 */
          <StudentLogin
            onLoginSuccess={async (data) => {
              const sessionData = {
                id: data.id,
                name: data.name,
                code: data.student_code,
                classId: data.class_id,
                className: data.classes?.name,
                role: 'STUDENT'
              };
                useAuthStore.getState().setStudentSession(sessionData);
                setIsStudentLoginMode(false);
                setInternalPage('main');
              }}
              onBack={() => setIsStudentLoginMode(false)}
            />
        ) : (
          /* [4순위] 비로그인 (랜딩 페이지) */
          <LandingPage onStudentLoginClick={() => setIsStudentLoginMode(true)} />
        )}
      </Suspense>
      </ErrorBoundary>
    </Layout>
  )
}

export default App
