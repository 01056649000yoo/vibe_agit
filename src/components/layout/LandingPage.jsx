import React, { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import './LandingPage.css';

const capabilities = [
  {
    icon: '✍️',
    title: '생각을 글로 써요',
    description: '선생님 과제부터 독서록과 일기까지, 여러 가지 글을 한곳에서 써요.',
    tone: 'writing',
  },
  {
    icon: '🧑‍🏫',
    title: '글쓰기를 지도해요',
    description: '선생님은 과제를 만들고 학생 글을 확인해, 의견과 평가로 성장 과정을 지도해요.',
    tone: 'teaching',
  },
  {
    icon: '🌱',
    title: '함께 고치며 자라요',
    description: '선생님의 의견과 친구의 따뜻한 댓글을 보고 내 글을 더 좋게 다듬어요.',
    tone: 'growth',
  },
  {
    icon: '🐲',
    title: '재미있게 이어가요',
    description: '글쓰기 포인트로 수호룡을 키우고, 독서마라톤과 어휘 활동에 도전해요.',
    tone: 'play',
  },
];

const LandingPage = ({ onStudentLoginClick }) => {
  const [teacherLoginPending, setTeacherLoginPending] = useState(false);
  const [teacherLoginError, setTeacherLoginError] = useState('');

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
        <header className="landing-brand-row">
          <span className="landing-brand-mark" aria-hidden="true">✏️</span>
          <div>
            <strong>끄적끄적 아지트</strong>
            <span>글쓰기로 생각이 자라는 우리 반 공간</span>
          </div>
        </header>

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

        <section className="landing-entry" aria-label="로그인 선택">
          <div className="landing-section-heading">
            <p>학생은 선생님께 받은 코드로, 선생님은 Google 계정으로 들어가요.</p>
          </div>

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

        <section className="landing-capabilities" aria-labelledby="landing-capabilities-title">
          <div className="landing-section-heading landing-section-heading-centered">
            <h2 id="landing-capabilities-title">학생과 선생님이 함께 만드는 글쓰기</h2>
          </div>

          <div className="capability-grid">
            {capabilities.map((capability) => (
              <article
                className={`capability-card capability-card-${capability.tone}`}
                key={capability.title}
              >
                <span className="capability-icon" aria-hidden="true">{capability.icon}</span>
                <strong>{capability.title}</strong>
                <p>{capability.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </section>
  );
};

export default LandingPage;
