import { useState, useEffect } from 'react'
import { supabase } from './lib/supabaseClient'
import './App.css'

function App() {
  /**
   * [useState 이해하기]
   * useState는 리액트에서 '상태(데이터)'를 관리하는 도구입니다.
   * [데이터, 데이터를바꾸는함수] = useState(초기값) 형식으로 사용합니다.
   */
  const [session, setSession] = useState(null) // 현재 로그인 정보 (로그인 안 됐으면 null)
  const [loading, setLoading] = useState(true) // 데이터를 로딩 중인지 여부
  const [profile, setProfile] = useState(null) // profiles 테이블에서 가져온 사용자 정보

  /**
   * [useEffect 이해하기]
   * useEffect는 컴포넌트가 '처음 나타날 때' 혹은 '특정 값이 바뀔 때' 실행되는 함수입니다.
   * 여기서는 앱이 처음 켜질 때 로그인 상태를 확인하는 용도로 사용합니다.
   */
  useEffect(() => {
    // 1. 현재 로그인된 세션 정보를 가져옵니다.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id) // 로그인 되어있으면 프로필 정보 가져오기
      setLoading(false)
    })

    // 2. 로그인 상태가 바뀌면(로그인/로그아웃) 자동으로 감지하여 세션을 업데이트합니다.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setProfile(null)
    })

    return () => subscription.unsubscribe() // 컴포넌트가 사라질 때 감시 종료
  }, [])

  // 사용자의 프로필(role)을 가져오는 함수
  const fetchProfile = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.log('프로필이 아직 없습니다. 새로 생성해야 합니다.')
    } else {
      setProfile(data)
    }
  }

  /**
   * [역할 선택 및 프로필 생성 함수]
   * 새로운 사용자가 처음 로그인했을 때, TEACHER 또는 STUDENT 역할을 선택하면
   * profiles 테이블에 데이터를 한 줄 생성(INSERT)합니다.
   */
  const handleRoleSelect = async (selectedRole) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .insert({
          id: session.user.id,
          email: session.user.email,
          role: selectedRole,
          full_name: session.user.user_metadata.full_name || '사용자'
        })

      if (error) throw error

      // 저장이 성공하면 다시 프로필을 불러와 화면을 갱신합니다.
      fetchProfile(session.user.id)
    } catch (error) {
      alert('역할 저장 중 오류가 발생했습니다: ' + error.message)
    }
  }

  // 구글 로그인 함수
  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    })
  }

  // 로그아웃 함수
  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  if (loading) return <div className="container">로딩 중...</div>

  return (
    <div className="container">
      {!session ? (
        /* 로그인 전 화면 */
        <div className="card">
          <h1>✍️ 끄적끄적 아지트</h1>
          <p>학급 글쓰기 플랫폼에 오신 것을 환영합니다.</p>
          <button onClick={handleGoogleLogin} style={{ marginTop: '20px', background: '#db4437' }}>
            구글로 로그인하기
          </button>
        </div>
      ) : (
        /* 로그인 후 화면 */
        <div className="card">
          <h2>환영합니다!</h2>
          <p style={{ color: '#94a3b8' }}>{session.user.email} 계정으로 접속 중</p>

          <div style={{ margin: '20px 0', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px' }}>
            {profile ? (
              <p>현재 역할: <strong>{profile.role === 'TEACHER' ? '👩‍🏫 선생님' : '🧑‍🎓 학생'}</strong></p>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <p>👋 첫 방문을 환영합니다!</p>
                <p style={{ fontSize: '0.9rem', marginBottom: '15px' }}>본인의 역할을 선택해주세요.</p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button
                    onClick={() => handleRoleSelect('TEACHER')}
                    style={{ background: '#2563eb', padding: '10px 20px' }}
                  >
                    👩‍🏫 선생님
                  </button>
                  <button
                    onClick={() => handleRoleSelect('STUDENT')}
                    style={{ background: '#7c3aed', padding: '10px 20px' }}
                  >
                    🧑‍🎓 학생
                  </button>
                </div>
              </div>
            )}
          </div>

          <button onClick={handleLogout} style={{ background: '#475569' }}>
            로그아웃
          </button>
        </div>
      )}
    </div>
  )
}

export default App
