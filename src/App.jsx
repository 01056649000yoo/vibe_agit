import { useState, useEffect, Suspense, lazy } from 'react'
import { supabase } from './lib/supabaseClient'
import './App.css'

// 레이아웃 및 공통 컴포넌트
import Layout from './components/layout/Layout'
import Loading from './components/common/Loading'

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
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [studentSession, setStudentSession] = useState(null)
  const [activeClass, setActiveClass] = useState(null)
  const [isStudentLoginMode, setIsStudentLoginMode] = useState(false)
  const [internalPage, setInternalPage] = useState({ name: 'main', params: {} }) // { name, params }
  const [loading, setLoading] = useState(true)
  /* [수정] 관리자 모드 상태를 localStorage와 연동하여 유지 (기본값: false = 교사 대시보드) */
  const [isAdminMode, setIsAdminMode] = useState(() => {
    try {
      // 키 변경으로 캐시/기존 값 간섭 배제
      const saved = localStorage.getItem('app_admin_mode_v2');

      if (saved === 'false') return false;
      if (saved === 'true') return true;

      // 저장된 값이 없으면 기본적으로 false (교사 모드)
      return false;
    } catch (e) {
      return false;
    }
  });

  // 관리자 모드 변경 시 localStorage 업데이트
  const setAdminModeHandler = (mode) => {
    setIsAdminMode(mode);
    localStorage.setItem('app_admin_mode_v2', JSON.stringify(mode));
  };

  // 상태 변경 감지 로그
  useEffect(() => {
  }, [isAdminMode]);

  useEffect(() => {
    // 앱 실행 시 현재 로그인 세션 확인 및 충돌 방지
    const checkSessions = async () => {

      // [안전장치] Supabase 클라이언트가 없을 경우 중단
      if (!supabase) return;

      // 1. 구글 로그인(교사) 세션 확인
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        // 교사 세션이 있으면 학생 세션 데이터 강제 초기화
        localStorage.removeItem('student_session');
        setStudentSession(null);
        setSession(session);
        await fetchProfile(session.user.id);
      } else {
        // 2. 학생 코드 로그인 확인 (교사 세션이 없을 때만)
        const savedStudent = localStorage.getItem('student_session');
        if (savedStudent) {
          setStudentSession(JSON.parse(savedStudent));
        }
      }
      setLoading(false);
    };

    checkSessions();

    // 로그인 상태 변화를 감지
    let subscription = null;
    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          // 교사 로그인 시 학생 데이터 즉시 폐기
          localStorage.removeItem('student_session');
          setStudentSession(null);
          setSession(session);
          fetchProfile(session.user.id);
          // setIsAdminMode(true); // 로그인 시 관리자 모드 리셋 (제거: 창 전환 시 초기화 방지)
        } else {
          setSession(null);
          setProfile(null);
        }
      });
      subscription = data.subscription;
    }

    return () => {
      if (subscription) subscription.unsubscribe();
    }
  }, [])

  // DB에서 사용자 프로필 정보 가져오기 (교사 기본 정보 포함)
  const fetchProfile = async (userId) => {
    // 1. 프로필 정보와 교사 정보를 병렬로 가져오기 (Waterfalls 제거)
    const [profileResult, teacherResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single(),
      supabase
        .from('teachers')
        .select('name, school_name')
        .eq('id', userId)
        .single()
    ]);

    const profileData = profileResult.data;
    const teacherData = teacherResult.data;

    setProfile({ ...profileData, teacherName: teacherData?.name, schoolName: teacherData?.school_name })
  }

  // 역할을 'TEACHER'로 저장하는 함수
  const handleTeacherStart = async () => {
    if (!session) return

    // 1. 자동 승인 설정 확인
    let autoApprove = false;
    try {
      const { data: settings } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'auto_approval')
        .maybeSingle();

      if (settings) {
        autoApprove = (settings.value === true);
      }
    } catch (e) {
      console.warn("시스템 설정 확인 실패 (수동 승인 기본값 적용):", e);
    }

    // 2. 기존 프로필 정보가 있는지 먼저 확인 (기존 필드 보존을 위해)
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: session.user.id,
        role: 'TEACHER',
        email: session.user.email,
        full_name: session.user.user_metadata.full_name,
        // 자동 승인 설정이 켜져 있거나, 이미 승인된 계정인 경우 true
        is_approved: autoApprove || existingProfile?.is_approved || false,
        // 기존 데이터가 있다면 보존하고, 없으면 NULL
        gemini_api_key: existingProfile?.gemini_api_key || null
      });

    if (!error) fetchProfile(session.user.id)
    else alert('역할 저장 중 오류가 발생했습니다: ' + error.message)
  }

  // 로그아웃 통합 처리 (교사/학생 공용 가능하도록 강화)
  const handleLogout = async () => {
    try {
      // 1. 서버 로그아웃 요청 (세션이 이미 무효화된 경우 403 등이 발생할 수 있음)
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.warn('Logout server request failed (ignoring):', err);
    } finally {
      // 2. 서버 결과와 상관없이 로컬 상태 및 스토리지 강제 클리어
      localStorage.clear();
      sessionStorage.clear();

      // 3. 즉시 리로드하여 초기 상태로 복구
      window.location.href = '/';
    }
  }

  // 학생 로그아웃 처리 (명시적 별도 함수 유지 - UI 호출용)
  const handleStudentLogout = () => {
    handleLogout();
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
      <Suspense fallback={<Loading />}>
        {loading ? (
          <Loading />
        ) : session ? (
          /* [1순위] 교사 세션 존재 시 (프로필 또는 선생님 정보 미설정 포함) */
          (!profile || !profile.role || !profile.teacherName || !profile.schoolName) ? (
            <TeacherProfileSetup
              email={session.user.email}
              onTeacherStart={handleTeacherStart}
              onLogout={handleLogout}
            />
          ) : (profile.role === 'ADMIN' && isAdminMode) ? ( /* [0순위] 관리자 확인 + 관리자 모드 */
            <AdminDashboard
              session={session}
              onLogout={handleLogout}
              onSwitchToTeacherMode={() => setAdminModeHandler(false)}
            />
          ) : !profile.is_approved ? ( /* [1.5순위] 승인 대기 확인 */
            <PendingApproval onLogout={handleLogout} />
          ) : (
            <TeacherDashboard
              profile={profile}
              session={session}
              activeClass={activeClass}
              setActiveClass={setActiveClass}
              onProfileUpdate={() => fetchProfile(session.user.id)}
              onLogout={handleLogout}
              onNavigate={(page, params) => setInternalPage({ name: page, params })}
              internalPage={internalPage}
              setInternalPage={setInternalPage}
              isAdmin={profile.role === 'ADMIN'}
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
                onNavigate={(page, params) => setInternalPage({ name: page, params })}
              />
            )}
            {internalPage.name === 'mission_list' && (
              <MissionList
                studentSession={studentSession}
                onBack={() => setInternalPage({ name: 'main', params: {} })}
                onNavigate={(page, params) => setInternalPage({ name: page, params })}
              />
            )}
            {internalPage.name === 'writing' && (
              <StudentWriting
                studentSession={studentSession}
                missionId={internalPage.params.missionId}
                params={internalPage.params}
                onBack={() => setInternalPage({ name: 'mission_list', params: {} })}
                onNavigate={(page, params) => setInternalPage({ name: page, params })}
              />
            )}
            {internalPage.name === 'friends_hideout' && (
              <FriendsHideout
                studentSession={studentSession}
                params={internalPage.params}
                onBack={() => setInternalPage({ name: 'main', params: {} })}
              />
            )}

            {/* [신규] 학생용 하단 모바일 내비게이션 (모바일에서만 표시됨) */}
            <Suspense fallback={null}>
              <StudentBottomNav
                activeTab={internalPage.name}
                onNavigate={(page, params) => setInternalPage({ name: page, params })}
              />
            </Suspense>
          </>
        ) : isStudentLoginMode ? (
          /* [3순위] 학생 로그인 화면 */
          <StudentLogin
            onLoginSuccess={async (data) => {
              // 학생 로그인 시 만약 교사 세션이 남아있다면 강제 로그아웃 (에러 무시)
              if (session) {
                try {
                  await supabase.auth.signOut();
                } catch (e) {
                  console.warn("Cleanup signout failed:", e);
                }
              }

              const sessionData = {
                id: data.id,
                name: data.name,
                code: data.student_code,
                classId: data.class_id,
                className: data.classes?.name,
                role: 'STUDENT'
              };
              setStudentSession(sessionData);
              setIsStudentLoginMode(false);
              setInternalPage({ name: 'main', params: {} });
            }}
            onBack={() => setIsStudentLoginMode(false)}
          />
        ) : (
          /* [4순위] 비로그인 (랜딩 페이지) */
          <LandingPage onStudentLoginClick={() => setIsStudentLoginMode(true)} />
        )}
      </Suspense>
    </Layout>
  )
}

export default App
