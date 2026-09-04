import { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy } from 'react'
import { supabase } from './lib/supabaseClient'
import './App.css'

// 레이아웃 및 공통 컴포넌트
import Layout from './components/layout/Layout'
import Loading from './components/common/Loading'
import BootSkeleton from './components/common/BootSkeleton'
import ErrorBoundary from './components/common/ErrorBoundary'
import PrivacyPolicy from './components/layout/PrivacyPolicy'
import TermsOfService from './components/layout/TermsOfService'
import LearningSupportSoftwareGuide from './components/layout/LearningSupportSoftwareGuide'
import { getBootSkeletonKind, useAuthStore } from './store/useAuthStore';
import { useAppStore } from './store/useAppStore';
import { getEnabledModules, getModule, resolveEnabledModuleIds } from './modules/registry';
import useStudentHomeBootstrap from './modules/home/useStudentHomeBootstrap';
import PriorityWritingNotificationBanner from './modules/notifications/PriorityWritingNotificationBanner';
import { WritingEditorSettingsProvider } from './modules/writing/editor-settings/WritingEditorSettingsContext';
import { DEFAULT_WRITING_EDITOR_SETTINGS } from './modules/writing/editor-settings/settings';
import {
  STUDENT_HOME_ROUTE,
  createStudentHistoryState,
  getStudentActiveBottomTab,
  getStudentBackDestination,
  getStudentBottomNavDestination,
  getStudentRouteKey,
  readStudentHistoryParent,
  readStudentHistoryState
} from './components/student/studentNavigation';

const DEFAULT_STUDENT_EDITOR_SETTINGS = DEFAULT_WRITING_EDITOR_SETTINGS;

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
const LabActivitiesPage = lazy(getModule('lab-activities').studentEntry)
const NeighborAgitStudentEntry = lazy(getModule('neighbor-agit').studentEntry)
const StudentBottomNav = lazy(() => import('./components/student/StudentBottomNav'))
const ClassBoardPresentationPage = lazy(() => import('./modules/tool/class-board/ClassBoardPresentationPage'))

const getClassBoardPresentationId = () => {
  const match = window.location.pathname.match(/^\/class-board\/([0-9a-f-]{36})$/i);
  return match?.[1] || null;
};

/**
 * 역할: 전역 상태 관리 및 라우팅 (메인 진입점)
 * 주요 상태:
 *  - session: 구글 로그인 세션 (선생님용)
 *  - profile: 선생님 프로필 정보
 *  - studentSession: 학생 코드 로그인 데이터
 *  - isStudentLoginMode: 학생 로그인 화면 표시 여부
 *  - currentClassId: 선생님이 선택한 현재 학급 ID
 */
/*
 * 학생이 지금 글을 쓰고 있는 화면인가.
 *
 * 이 동안에는 아래의 주기 동기화를 멈춘다. 화면을 다시 그리면 편집기가 서버 내용을 다시 받아
 * **학생이 쓰던 글을 덮을 수 있기 때문**이다(2026-08-21 일기 사고 — 보완 요청받은 일기를
 * 고쳐 쓰다 원래 글로 되돌아갔다). 편집기 쪽도 함께 고쳤지만, 글 쓰는 중에 화면을 흔들지
 * 않는 것이 더 근본적인 방어다.
 *
 * 과제 글쓰기(`writing`)는 화면 자체가 편집기다. 독서록·일기는 목록과 편집기가 같은 화면
 * 이름을 쓰므로 **편집기를 연 동안만** 멈춘다 — 목록만 보고 있을 때는 평소대로 갱신한다.
 */
const STUDENT_EDITOR_PAGES = new Set(['reading_logs', 'diaries']);
const isStudentComposing = (page) => Boolean(page) && (
    page.name === 'writing'
    || (STUDENT_EDITOR_PAGES.has(page.name) && page.params?.mode === 'editor')
);

// 부팅 뼈대 종류는 첫 렌더 전에 한 번만 정한다. 저장된 세션을 보는 동기 판정이라
// 서버를 기다리지 않고, 도중에 바뀌어 화면이 흔들릴 일도 없다.
const BOOT_SKELETON_KIND = getBootSkeletonKind();
const STUDENT_LOGIN_HISTORY_PAGE = 'student-login';

