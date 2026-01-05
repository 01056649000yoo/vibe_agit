import { useState, useEffect } from 'react'
import { supabase } from './lib/supabaseClient'
import './App.css'
import Layout from './components/common/Layout'
import Card from './components/common/Card'
import Button from './components/common/Button'
import ClassManager from './components/ClassManager'
import StudentManager from './components/StudentManager'
import StudentLogin from './components/StudentLogin'

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [studentSession, setStudentSession] = useState(null)
  const [currentClassId, setCurrentClassId] = useState(null)
  const [isStudentLoginMode, setIsStudentLoginMode] = useState(false)
  const [currentTab, setCurrentTab] = useState('home') // 'home', 'class', 'student'
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

    // 로그인 상태 변화를 감지 (로그인/로그아웃 시 자동 실행)
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

    // upsert를 사용하여 데이터가 없으면 넣고, 있으면 업데이트합니다.
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

  if (loading) return (
    <Layout>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: '2rem', animation: 'float 2s infinite ease-in-out' }}>🎈</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', fontWeight: '500' }}>
          아지트 문을 열고 있어요. 잠시만요!
        </p>
      </div>
    </Layout>
  )

  return (
    <Layout>
      {!session ? (
        /* [조건 1] 로그인이 안 된 경우: 로그인 화면 */
        <Card style={{ textAlign: 'center' }}>
          <h1 style={{
            fontSize: '2.8rem',
            marginBottom: '1rem',
            color: 'var(--primary-color)',
            fontWeight: '800'
          }}>
            ✍️ 끄적끄적 아지트
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginBottom: '2.5rem', lineHeight: '1.6' }}>
            우리의 소중한 생각들이 무럭무럭 자라나는<br />
            <strong>따뜻한 글쓰기 공간</strong>에 오신 걸 환영해요!
          </p>
          <Button
            onClick={() => supabase.auth.signInWithOAuth({
              provider: 'google',
              options: { redirectTo: window.location.origin }
            })}
            style={{ width: '100%', background: '#FFFFFF', color: '#757575', border: '1px solid #ddd', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" style={{ width: '18px', marginRight: '10px' }} />
            선생님 구글 로그인
          </Button>

          <div style={{ margin: '20px 0', borderTop: '1px solid #eee', paddingTop: '20px' }}>
            <Button
              variant="secondary"
              size="lg"
              style={{ width: '100%', background: '#FBC02D' }}
              onClick={() => setIsStudentLoginMode(true)}
            >
              🎒 학생 로그인 (코드 입력)
            </Button>
          </div>

          <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#aaa' }}>
            나만의 글쓰기 아지트로 입장해요 🏠
          </p>
        </Card>
      ) : isStudentLoginMode ? (
        <StudentLogin
          onLoginSuccess={(data) => {
            setStudentSession({
              id: data.id,
              name: data.name,
              code: data.student_code,
              role: 'STUDENT'
            });
            setIsStudentLoginMode(false);
          }}
          onBack={() => setIsStudentLoginMode(false)}
        />
      ) : studentSession ? (
        /* [조건 4] 학생 로그인 성공 시 화면 */
        <Card style={{ maxWidth: '600px', background: '#FFFDF7', border: '2px solid #FFE082' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
            <div style={{
              background: '#FFE082',
              color: '#795548',
              padding: '6px 16px',
              borderRadius: '20px',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}>
              🎒 {studentSession.className || '우리 반'} 친구
            </div>
            <Button variant="ghost" size="sm" onClick={() => {
              localStorage.removeItem('student_session');
              setStudentSession(null);
            }}>
              로그아웃 🚪
            </Button>
          </div>

          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '10px' }}>🌟</div>
            <h1 style={{ fontSize: '2.4rem', color: '#5D4037', marginBottom: '0.5rem' }}>
              안녕, <span style={{ color: '#FBC02D' }}>{studentSession.name}</span>!
            </h1>
            <p style={{ color: '#8D6E63', fontSize: '1.1rem' }}>어서와요, 오늘 어떤 이야기를 들려줄 건가요?</p>
          </div>

          {/* 주요 활동 메뉴 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div
              style={{
                background: 'white', padding: '24px', borderRadius: '24px', border: '2px solid #FFE082',
                textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
                boxShadow: '0 4px 6px rgba(255, 224, 130, 0.2)'
              }}
              onClick={() => alert('선생님이 내주신 주제를 보러 가요! 📝')}
              className="student-card-hover"
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📝</div>
              <h3 style={{ margin: 0, color: '#5D4037' }}>글쓰기 미션</h3>
              <p style={{ fontSize: '0.85rem', color: '#9E9E9E', marginTop: '8px' }}>선생님의 주제 확인</p>
            </div>

            <div
              style={{
                background: 'white', padding: '24px', borderRadius: '24px', border: '2px solid #FFE082',
                textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
                boxShadow: '0 4px 6px rgba(255, 224, 130, 0.2)'
              }}
              onClick={() => alert('친구들의 글을 구경하러 가요! 👀')}
              className="student-card-hover"
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>👀</div>
              <h3 style={{ margin: 0, color: '#5D4037' }}>친구 아지트</h3>
              <p style={{ fontSize: '0.85rem', color: '#9E9E9E', marginTop: '8px' }}>친구들의 글 읽기</p>
            </div>
          </div>

          <div style={{
            marginTop: '24px', padding: '20px', background: '#FDFCF0',
            borderRadius: '20px', textAlign: 'center', border: '1px dashed #FFE082'
          }}>
            <p style={{ margin: 0, color: '#9E9E9E', fontSize: '0.9rem' }}>
              🚩 오늘의 목표: 멋진 글 한 편 완성하기!
            </p>
          </div>
        </Card>
      ) : !profile ? (
        /* [조건 2] 로그인은 됐지만 프로필이 없는 경우: 역할 선택 */
        <Card style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✨</div>
          <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>반가워요! 처음 만났네요.</h2>
          <p style={{ color: 'var(--primary-color)', fontWeight: '600', marginBottom: '1.5rem' }}>
            {session.user.email}
          </p>
          <p style={{ marginBottom: '2.5rem', fontSize: '1.1rem' }}>아지트에서 어떤 보람찬 일을 해볼까요?</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '2.5rem' }}>
            <Button onClick={handleTeacherStart} size="lg" variant="primary">
              🎓 멋진 선생님으로 시작하기
            </Button>
            <Button variant="secondary" size="lg" disabled>
              🎒 씩씩한 학생으로 시작하기 (준비 중)
            </Button>
          </div>

          <Button variant="ghost" onClick={() => supabase.auth.signOut()} size="sm">
            혹시 다른 계정으로 로그인할까요? 🚪
          </Button>
        </Card>
      ) : (
        /* [조건 3] 프로필까지 있는 경우: 대시보드 */
        <Card style={{ maxWidth: '600px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
            <div style={{
              background: 'var(--bg-secondary)',
              color: 'var(--primary-color)',
              padding: '6px 16px',
              borderRadius: '20px',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>{profile.role === 'TEACHER' ? '🍎 선생님 모드' : '🖍️ 학생 모드'}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
              로그아웃
            </Button>
          </div>

          <h1 style={{ fontSize: '2.2rem', marginBottom: '1.5rem', color: 'var(--text-primary)' }}>
            안녕, <span style={{ color: 'var(--primary-color)' }}>{profile.full_name || '친구'}</span>님!
          </h1>

          {profile.role === 'TEACHER' && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: '12px' }}>
              <button
                onClick={() => setCurrentTab('home')}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  background: currentTab === 'home' ? 'white' : 'transparent',
                  color: currentTab === 'home' ? 'var(--primary-color)' : 'var(--text-secondary)',
                  fontWeight: 'bold', transition: 'all 0.2s'
                }}
              >
                🏠 홈
              </button>
              <button
                onClick={() => setCurrentTab('class')}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  background: currentTab === 'class' ? 'white' : 'transparent',
                  color: currentTab === 'class' ? 'var(--primary-color)' : 'var(--text-secondary)',
                  fontWeight: 'bold', transition: 'all 0.2s'
                }}
              >
                🏫 클래스
              </button>
              <button
                onClick={() => setCurrentTab('student')}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  background: currentTab === 'student' ? 'white' : 'transparent',
                  color: currentTab === 'student' ? 'var(--primary-color)' : 'var(--text-secondary)',
                  fontWeight: 'bold', transition: 'all 0.2s'
                }}
              >
                🎒 학생 관리
              </button>
            </div>
          )}

          {profile.role === 'TEACHER' && currentTab === 'home' && (
            <>
              <div style={{
                padding: '28px',
                background: 'var(--bg-primary)',
                borderRadius: '20px',
                marginBottom: '2.5rem',
                border: '2px dashed var(--primary-color)',
                textAlign: 'center'
              }}>
                <p style={{ fontSize: '1.1rem', lineHeight: '1.7', color: 'var(--text-secondary)', margin: 0 }}>
                  오늘도 우리 반 친구들과 함께<br />
                  <strong>반짝이는 글쓰기 시간</strong>을 만들어봐요! 📚✨
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <Button variant="secondary" style={{ height: '100px', flexDirection: 'column', width: '100%' }}>
                  <span style={{ fontSize: '1.5rem' }}>📝</span>
                  글쓰기 주제
                </Button>
                <Button variant="ghost" style={{ height: '100px', flexDirection: 'column', width: '100%' }} disabled>
                  <span style={{ fontSize: '1.5rem' }}>🏆</span>
                  우리 반 랭킹
                </Button>
              </div>
            </>
          )}

          {profile.role === 'TEACHER' && currentTab === 'class' && (
            <div style={{ marginBottom: '24px' }}>
              <ClassManager userId={session.user.id} onClassFound={(id) => setCurrentClassId(id)} />
            </div>
          )}

          {profile.role === 'TEACHER' && currentTab === 'student' && (
            <div style={{ marginBottom: '24px' }}>
              {currentClassId ? (
                <StudentManager classId={currentClassId} />
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  <p>먼저 '클래스' 메뉴에서 학급을 만들어주세요! 🏫</p>
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </Layout>
  )
}

export default App
