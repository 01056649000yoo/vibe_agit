import React from 'react';
import { motion } from 'framer-motion';

const WRITING_LAB_URL = 'https://helper.xn--vz0ba242ncqcba79xhwx.site/';
const SURVIVAL_URL = 'https://survival.xn--vz0ba242ncqcba79xhwx.site';
const QR_TOOL_URL = 'https://샘링크.Kr';
const TEACHER_GUIDE_URL = 'https://moduai.notion.site/_-2fb79937a97380148743fa935dfa768c';
const STUDENT_GUIDE_URL = 'https://moduai.notion.site/_-2fb79937a97380c99dacd9fe11182473';

const writingLabItems = [
  { icon: '🔎', name: '글감 찾기' },
  { icon: '💬', name: '질문 만들기' },
  { icon: '🧭', name: '질문 고르기' },
  { icon: '🌟', name: '한줄모아' },
];

const literacyApps = [
  {
    icon: '🎮',
    name: '문해력 서바이벌',
    detail: '초4~6 퀴즈형 문해력 활동',
    href: SURVIVAL_URL,
    accent: '#0F9D78',
  },
  {
    icon: '📝',
    name: '급수의 달인',
    detail: '받아쓰기 활동 앱 · 아직 열리지 않았어요',
    disabled: true,
    badge: '제작중',
    accent: '#C47A26',
  },
];

const supportApps = [
  {
    icon: '🔳',
    name: 'QR 도구',
    detail: '샘링크로 QR 바로 만들기',
    href: QR_TOOL_URL,
  },
  {
    icon: '📘',
    name: '교사용 가이드',
    detail: '수업 운영과 활용 안내',
    href: TEACHER_GUIDE_URL,
  },
  {
    icon: '📗',
    name: '학생용 가이드',
    detail: '학생 입장과 사용 안내',
    href: STUDENT_GUIDE_URL,
  },
];