function App() {
  const classBoardPresentationId = getClassBoardPresentationId();
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
  const studentRouteKey = getStudentRouteKey(internalPage);
  const neighborAgitAvailable = enabledStudentModules.some((module) => module.id === 'neighbor-agit')
    && studentHomeBootstrap?.home?.neighbor_agit_available === true
    && Boolean(studentHomeBootstrap?.home?.neighbor_agit_space_id);
  // 하단 내비의 '나의 아지트'는 페이지가 아니라 홈 위에 뜨는 판이라,
  // 홈으로 보낸 뒤 일회용 신호로 열고, 실제로 열린 판을 따로 기억해 하단 메뉴 강조를 맞춘다.
  const [myAgitSignal, setMyAgitSignal] = useState(0);
  const [playgroundSignal, setPlaygroundSignal] = useState(0);
  const [dashboardResetSignal, setDashboardResetSignal] = useState(0);
  const [studentNavOverlay, setStudentNavOverlay] = useState(null);
  const studentBottomActiveTab = getStudentActiveBottomTab(studentPageName, studentNavOverlay);
  const handleMyAgitSignalHandled = useCallback(() => setMyAgitSignal(0), []);
  const handlePlaygroundSignalHandled = useCallback(() => setPlaygroundSignal(0), []);

  // 코드 로그인도 브라우저 방문 기록의 한 단계로 둔다. 같은 탭에서 연구소를 보고 왔더라도
  // 기기·브라우저 뒤로가기가 연구소까지 빠져나가지 않고 아지트 첫 화면에 먼저 머물게 한다.
  const handleOpenStudentLogin = useCallback(() => {
    window.history.pushState({ publicPage: STUDENT_LOGIN_HISTORY_PAGE }, '', '/');
    setIsStudentLoginMode(true);
  }, [setIsStudentLoginMode]);

  const handleStudentLoginBack = useCallback(() => {
    if (window.history.state?.publicPage === STUDENT_LOGIN_HISTORY_PAGE) {
      window.history.back();
      return;
    }
    setIsStudentLoginMode(false);
  }, [setIsStudentLoginMode]);

  useEffect(() => {
    if (studentSession) return undefined;

    const syncPublicPage = (state) => {
      setIsStudentLoginMode(state?.publicPage === STUDENT_LOGIN_HISTORY_PAGE);
    };
    const handlePublicPop = (event) => syncPublicPage(event.state);

    // 코드 로그인 화면에서 새로고침한 경우에도 같은 화면을 복원한다.
    syncPublicPage(window.history.state);
    window.addEventListener('popstate', handlePublicPop);
    return () => window.removeEventListener('popstate', handlePublicPop);
  }, [setIsStudentLoginMode, studentSession]);

  // 학생 화면 뒤로가기: 그동안 처리가 없어 태블릿·폰에서 뒤로가기를 누르면 앱이 닫혔다.
  // 페이지가 바뀔 때 히스토리를 쌓고, 뒤로가기가 오면 그 페이지로 되돌린다.
  const skipHistoryPushRef = useRef(false);
  const lastStudentRouteRef = useRef(null);
  const previousStudentHomePageRef = useRef(null);
  const studentDeepLinkHandledRef = useRef(false);

  // 연구소에서 돌아온 학생을 글쓰기 연구소 목록으로 바로 연결한다.
  // 허용한 단일 화면만 처리하고 URL의 신호는 한 번 사용한 뒤 제거한다.
  useEffect(() => {
    if (!studentSession || studentDeepLinkHandledRef.current) return;
    studentDeepLinkHandledRef.current = true;

    const url = new URL(window.location.href);
    if (url.searchParams.get('studentPage') !== 'lab_activities') return;

    setInternalPage('lab_activities');
    url.searchParams.delete('studentPage');
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`
    );
  }, [setInternalPage, studentSession]);

  useEffect(() => {
    if (!studentSession) { lastStudentRouteRef.current = null; return; }
    const currentRoute = { name: internalPage.name, params: internalPage.params };
    if (skipHistoryPushRef.current) {
      skipHistoryPushRef.current = false;
      lastStudentRouteRef.current = currentRoute;
      return;
    }
    const previousRoute = lastStudentRouteRef.current;
    if (lastStudentRouteRef.current === null) {
      window.history.replaceState(createStudentHistoryState(currentRoute.name, currentRoute.params), '');
    } else if (getStudentRouteKey(previousRoute) !== studentRouteKey) {
      const recordedParent = readStudentHistoryParent(window.history.state);
      if (recordedParent && getStudentRouteKey(recordedParent) === studentRouteKey) {
        window.history.back();
      } else {
        window.history.pushState(
          createStudentHistoryState(currentRoute.name, currentRoute.params, previousRoute),
          ''
        );
      }
    }
    lastStudentRouteRef.current = currentRoute;
  }, [internalPage, studentRouteKey, studentSession]);

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
      const target = readStudentHistoryState(event.state);
      skipHistoryPushRef.current = true;
      setInternalPage(target.name, target.params);
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [studentSession, setInternalPage]);

  const replaceStudentRoute = useCallback((route) => {
    const nextRoute = route || STUDENT_HOME_ROUTE;
    window.history.replaceState(
      createStudentHistoryState(nextRoute.name, nextRoute.params),
      ''
    );
    lastStudentRouteRef.current = nextRoute;
    setStudentNavOverlay(null);
    setMyAgitSignal(0);
    setPlaygroundSignal(0);
    setDashboardResetSignal((value) => value + 1);
    setInternalPage(nextRoute.name, nextRoute.params);
  }, [setInternalPage]);

  // 홈 카드가 사라진 뒤 저장된 방문 기록이나 임의 상태로 다시 들어와도 내용은 열지 않는다.
  // 실제 RPC도 같은 공개 단계·학급 스위치·참여 조건을 다시 확인한다.
  useEffect(() => {
    if (studentPageName !== 'neighbor_agit' || studentHomeBootstrapLoading) return;
    if (!neighborAgitAvailable) replaceStudentRoute(STUDENT_HOME_ROUTE);
  }, [neighborAgitAvailable, replaceStudentRoute, studentHomeBootstrapLoading, studentPageName]);

  // 화면 안의 뒤로가기는 새 방문 기록을 만들지 않고 정해진 부모 화면으로 교체한다.
  // 과제 편집기는 과제 목록, 과제에서 연 친구 글은 과제 목록, 나머지 메뉴는 모두 홈이 부모다.
  const handleCurrentStudentBack = useCallback(() => {
    const destination = getStudentBackDestination(internalPage);
    const recordedParent = readStudentHistoryParent(window.history.state);
    if (recordedParent && getStudentRouteKey(recordedParent) === getStudentRouteKey(destination)) {
      setStudentNavOverlay(null);
      setMyAgitSignal(0);
      setPlaygroundSignal(0);
      setDashboardResetSignal((value) => value + 1);
      window.history.back();
      return;
    }
    replaceStudentRoute(destination);
  }, [internalPage, replaceStudentRoute]);

  // 하단 메뉴끼리 이동할 때 현재 메뉴를 홈으로 바꾼 뒤 새 메뉴를 쌓는다.
  // 따라서 어느 메뉴에서 다른 메뉴로 옮겼더라도 기기 뒤로가기는 직전 메뉴가 아니라 홈으로 간다.
  const handleStudentBottomNavigation = useCallback((tabId) => {
    const destination = getStudentBottomNavDestination(tabId);
    const destinationRoute = { name: destination.pageName, params: destination.params };
    const destinationKey = getStudentRouteKey(destinationRoute);
    const samePage = !destination.overlay
      && !studentNavOverlay
      && !window.history.state?.overlay
      && studentRouteKey === destinationKey;
    const sameOverlay = destination.overlay
      && studentNavOverlay === destination.overlay
      && studentPageName === 'main';
    if (samePage || sameOverlay) return;

    const isHomeBase = studentPageName === 'main'
      && !studentNavOverlay
      && !window.history.state?.overlay;
    if (!isHomeBase) {
      window.history.replaceState(
        createStudentHistoryState(STUDENT_HOME_ROUTE.name, STUDENT_HOME_ROUTE.params),
        ''
      );
      lastStudentRouteRef.current = STUDENT_HOME_ROUTE;
    }

    if (destination.overlay === 'my_agit') {
      setStudentNavOverlay('my_agit');
      setPlaygroundSignal(0);
      setMyAgitSignal((value) => value + 1);
    } else if (destination.overlay === 'playground') {
      setStudentNavOverlay('playground');
      setMyAgitSignal(0);
      setPlaygroundSignal((value) => value + 1);
    } else {
      setStudentNavOverlay(null);
      setMyAgitSignal(0);
      setPlaygroundSignal(0);
      setDashboardResetSignal((value) => value + 1);
    }
    setInternalPage(destination.pageName, destination.params);
  }, [setInternalPage, studentNavOverlay, studentPageName, studentRouteKey]);
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

  // 판정은 효과 밖에서 한 번만 한다. 효과가 `internalPage` 전체에 기대면 params 가 바뀔 때마다
  // 타이머와 이벤트가 통째로 다시 붙는다.
  const studentIsComposing = isStudentComposing(internalPage);

  useEffect(() => {
    if (!studentSession) return undefined;
    if (studentIsComposing) return undefined;

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
  }, [studentSession, verifyStudentSession, refreshStudentHome, internalPage?.name, studentIsComposing]);

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

  // 새 탭 발표 화면은 교사 대시보드·푸터를 그리지 않는다. 데이터 권한은 발표 전용 RPC가
  // board_id에서 학급을 다시 찾고 현재 로그인 교사의 담당 학급인지 확인한다.
  if (classBoardPresentationId) {
    if (loading || profileLoading) return <Loading />;
    if (!session || !profile || (profile.role !== 'ADMIN' && !profile.is_approved)) {
      return (
        <div className="class-board-presentation-state is-error">
          <span>🔒</span><h1>교사 로그인이 필요합니다.</h1>
          <p>로그인한 교사만 우리 반 스크린을 열 수 있습니다.</p>
          <a href="/">로그인 화면으로 이동</a>
        </div>
      );
    }
    return (
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>
          <ClassBoardPresentationPage boardId={classBoardPresentationId} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <Layout full={!!studentSession || (!!session && !!profile)}>
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>
        {loading ? (
          /* 세션 종류를 알면 실제 홈과 같은 자리에 틀을 먼저 그린다. 연구소에서 돌아올 때
             화면이 처음부터 다시 시작하는 것처럼 보이던 문제(2026-08-17)를 줄인다.
             종류를 모르면(첫 방문·로그아웃) 기존 안내 문구를 그대로 쓴다. */
          BOOT_SKELETON_KIND ? <BootSkeleton kind={BOOT_SKELETON_KIND} /> : <Loading />
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
              {studentHomeBootstrap?.generated_at && (
                <PriorityWritingNotificationBanner
                  key={studentSession.id}
                  studentId={studentSession.id}
                  initialCursorCreatedAt={studentHomeBootstrap.generated_at}
                />
              )}
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
                  dashboardResetSignal={dashboardResetSignal}
                  onMyAgitSignalHandled={handleMyAgitSignalHandled}
                  onPlaygroundSignalHandled={handlePlaygroundSignalHandled}
                  onActiveNavChange={setStudentNavOverlay}
                />
              )}
              {studentPageName === 'mission_list' && (
                <MissionList
                  studentSession={studentSession}
                  onBack={handleCurrentStudentBack}
                  onNavigate={setInternalPage}
                />
              )}
              {studentPageName === 'writing' && (
                <StudentWriting
                  studentSession={studentSession}
                  missionId={internalPage.params.missionId}
                  params={internalPage.params}
                  onBack={handleCurrentStudentBack}
                  onNavigate={setInternalPage}
                />
              )}
              {studentPageName === 'reading_logs' && (
                <ReadingLogPage
                  studentSession={studentSession}
                  params={internalPage.params}
                  onBack={handleCurrentStudentBack}
                  onNavigate={setInternalPage}
                />
              )}
              {studentPageName === 'diaries' && (
                <DiaryPage
                  studentSession={studentSession}
                  params={internalPage.params}
                  onBack={handleCurrentStudentBack}
                  onNavigate={setInternalPage}
                />
              )}
              {studentPageName === 'friends_hideout' && (
                <FriendsHideout
                  studentSession={studentSession}
                  params={internalPage.params}
                  onBack={handleCurrentStudentBack}
                />
              )}
              {studentPageName === 'lab_activities' && (
                <LabActivitiesPage
                  studentSession={studentSession}
                  params={internalPage.params}
                  onBack={handleCurrentStudentBack}
                  onNavigate={setInternalPage}
                />
              )}
              {studentPageName === 'neighbor_agit' && neighborAgitAvailable && (
                <NeighborAgitStudentEntry
                    spaceId={studentHomeBootstrap.home.neighbor_agit_space_id}
                    onNavigate={setInternalPage}
                    onBack={handleCurrentStudentBack}
                />
              )}
  
              {/* [신규] 학생용 하단 모바일 내비게이션 (모바일에서만 표시됨) */}
              <Suspense fallback={null}>
                <StudentBottomNav
                  activeTab={studentBottomActiveTab}
                  onNavigate={handleStudentBottomNavigation}
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
              onBack={handleStudentLoginBack}
            />
        ) : (
          /* [4순위] 비로그인 (랜딩 페이지) */
          <LandingPage onStudentLoginClick={handleOpenStudentLogin} />
        )}
        </Suspense>
      </ErrorBoundary>
    </Layout>
  )
}

export default App
