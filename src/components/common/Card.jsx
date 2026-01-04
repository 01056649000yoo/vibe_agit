import React from 'react';

/**
 * Card 공통 컴포넌트 (초등학생 친화적 따뜻한 종이 컨셉)
 * @param {boolean} animate - 등장 애니메이션 여부
 */
const Card = ({ children, className = '', style, animate = true }) => {
  const cardStyle = {
    background: 'var(--card-bg)',
    border: '2px solid rgba(135, 206, 235, 0.1)', // 살짝 푸른빛 테두리
    borderRadius: 'var(--border-radius-lg)',
    padding: '2.5rem',
    boxShadow: 'var(--shadow-normal)',
    transition: 'transform var(--transition-normal)',
    animation: animate ? 'fadeIn 0.8s ease-out forwards' : 'none',
    width: '100%',
    maxWidth: '550px',
    margin: '1rem auto',
    position: 'relative',
    overflow: 'hidden',
    ...style
  };

  return (
    <div className={`custom-card ${className}`} style={cardStyle}>
      {/* 장식용 서브 도형 (친근함 추가) */}
      <div style={{
        position: 'absolute',
        top: '-20px',
        right: '-20px',
        width: '60px',
        height: '60px',
        background: 'var(--bg-secondary)',
        borderRadius: '50%',
        opacity: 0.5,
        zIndex: 0
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>

      <style>{`
        .custom-card:hover {
          transform: translateY(-5px);
        }
      `}</style>
    </div>
  );
};

export default Card;
