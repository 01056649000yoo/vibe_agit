import { useCallback, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import LandingFeatureModal, { landingExperiences } from './LandingFeatureModal';
import './LandingPage.css';

const LandingPage = ({ onStudentLoginClick }) => {
  const [teacherLoginPending, setTeacherLoginPending] = useState(false);
  const [teacherLoginError, setTeacherLoginError] = useState('');
  const [activeExperienceId, setActiveExperienceId] = useState(null);

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

  const closeExperienceModal = useCallback(() => setActiveExperienceId(null), []);

  return (
    <section className="landing-shell">
      <div className="landing-halo landing-halo-left" aria-hidden="true" />
      <div className="landing-halo landing-halo-right" aria-hidden="true" />

      <main className="landing-card">
        <section className="landing-hero" aria-label="끄적끄적 아지트 소개">
          <img
            className="landing-hero-image"
            src="/assets/landing-hero-reference.jpg"
            alt="끄적끄적 아지트, 글쓰기를 중심으로 문해력 활동을 이어가는 공간"
            width="1723"
            height="913"
            fetchPriority="high"
          />
        </section>

        <section className="landing-promise" aria-labelledby="landing-promise-title">
          <h1 id="landing-promise-title">
            쓰고, 읽고, 키우며 <span>함께 자라는 우리 반 아지트</span>
          </h1>
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
        </section>

        <section className="landing-experiences" aria-labelledby="landing-experiences-title">
          <div className="landing-experiences-heading">
            <h2 id="landing-experiences-title">아지트에서 만나는 세 가지 성장</h2>
            <span>눌러서 자세히 보기</span>
          </div>
          <div className="landing-experience-grid">
            {landingExperiences.map((experience) => (
              <button
                className={`landing-experience-button landing-experience-button--${experience.tone}`}
                type="button"
                key={experience.id}
                onClick={() => setActiveExperienceId(experience.id)}
                aria-haspopup="dialog"
                aria-expanded={activeExperienceId === experience.id}
                aria-label={`${experience.title} 자세히 보기`}
              >
                <span className="landing-experience-icon" aria-hidden="true">{experience.icon}</span>
                <span className="landing-experience-copy" aria-hidden="true">
                  <small>{experience.shortLead}</small>
                  <strong>{experience.shortNoun}</strong>
                </span>
                <span className="landing-experience-more" aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </section>

        <footer className="landing-support-footer">
          <nav aria-label="서비스 안내">
            <a href="/learning-support-software">학습지원소프트웨어 선정기준 안내</a>
          </nav>
        </footer>
      </main>

      <LandingFeatureModal
        activeExperienceId={activeExperienceId}
        onSelect={setActiveExperienceId}
        onClose={closeExperienceModal}
      />
    </section>
  );
};

export default LandingPage;
