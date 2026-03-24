import { useState, useEffect, Suspense, lazy } from 'react'
import { supabase } from './lib/supabaseClient'
import './App.css'

// 레이아웃 및 공통 컴포넌트
import Layout from './components/layout/Layout'
import Loading from './components/common/Loading'
import ErrorBoundary from './components/common/ErrorBoundary' // [추가] 에러 방어막

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

  // [추가] 외부에서 특정 직접 주소(/terms, /privacy)로 접근했는지 여부 확인
  const [directPath, setDirectPath] = useState(() => {
    const path = window.location.pathname;
    if (path === '/terms') return 'terms';
    if (path === '/privacy') return 'privacy';
    return null;
  });

  // [추가] 직접 주소 접근 시 타이틀 변경
  useEffect(() => {
    if (directPath === 'terms') {
      document.title = '이용약관 | 끄적끄적 아지트';
    } else if (directPath === 'privacy') {
      document.title = '개인정보 처리방침 | 끄적끄적 아지트';
    } else {
      document.title = '아지트 (agit) - 기록하는 즐거움';
    }
  }, [directPath]);

  /* [수정] 관리자 모드 상태를 localStorage와 연동하여 유지 (기본값: false = 교사 대시보드) */
  const [isAdminMode, setIsAdminMode] = useState(() => {
    try {
      // 키 변경으로 캐시/기존 값 간섭 배제
      const saved = localStorage.getItem('app_admin_mode_v2');

      if (saved === 'false') return false;
      if (saved === 'true') return true;

      // 저장된 값이 없으면 기본적으로 false (교사 모드)
      return false;
    } catch (_e) {
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
      const start = performance.now();
      console.log('🔍 세션 확인 중...');

      // [안전장치] Supabase 클라이언트가 없을 경우 중단
      if (!supabase) return;

      // 1. 현재 Supabase Auth 세션 확인
      const { data: { session } } = await supabase.auth.getSession();
      console.log(`🔐 세션 획득 완료 (${(performance.now() - start).toFixed(0)}ms)`);

      if (session) {
        // 익명 사용자인지 확인 (학생 세션)
        const isAnonymous = session.user?.is_anonymous === true;

        if (isAnonymous) {
          // ── 학생 익명 세션 복구 ──
          try {
            const { data: studentResult } = await supabase.rpc('get_student_by_auth');
            if (studentResult?.success) {
              const s = studentResult.student;
              const sessionData = {
                id: s.id,
                name: s.name,
                code: s.code,
                classId: s.classId,
                className: s.className,
                role: 'STUDENT'
              };
              setStudentSession(sessionData);
              localStorage.setItem('student_session', JSON.stringify(sessionData));
            } else {
              // auth_id 바인딩이 해제된 익명 세션
              // [보안 강화] localStorage를 신뢰하지 않고 세션만 유효하면 unbind된 것으로 간주
              // 로컬스토리지 위조를 염두하여 학생 ID를 승인 목적으로 사용 가능한 취약점 제거
              console.warn('학생 auth 바인딩 해제됨 — 로그인 화면으로 이동');
              localStorage.removeItem('student_session');
              // 세션은 있지만 학생으로 확인 불가 → 로그인 화면 표시 (studentSession=null)
            }
          } catch (e) {
            console.warn('학생 세션 복구 실패:', e);
            // [보안 강화] 예외 발생 시도 localStorage 폴백 제거
            // 서버 오류시 localStorage 위조로 소파베이스 RLS를 우회할 수 있는 취약점 차단
            localStorage.removeItem('student_session');
          }
        } else {
          // ── 교사/관리자 세션 ──
          localStorage.removeItem('student_session');
          setStudentSession(null);
          setSession(session);
          await fetchProfile(session.user.id);
        }
      } else {
        // [보안 강화] Supabase 세션이 없으면 localStorage도 신뢰하지 않음
        // localStorage만 조작하면 다른 학생을 사칭할 수 있는 취약점 차단
        localStorage.removeItem('student_session');
      }
      setLoading(false);
    };

    checkSessions();

    // 로그인 상태 변화를 감지
    let subscription = null;
    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          const isAnonymous = session.user?.is_anonymous === true;

          if (isAnonymous) {
            // 학생 익명 로그인 이벤트 - 별도 처리하지 않음
            // (StudentLogin.jsx에서 onLoginSuccess를 통해 상태가 업데이트됨)
            return;
          }

          // 교사 로그인 시 학생 데이터 즉시 폐기
          localStorage.removeItem('student_session');
          setStudentSession(null);
          setSession(session);
          fetchProfile(session.user.id);
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
    // [추가] 최근 접속 시간 기록 (가장 최근 활동 시점 파악용)
    // 1. 성능 측정 시작
    const startTime = performance.now();
    console.log('⏱️ 프로필 로드 시작...');

    // 2. 모든 요청을 병렬로 처리 (워터폴 제거)
    try {
        const [updateResult, profileResult, teacherResult] = await Promise.all([
            // (A) 최근 접속 시간 업데이트 (결과를 기다리지 않아도 무방하지만 병렬 처리)
            supabase
                .from('profiles')
                .update({ last_login_at: new Date().toISOString() })
                .eq('id', userId),
            
            // (B) 프로필 정보 조회
            supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle(),
            
            // (C) 교사 정보 조회
            supabase
                .from('teachers')
                .select('name, school_name')
                .eq('id', userId)
                .maybeSingle()
        ]);

        const endTime = performance.now();
        console.log(`✅ 프로필 로드 완료 (${(endTime - startTime).toFixed(0)}ms)`);

        const profileData = profileResult.data;
        const teacherData = teacherResult.data;

        if (profileResult.error) {
            console.error("프로필 로드 에러 (RLS 확인 필요):", profileResult.error);
        }

        if (profileData) {
            setProfile({
                ...profileData,
                last_login_at: profileData.last_login_at,
                role: profileData.role || 'TEACHER',
                teacherName: teacherData?.name,
                schoolName: teacherData?.school_name
            });
        } else if (teacherData) {
            // [복구] 신규 가입자 등의 경우 기본 역할 부여
            setProfile({
                role: 'TEACHER',
                teacherName: teacherData.name,
                schoolName: teacherData.school_name
            });
        }
    } catch (e) {
        console.warn("프로필 로드 중 오류 발생:", e);
    }
}

  // [보안 수정] 교사 프로필 설정 - 서버 사이드 RPC 사용
  // role과 is_approved는 서버에서만 결정 (클라이언트 조작 불가)
  const handleTeacherStart = async () => {
    if (!session) return

    const { data, error } = await supabase.rpc('setup_teacher_profile', {
      p_full_name: session.user.user_metadata.full_name,
      p_email: session.user.email
    });

    if (!error && data?.success) {
      fetchProfile(session.user.id)
    } else {
      alert('역할 저장 중 오류가 발생했습니다: ' + (error?.message || data?.error || '알 수 없는 오류'))
    }
  }

  // 로그아웃 통합 처리 (교사/관리자)
  const handleLogout = async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.warn('Logout server request failed (ignoring):', err);
    } finally {
      // 에러 상관 없이 프론트엔드 단의 상태를 완전히 초기화하여 강제 로그아웃 (서버 403 버그로 인해 로그아웃이 씹히는 현상 방지)
      setSession(null);
      setProfile(null);

      const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-'));
      sbKeys.forEach(k => localStorage.removeItem(k));

      // 로그인 화면으로 이동
      window.location.href = '/';
    }
  }

  // 학생 로그아웃 처리 (익명 세션 + localStorage 모두 정리)
  const handleStudentLogout = async () => {
    try {
      // 1. DB에서 auth_id 바인딩 해제 (RPC)
      await supabase.rpc('unbind_student_auth');
    } catch (e) {
      console.warn('학생 auth 바인딩 해제 실패 (무시):', e);
    }

    try {
      // 2. Supabase 익명 세션 로그아웃
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('학생 로그아웃 실패 (무시):', e);
    } finally {
      // 에러 발생 여부와 상관없이 무조건 클라이언트 세션 파기
      localStorage.removeItem('student_session');
      setStudentSession(null);

      const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-'));
      sbKeys.forEach(k => localStorage.removeItem(k));

      window.location.href = '/';
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
          ) : (profile?.role !== 'ADMIN' && (!profile?.teacherName || !profile?.schoolName)) ? ( /* 일반 교사인데 정보가 없는 경우만 설정 페이지로 */
            <TeacherProfileSetup
              email={session.user.email}
              onTeacherStart={handleTeacherStart}
              onLogout={handleLogout}
            />
          ) : (profile.role !== 'ADMIN' && !profile.is_approved) ? ( /* [1.5순위] 승인 대기 확인 (관리자는 우회) */
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
      </ErrorBoundary>
    </Layout>
  )
}

export default App
