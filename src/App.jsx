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
  const [currentClassId, setCurrentClassId] = useState(null)
  const [isStudentLoginMode, setIsStudentLoginMode] = useState(false)
  const [internalPage, setInternalPage] = useState({ name: 'main', params: {} }) // { name, params }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 앱 실행 시 현재 로그인 세션 확인
    const checkSessions = async () => {
      // 1. 구글 로그인 확인
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      if (session) await fetchProfile(session.user.id);

      // 2. 학생 코드 로그인 확인 (LocalStorage)
      const savedStudent = localStorage.getItem('student_session');
      if (savedStudent) {
        setStudentSession(JSON.parse(savedStudent));
      }
      setLoading(false);
    };

    checkSessions();

    // 로그인 상태 변화를 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setProfile(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // DB에서 사용자 프로필 정보 가져오기
  const fetchProfile = async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
  }

  // 역할을 'TEACHER'로 저장하는 함수
  const handleTeacherStart = async () => {
    if (!session) return

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: session.user.id,
        role: 'TEACHER',
        email: session.user.email,
        full_name: session.user.user_metadata.full_name
      })

    if (!error) fetchProfile(session.user.id)
    else alert('역할 저장 중 오류가 발생했습니다: ' + error.message)
  }

  // 학생 로그아웃 처리
  const handleStudentLogout = () => {
    localStorage.removeItem('student_session');
    setStudentSession(null);
  }

  return (
    <Layout>
      <Suspense fallback={<Loading />}>
        {loading ? (
          <Loading />
        ) : studentSession ? (
          /* [1순위] 학생 모드 */
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
                onBack={() => setInternalPage({ name: 'mission_list', params: {} })}
              />
            )}
          </>
        ) : isStudentLoginMode ? (
          /* [2순위] 학생 로그인 화면 */
          <StudentLogin
            onLoginSuccess={(data) => {
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
        ) : !session ? (
          /* [3순위] 비로그인 (랜딩 페이지) */
          <LandingPage onStudentLoginClick={() => setIsStudentLoginMode(true)} />
        ) : !profile ? (
          /* [4순위] 프로필 미설정 (역할 선택) */
          <TeacherProfileSetup
            email={session.user.email}
            onTeacherStart={handleTeacherStart}
          />
        ) : (
          /* [5순위] 선생님 대시보드 */
          <TeacherDashboard
            profile={profile}
            session={session}
            currentClassId={currentClassId}
            setCurrentClassId={setCurrentClassId}
            onNavigate={(page, params) => setInternalPage({ name: page, params })}
            internalPage={internalPage}
            setInternalPage={setInternalPage}
          />
        )}
      </Suspense>
    </Layout>
  )
}

export default App