const UsageGuide = ({ isMobile }) => {
  const openLink = (href) => {
    if (!href) return;
    window.location.href = href;
  };

  const containerStyle = {
    maxWidth: '1180px',
    margin: '0 auto',
    padding: isMobile ? '16px' : '22px',
    background: 'white',
    borderRadius: '28px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
    color: '#2C3E50',
    fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif",
  };

  const cardButtonBase = {
    width: '100%',
    border: '1px solid #E4EAF0',
    borderRadius: '20px',
    padding: isMobile ? '14px' : '16px',
    textAlign: 'left',
    background: 'white',
    display: 'grid',
    gap: '8px',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={containerStyle}
    >
      <div style={{ textAlign: 'center', marginBottom: isMobile ? '18px' : '24px' }}>
        <h1 style={{ fontSize: isMobile ? '1.7rem' : '2rem', fontWeight: '900', marginBottom: '8px', color: '#23303F' }}>
          🧰 수업 앱 모음
        </h1>
        <p style={{ fontSize: isMobile ? '0.92rem' : '0.98rem', color: '#6B7A8C', margin: 0, lineHeight: '1.6' }}>
          입구 화면에서 활용 중인 앱들을 한곳에 모아 빠르게 실행할 수 있어요.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.3fr 0.9fr',
          gap: isMobile ? '14px' : '16px',
          alignItems: 'start',
        }}
      >
        <section
          style={{
            display: 'grid',
            gap: isMobile ? '14px' : '16px',
          }}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #E9FBF6 0%, #F9FFFD 68%, #FFFFFF 100%)',
              border: '1px solid #CFEDE6',
              borderRadius: '24px',
              padding: isMobile ? '16px' : '18px',
              boxShadow: '0 12px 26px rgba(50, 120, 110, 0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '16px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(78, 139, 138, 0.14)',
                  fontSize: '1.4rem',
                  flexShrink: 0,
                }}
              >
                🧪
              </div>
              <div style={{ display: 'grid', gap: '2px' }}>
                <strong style={{ fontSize: isMobile ? '1rem' : '1.08rem', color: '#215F5E' }}>아지트 글쓰기 연구소</strong>
                <span style={{ fontSize: '0.82rem', color: '#557877', lineHeight: '1.45' }}>
                  글쓰기 전 활동을 한곳에서 이어서 준비해요.
                </span>
              </div>
            </div>

            <button
              onClick={() => openLink(WRITING_LAB_URL)}
              style={{
                ...cardButtonBase,
                border: '1px solid rgba(210, 239, 232, 0.95)',
                background: 'rgba(255,255,255,0.9)',
                boxShadow: '0 8px 18px rgba(0,0,0,0.04)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 12px 22px rgba(0,0,0,0.06)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 8px 18px rgba(0,0,0,0.04)';
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))',
                  gap: '10px',
                }}
              >
                {writingLabItems.map((item) => (
                  <div
                    key={item.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 12px',
                      borderRadius: '16px',
                      background: '#FFFFFF',
                      border: '1px solid rgba(210, 239, 232, 0.95)',
                    }}
                  >
                    <span style={{ fontSize: '1rem', flexShrink: 0 }}>{item.icon}</span>
                    <strong style={{ fontSize: '0.84rem', color: '#2B4646' }}>{item.name}</strong>
                  </div>
                ))}
              </div>
            </button>
          </div>

          <div
            style={{
              background: '#FBFCFD',
              border: '1px solid #E9EEF3',
              borderRadius: '24px',
              padding: isMobile ? '16px' : '18px',
            }}
          >
            <div style={{ marginBottom: '12px' }}>
              <h2 style={{ margin: 0, fontSize: isMobile ? '1rem' : '1.08rem', fontWeight: '900', color: '#0F9D78' }}>
                문해력 활동
              </h2>
            </div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {literacyApps.map((item) => (
                <button
                  key={item.name}
                  onClick={() => !item.disabled && openLink(item.href)}
                  disabled={item.disabled}
                  style={{
                    ...cardButtonBase,
                    position: 'relative',
                    cursor: item.disabled ? 'default' : 'pointer',
                    opacity: item.disabled ? 0.9 : 1,
                    background: item.disabled
                      ? 'linear-gradient(135deg, #FFF9F1 0%, #FFFFFF 100%)'
                      : `linear-gradient(135deg, ${item.accent}15 0%, #FFFFFF 100%)`,
                    boxShadow: item.disabled
                      ? '0 6px 14px rgba(0,0,0,0.03)'
                      : '0 10px 20px rgba(0,0,0,0.05)',
                  }}
                >
                  {item.badge && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        padding: '3px 7px',
                        borderRadius: '999px',
                        background: '#FFF1B8',
                        color: '#9A6A00',
                        fontSize: '0.68rem',
                        fontWeight: '800',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                  <span style={{ fontSize: '1.45rem' }}>{item.icon}</span>
                  <strong style={{ fontSize: '0.94rem', color: '#23303F' }}>{item.name}</strong>
                  <span style={{ fontSize: '0.8rem', color: '#657282', lineHeight: '1.45' }}>{item.detail}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section
          style={{
            display: 'grid',
            gap: isMobile ? '14px' : '16px',
          }}
        >
          <div
            style={{
              background: '#FBFCFD',
              border: '1px solid #E9EEF3',
              borderRadius: '24px',
              padding: isMobile ? '16px' : '18px',
            }}
          >
            <div style={{ marginBottom: '12px' }}>
              <h2 style={{ margin: 0, fontSize: isMobile ? '1rem' : '1.08rem', fontWeight: '900', color: '#6778D8' }}>
                수업 도구와 가이드
              </h2>
            </div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {supportApps.map((item) => (
                <button
                  key={item.name}
                  onClick={() => openLink(item.href)}
                  style={{
                    ...cardButtonBase,
                    cursor: 'pointer',
                    boxShadow: '0 6px 14px rgba(0,0,0,0.03)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 12px 22px rgba(0,0,0,0.06)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 6px 14px rgba(0,0,0,0.03)';
                  }}
                >
                  <span style={{ fontSize: '1.35rem' }}>{item.icon}</span>
                  <strong style={{ fontSize: '0.9rem', color: '#23303F' }}>{item.name}</strong>
                  <span style={{ fontSize: '0.8rem', color: '#657282', lineHeight: '1.45' }}>{item.detail}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </motion.div>
  );
};

export default UsageGuide;
