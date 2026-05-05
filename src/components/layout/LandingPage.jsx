import React, { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import FeaturesModal from './FeaturesModal';
import './LandingPage.css';

const WRITING_LAB_URL = 'https://helper.xn--vz0ba242ncqcba79xhwx.site/';

const quickActions = [
  {
    icon: '✍️',
    title: '글쓰기 시작',
    description: '바로 글쓰기',
    tone: 'peach',
    action: 'student-entry',
  },
  {
    icon: '🔎',
    title: '글감 찾기',
    description: '아이디어 얻기',
    tone: 'mint',
    href: WRITING_LAB_URL,
  },
  {
    icon: '🎮',
    title: '문해력 서바이벌',
    description: '초4~6 퀴즈로 키우기',
    tone: 'sky',
    onClick: 'survival',
  },
  {
    icon: '🔳',
    title: 'QR 도구',
    description: 'QR 바로 만들기',
    tone: 'lavender',
    href: 'https://샘링크.Kr',
  },
];

const groupedActivities = [
  {
    title: '글쓰기 전 활동',
    subtitle: '아지트 글쓰기 연구소',
    portalHref: WRITING_LAB_URL,
    items: [
      { icon: '🔎', name: '글감 찾기', detail: '주제와 재료 아이디어 모으기', href: WRITING_LAB_URL },
      { icon: '💬', name: '질문 만들기', detail: '생각을 넓히는 질문 생성하기', href: WRITING_LAB_URL },
      { icon: '🧭', name: '질문 고르기', detail: '핵심 질문을 골라 글 방향 정하기', href: WRITING_LAB_URL },
    ],
  },
  {
    title: '글쓰기 후 활동',
    items: [
      { icon: '🎮', name: '문해력 서바이벌', detail: '초4~6 퀴즈로 문해력 키우기', onClick: 'survival' },
    ],
  },
];

const guideLinks = [
  {
    label: '교사용 가이드',
    href: 'https://moduai.notion.site/_-2fb79937a97380148743fa935dfa768c',
    icon: '📘',
  },
  {
    label: '학생용 가이드',
    href: 'https://moduai.notion.site/_-2fb79937a97380c99dacd9fe11182473',
    icon: '📗',
  },
];

const LandingPage = ({ onStudentLoginClick }) => {
  const [modalType, setModalType] = useState(null);

  const navigateToUrl = (href) => {
    window.location.href = href;
  };

  const handleTeacherLogin = () => {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  return (
    <>
      <section className="landing-shell">
        <div className="landing-halo landing-halo-left" />
        <div className="landing-halo landing-halo-right" />

        <div className="landing-showcase">
          <main className="landing-device">
            <div className="landing-device-notch" />

            <section className="landing-device-hero">
              <img
                className="landing-device-hero-image"
                src="/assets/landing-hero-reference.png"
                alt="끄적끄적 아지트 상단 대표 이미지"
              />
            </section>

            <section className="landing-entry-grid">
              <button className="entry-card entry-card-student" onClick={onStudentLoginClick}>
                <span className="entry-card-icon">✍️</span>
                <strong>학생 글쓰기 입장</strong>
                <span>내 글을 쓰고 생각을 키워요!</span>
              </button>

              <button className="entry-card entry-card-teacher" onClick={handleTeacherLogin}>
                <span className="entry-card-icon">🧑‍🏫</span>
                <strong>선생님으로 시작하기</strong>
                <span>수업에 바로 활용해요!</span>
              </button>
            </section>

            <button
              className="landing-intro-banner"
              onClick={() => setModalType('features')}
              type="button"
            >
              <span className="landing-intro-icon">🏡</span>
              <span className="landing-intro-text">
                <strong>아지트 소개</strong>
                <span>끄적끄적 아지트는 어떤 공간인지 한눈에 살펴보기</span>
              </span>
              <span className="landing-intro-arrow">자세히 보기 〉</span>
            </button>

            <section className="landing-section">
              <div className="landing-section-head">
                <h3>빠른 시작</h3>
                <span>모두 보기 〉</span>
              </div>
              <div className="quick-action-grid">
                {quickActions.map((action) => (
                  <button
                    key={action.title}
                    className={`quick-action-card quick-action-${action.tone}`}
                    onClick={() => {
                      if (action.action === 'student-entry') {
                        onStudentLoginClick();
                        return;
                      }
                      if (action.href) {
                        navigateToUrl(action.href);
                        return;
                      }
                      if (action.onClick) {
                        setModalType(action.onClick);
                      }
                    }}
                    type="button"
                  >
                    <span className="quick-action-icon">{action.icon}</span>
                    <strong>{action.title}</strong>
                    <span>{action.description}</span>
                  </button>
                ))}
              </div>
            </section>

            {groupedActivities.map((section) => (
              <section className="landing-section" key={section.title}>
                <div className="landing-section-head">
                  <div className="landing-section-title-group">
                    <h3>{section.title}</h3>
                    {section.subtitle && <p>{section.subtitle}</p>}
                  </div>
                  {section.portalHref ? (
                    <button
                      className="landing-section-link"
                      onClick={() => navigateToUrl(section.portalHref)}
                      type="button"
                    >
                      연구소 전체 보기 〉
                    </button>
                  ) : (
                    <span>모두 보기 〉</span>
                  )}
                </div>
                <div className="activity-grid">
                  {section.items.map((item) => (
                    <button
                      className={`activity-card ${item.badge ? 'activity-card-disabled' : ''}`}
                      key={item.name}
                      onClick={() => {
                        if (item.href) {
                          navigateToUrl(item.href);
                          return;
                        }
                        if (item.onClick) {
                          setModalType(item.onClick);
                        }
                      }}
                      type="button"
                      disabled={!item.onClick && !item.href}
                    >
                      {item.badge && <span className="activity-badge">{item.badge}</span>}
                      <span className="activity-icon">{item.icon}</span>
                      <strong>{item.name}</strong>
                      <p>{item.detail}</p>
                    </button>
                  ))}
                </div>
              </section>
            ))}

            <section className="landing-section landing-guides">
              <div className="landing-section-head">
                <h3>안내 & 정보</h3>
              </div>
              <div className="guide-link-grid">
                {guideLinks.map((link) => (
                  <a
                    key={link.label}
                    className="guide-link-card"
                    href={link.href}
                    rel="noopener noreferrer"
                  >
                    <span>{link.icon}</span>
                    <strong>{link.label}</strong>
                  </a>
                ))}
              </div>
            </section>
          </main>
        </div>
      </section>

      <FeaturesModal
        isOpen={Boolean(modalType)}
        mode={modalType || 'features'}
        onClose={() => setModalType(null)}
      />
    </>
  );
};

export default LandingPage;
