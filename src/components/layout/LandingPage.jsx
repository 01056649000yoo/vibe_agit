import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { HERO_IMAGE_ALT, SERVICE_IDENTITY_LINE } from '../../constants/serviceIdentity';
import './LandingPage.css';
import LandingServiceStats from './LandingServiceStats';
import LandingClassFlow from './LandingClassFlow';

const LandingPage = ({ onStudentLoginClick }) => {
  const [teacherLoginPending, setTeacherLoginPending] = useState(false);
  const [teacherLoginError, setTeacherLoginError] = useState('');
  const [flowOpen, setFlowOpen] = useState(false);

  const handleTeacherLogin = async () => {
    if (teacherLoginPending) return;

    setTeacherLoginPending(true);
    setTeacherLoginError('');

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });

    if (error) {
      setTeacherLoginError('선생님 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.');
      setTeacherLoginPending(false);
    }
  };

  return (
    <section className="landing-shell">
      <div className="landing-halo landing-halo-left" aria-hidden="true" />
      <div className="landing-halo landing-halo-right" aria-hidden="true" />

      <main className="landing-card">
        <section className="landing-hero" aria-label="끄적끄적 아지트 소개">
          <img
            className="landing-hero-image"
            src="/assets/landing-hero-reference.jpg"
            alt={HERO_IMAGE_ALT}
            width="1723"
            height="913"
            fetchPriority="high"
          />
        </section>

        <section className="landing-promise" aria-labelledby="landing-promise-title">
          <h1 id="landing-promise-title">
            과제 내고, 쓰고, 고치며 <span>함께 자라는 초등 글쓰기 교실</span>
          </h1>
          {/* 분위기만 전하던 큰 제목 아래에 **이 앱이 무엇인지**를 눈에 보이게 둔다.
              전에는 이 문장이 히어로 이미지의 alt 안에만 있어 화면에 `글쓰기` 가 없었다. */}
          <p className="landing-promise-identity">{SERVICE_IDENTITY_LINE}</p>
        </section>

        <section className="landing-entry" aria-label="로그인 선택">
          <p className="landing-entry-guide">
            학생은 선생님께 받은 코드로, 선생님은 Google 계정으로 들어가요.
          </p>

          <div className="landing-entry-grid">
            <button
              className="entry-card entry-card-student"
              onClick={onStudentLoginClick}
              type="button"
            >
              <span className="entry-card-icon" aria-hidden="true">🎒</span>
              <span className="entry-card-copy">
                <strong>학생으로 들어가기</strong>
                <small>8자리 학생 코드 입력</small>
              </span>
              <span className="entry-card-arrow" aria-hidden="true">→</span>
            </button>

            <button
              className="entry-card entry-card-teacher"
              onClick={handleTeacherLogin}
              type="button"
              disabled={teacherLoginPending}
              aria-busy={teacherLoginPending}
            >
              <span className="entry-card-icon" aria-hidden="true">🧑‍🏫</span>
              <span className="entry-card-copy">
                <strong>{teacherLoginPending ? '로그인 화면 여는 중…' : '선생님으로 들어가기'}</strong>
                <small>Google 계정으로 로그인</small>
              </span>
              <span className="entry-card-arrow" aria-hidden="true">→</span>
            </button>
          </div>

          <p className="landing-login-error" role="alert" aria-live="polite">
            {teacherLoginError}
          </p>
          {/* "수업 한 바퀴" 는 눌러야 펼쳐진다(2026-10-05 선생님 결정) — 매일 로그인하는 화면은 짧게 둔다. */}
          <button
            className="landing-flow-hint"
            type="button"
            aria-expanded={flowOpen}
            aria-controls="landing-flow"
            onClick={() => setFlowOpen((open) => !open)}
          >
            <span className="landing-flow-hint__arrow" aria-hidden="true">{flowOpen ? '▲' : '▼'}</span>
            {flowOpen ? '수업 흐름 접기' : '아지트 수업은 이렇게 흘러가요'}
          </button>
        </section>

        <LandingClassFlow open={flowOpen} />

        <LandingServiceStats />

        <footer className="landing-support-footer">
          <nav aria-label="서비스 안내">
            <a href="/learning-support-software">학습지원소프트웨어 선정기준 안내</a>
          </nav>
        </footer>
      </main>
    </section>
  );
};

export default LandingPage;
