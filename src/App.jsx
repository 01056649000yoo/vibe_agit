import { useState, useEffect } from 'react'
import { supabase } from './lib/supabaseClient'
import './App.css'
import Layout from './components/common/Layout'
import Card from './components/common/Card'
import Button from './components/common/Button'

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 앱 실행 시 현재 로그인 세션 확인
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      setLoading(false)
    })

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
            Google 계정으로 로그인하기
          </Button>
          <p style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: '#aaa' }}>
            선생님께 받은 계정으로 로그인해주세요 🏠
          </p>
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
            <Button variant="primary" style={{ height: '100px', flexDirection: 'column' }}>
              <span style={{ fontSize: '1.5rem' }}>🏫</span>
              우리 클래스
            </Button>
            <Button variant="secondary" style={{ height: '100px', flexDirection: 'column' }}>
              <span style={{ fontSize: '1.5rem' }}>📝</span>
              글쓰기 주제
            </Button>
          </div>
        </Card>
      )}
    </Layout>
  )
}

export default App
