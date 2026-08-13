import { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy } from 'react'
import { supabase } from './lib/supabaseClient'
import './App.css'

// 레이아웃 및 공통 컴포넌트
import Layout from './components/layout/Layout'
import Loading from './components/common/Loading'
import ErrorBoundary from './components/common/ErrorBoundary'
import PrivacyPolicy from './components/layout/PrivacyPolicy'
import TermsOfService from './components/layout/TermsOfService'
import LearningSupportSoftwareGuide from './components/layout/LearningSupportSoftwareGuide'
import { useAuthStore } from './store/useAuthStore';
import { useAppStore } from './store/useAppStore';
import { getEnabledModules, getModule, resolveEnabledModuleIds } from './modules/registry';
import useStudentHomeBootstrap from './modules/home/useStudentHomeBootstrap';
import { WritingEditorSettingsProvider } from './modules/writing/editor-settings/WritingEditorSettingsContext';

const DEFAULT_STUDENT_EDITOR_SETTINGS = Object.freeze({ enabled_tools: ['spelling-lookup'] });

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
const FriendsHideout = lazy(getModule('friends-hideout').studentEntry)
const ReadingLogPage = lazy(getModule('reading-log').studentEntry)
const DiaryPage = lazy(getModule('diary').studentEntry)
const StudentBottomNav = lazy(() => import('./components/student/StudentBottomNav'))

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
    session, profile, teacherBootstrap, studentSession, loading, profileLoading,
    checkSessions, fetchProfile, verifyStudentSession, logout: handleLogout, studentLogout: handleStudentLogout 
  } = useAuthStore();

  const [activeClass, setActiveClass] = useState(null)
  const [isReEditing, setIsReEditing] = useState(false)
  
  const { 
    internalPage, setInternalPage, 
    directPath, setDirectPath,
    isStudentLoginMode, setIsStudentLoginMode,
    isAdminMode, setAdminMode: setAdminModeHandler
  } = useAppStore();

  const {
    data: studentHomeBootstrap,
    loading: studentHomeBootstrapLoading,
    refresh: refreshStudentHome,
    refreshIfStale: refreshStudentHomeIfStale
  } = useStudentHomeBootstrap(studentSession);
  // 홈 RPC가 받은 같은 학급 설정을 앱 셸·메뉴·편집기가 함께 쓴다.
  const enabledStudentModules = useMemo(() => {
    if (!studentSession || !studentHomeBootstrap?.class_config) return [];
    const config = studentHomeBootstrap.class_config;
    const ids = resolveEnabledModuleIds(config.enabled_modules, config);
    return getEnabledModules(ids, 'student');
  }, [studentHomeBootstrap, studentSession]);
  const studentPageName = internalPage.name;
  // 하단 내비의 '나의 아지트'는 페이지가 아니라 홈 위에 뜨는 판이라,
  // 홈으로 보낸 뒤 이 값을 올려 대시보드에 "열어라"라고 알린다.
  const [myAgitSignal, setMyAgitSignal] = useState(0);
  const [playgroundSignal, setPlaygroundSignal] = useState(0);
  // 입력 화면에 넘기는 라우팅 콜백은 안정된 참조를 유지한다.
  // 주기적인 앱 셸 갱신이 글 초기 로드의 신호로 오인되는 회귀를 이 경계에서도 막는다.
  const handleStudentWritingBack = useCallback(
    () => setInternalPage('mission_list'),
    [setInternalPage]
  );

  // 학생 화면 뒤로가기: 그동안 처리가 없어 태블릿·폰에서 뒤로가기를 누르면 앱이 닫혔다.
  // 페이지가 바뀔 때 히스토리를 쌓고, 뒤로가기가 오면 그 페이지로 되돌린다.
  const skipHistoryPushRef = useRef(false);
  const lastStudentPageRef = useRef(null);
  const previousStudentHomePageRef = useRef(null);

  useEffect(() => {
    if (!studentSession) { lastStudentPageRef.current = null; return; }
    if (skipHistoryPushRef.current) {
      skipHistoryPushRef.current = false;
      lastStudentPageRef.current = studentPageName;
      return;
    }
    if (lastStudentPageRef.current === null) {
      window.history.replaceState({ studentPage: studentPageName }, '');
    } else if (lastStudentPageRef.current !== studentPageName) {
      window.history.pushState({ studentPage: studentPageName }, '');
    }
    lastStudentPageRef.current = studentPageName;
  }, [studentSession, studentPageName]);

  useEffect(() => {
    if (!studentSession) {
      previousStudentHomePageRef.current = null;
      return;
    }
    const previousPage = previousStudentHomePageRef.current;
    previousStudentHomePageRef.current = studentPageName;
    if (studentPageName === 'main' && previousPage && previousPage !== 'main') {
      void refreshStudentHomeIfStale();
    }
  }, [refreshStudentHomeIfStale, studentPageName, studentSession]);

  useEffect(() => {
    if (!studentSession) return undefined;
    const handlePop = (event) => {
      const target = event.state?.studentPage || 'main';
      skipHistoryPushRef.current = true;
      setInternalPage(target);
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [studentSession, setInternalPage]);
  // 상태 변경 감지 로그
  useEffect(() => {
  }, [isAdminMode]);

  useEffect(() => {
    let authSubscription = null;
    let cancelled = false;

    const initializeAuth = async () => {
      await checkSessions();
      if (!supabase || cancelled) return;

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
          useAuthStore.getState().setTeacherBootstrap(null);
        }
      });
      authSubscription = data.subscription;
    };

    void initializeAuth();
    return () => {
      cancelled = true;
      authSubscription?.unsubscribe();
    };
  }, [checkSessions])

  useEffect(() => {
    if (!studentSession) return undefined;
    if (internalPage?.name === 'writing') return undefined;

    let active = true;
    let syncInFlight = false;
    let lastSyncAt = Date.now();
    let focusTimerId = null;
    let periodicTimerId = null;

    const syncActiveStudent = async () => {
      if (!active || syncInFlight) return;
      syncInFlight = true;
      try {
        const valid = await useAuthStore.getState().verifyStudentSession({ notify: true });
        if (valid && active) await refreshStudentHome({ force: true });
        lastSyncAt = Date.now();
      } finally {
        syncInFlight = false;
      }
    };

    const queueFocusSync = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastSyncAt < 60000) return;
      if (focusTimerId) window.clearTimeout(focusTimerId);
      focusTimerId = window.setTimeout(() => {
        focusTimerId = null;
        void syncActiveStudent();
      }, Math.floor(Math.random() * 5000));
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') queueFocusSync();
    };

    const scheduleVerification = () => {
      // 인증 확인과 홈 갱신을 한 주기로 묶고, 모든 교실이 같은 순간 치지 않도록 분산한다.
      const delay = 240000 + Math.floor(Math.random() * 120000);
      periodicTimerId = window.setTimeout(async () => {
        await syncActiveStudent();
        if (active) scheduleVerification();
      }, delay);
    };
    scheduleVerification();
    window.addEventListener('focus', queueFocusSync);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      if (focusTimerId) window.clearTimeout(focusTimerId);
      if (periodicTimerId) window.clearTimeout(periodicTimerId);
      window.removeEventListener('focus', queueFocusSync);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [studentSession, verifyStudentSession, refreshStudentHome, internalPage?.name]);

  // [보안 수정] 교사 프로필 설정 - 서버 사이드 RPC 사용
  const handleTeacherStart = async () => {
    if (!session) return

    const { data, error } = await supabase.rpc('setup_teacher_profile', {
      p_full_name: session.user.user_metadata.full_name,
      p_email: session.user.email,
      p_api_mode: 'SYSTEM'
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
          /* [0순위] 직접 주소 접근 시 (약관/개인정보/학습지원소프트웨어 안내) */
          <div style={{
            padding: '60px 20px',
            maxWidth: '1200px',
            margin: '0 auto',
            width: '100%',
            minHeight: 'calc(100vh - 200px)'
          }}>
            <div style={{
              background: 'white',
              padding: directPath === 'learning-support-software' ? 'clamp(20px, 4vw, 40px)' : '40px',
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
                {directPath === 'terms'
                  ? '서비스 이용약관 📜'
                  : directPath === 'learning-support-software'
                    ? '학습지원소프트웨어 선정기준 안내 🏫'
                    : '개인정보 처리방침 🛡️'}
              </h1>

              <div style={{
                maxHeight: directPath === 'learning-support-software' ? 'none' : '60vh',
                overflowY: directPath === 'learning-support-software' ? 'visible' : 'auto',
                paddingRight: directPath === 'learning-support-software' ? 0 : '10px'
              }}>
                {directPath === 'terms'
                  ? <TermsOfService />
                  : directPath === 'learning-support-software'
                    ? <LearningSupportSoftwareGuide />
                    : <PrivacyPolicy />}
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
          profileLoading && !profile ? (
            <Loading />
          ) : (!profile || !profile.role) ? (
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
                teacherBootstrap={teacherBootstrap}
                session={session}
                activeClass={activeClass}
                setActiveClass={setActiveClass}
                onProfileUpdate={() => fetchProfile(session.user.id, { force: true, touchLogin: false })}
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
            <WritingEditorSettingsProvider
              classId={studentSession?.classId || studentSession?.class_id}
              overrideSettings={studentHomeBootstrap?.class_config?.writing_editor_settings || DEFAULT_STUDENT_EDITOR_SETTINGS}
            >
              {studentPageName === 'main' && (
                <StudentDashboard
                  studentSession={studentSession}
                  onLogout={handleStudentLogout}
                  onNavigate={setInternalPage}
                  enabledModules={enabledStudentModules}
                  homeBootstrap={studentHomeBootstrap}
                  homeBootstrapLoading={studentHomeBootstrapLoading}
                  onRefreshHome={refreshStudentHome}
                  myAgitSignal={myAgitSignal}
                  playgroundSignal={playgroundSignal}
                />
              )}
              {studentPageName === 'mission_list' && (
                <MissionList
                  studentSession={studentSession}
                  onBack={() => setInternalPage('main')}
                  onNavigate={setInternalPage}
                />
              )}
              {studentPageName === 'writing' && (
                <StudentWriting
                  studentSession={studentSession}
                  missionId={internalPage.params.missionId}
                  params={internalPage.params}
                  onBack={handleStudentWritingBack}
                  onNavigate={setInternalPage}
                />
              )}
              {studentPageName === 'reading_logs' && (
                <ReadingLogPage
                  studentSession={studentSession}
                  params={internalPage.params}
                  onBack={() => setInternalPage('main')}
                  onNavigate={setInternalPage}
                />
              )}
              {studentPageName === 'diaries' && (
                <DiaryPage
                  studentSession={studentSession}
                  params={internalPage.params}
                  onBack={() => setInternalPage('main')}
                  onNavigate={setInternalPage}
                />
              )}
              {studentPageName === 'friends_hideout' && (
                <FriendsHideout
                  studentSession={studentSession}
                  params={internalPage.params}
                  onBack={() => setInternalPage(internalPage.params?.returnTo || 'main')}
                />
              )}
  
              {/* [신규] 학생용 하단 모바일 내비게이션 (모바일에서만 표시됨) */}
              <Suspense fallback={null}>
                <StudentBottomNav
                  activeTab={studentPageName}
                  onNavigate={setInternalPage}
                  onOpenMyAgit={() => setMyAgitSignal((n) => n + 1)}
                  onOpenPlayground={() => setPlaygroundSignal((n) => n + 1)}
                />
              </Suspense>
            </WritingEditorSettingsProvider>
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
