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
const StudentWriting = lazy(() => import('./components/student/StudentWriting'))
const MissionList = lazy(() => import('./components/student/MissionList'))
const FriendsHideout = lazy(() => import('./components/student/FriendsHideout'))

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

  useEffect(() => {
    // 앱 실행 시 현재 로그인 세션 확인 및 충돌 방지
    const checkSessions = async () => {
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        // 교사 로그인 시 학생 데이터 즉시 폐기
        localStorage.removeItem('student_session');
        setStudentSession(null);
        setSession(session);
        fetchProfile(session.user.id);
      } else {
        setSession(null);
        setProfile(null);
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // DB에서 사용자 프로필 정보 가져오기 (교사 기본 정보 포함)
  const fetchProfile = async (userId) => {
    // 1. 기본 프로필 정보 가져오기
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    // 2. 교사 전용 정보(별칭, 학교명) 가져오기
    const { data: teacherData } = await supabase
      .from('teachers')
      .select('name, school_name')
      .eq('id', userId)
      .single()

    setProfile({ ...profileData, teacherName: teacherData?.name, schoolName: teacherData?.school_name })
  }

  // 역할을 'TEACHER'로 저장하는 함수
  const handleTeacherStart = async () => {
    if (!session) return

    // 1. 기존 프로필 정보가 있는지 먼저 확인 (기존 필드 보존을 위해)
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
        // 기존 데이터가 있다면 보존하고, 없으면 NULL
        gemini_api_key: existingProfile?.gemini_api_key || null
      });

    if (!error) fetchProfile(session.user.id)
    else alert('역할 저장 중 오류가 발생했습니다: ' + error.message)
  }

  // 로그아웃 통합 처리 (교사/학생 공용 가능하도록 강화)
  const handleLogout = async () => {
    // 모든 유무형 세션 데이터 초기화
    await supabase.auth.signOut();
    localStorage.clear();
    setSession(null);
    setProfile(null);
    setStudentSession(null);
    setIsStudentLoginMode(false);
    setInternalPage({ name: 'main', params: {} });
  }

  // 학생 로그아웃 처리 (명시적 별도 함수 유지 - UI 호출용)
  const handleStudentLogout = () => {
    handleLogout();
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
            />
          ) : (
            <TeacherDashboard
              profile={profile}
              session={session}
              activeClass={activeClass}
              setActiveClass={setActiveClass}
              onProfileUpdate={() => fetchProfile(session.user.id)}
              onNavigate={(page, params) => setInternalPage({ name: page, params })}
              internalPage={internalPage}
              setInternalPage={setInternalPage}
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
          </>
        ) : isStudentLoginMode ? (
          /* [3순위] 학생 로그인 화면 */
          <StudentLogin
            onLoginSuccess={async (data) => {
              // 학생 로그인 시 만약 교사 세션이 남아있다면 강제 로그아웃
              if (session) await supabase.auth.signOut();

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
