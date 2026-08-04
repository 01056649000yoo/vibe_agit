import React from 'react';

/**
 * Card 공통 컴포넌트 (초등학생 친화적 따뜻한 종이 컨셉)
 * @param {boolean} animate - 등장 애니메이션 여부
 * @param {boolean} interactive - 클릭 가능한 카드의 hover·focus 표현
 * @param {boolean} decorative - 기존 우측 상단 장식 원 표시
 */
const Card = ({ children, className = '', style, animate = true, interactive = false, decorative = false, ...props }) => {
  const cardStyle = {
    background: 'var(--ui-surface)',
    border: '1px solid var(--ui-border)',
    borderRadius: 'var(--ui-radius-xl)',
    paddingTop: '2.5rem',
    paddingBottom: '2.5rem',
    paddingLeft: '2.5rem',
    paddingRight: '2.5rem',
    boxShadow: 'var(--ui-shadow-sm)',
    animation: animate ? 'fadeIn 0.45s ease-out forwards' : 'none',
    width: '100%',
    maxWidth: '550px',
    margin: '1rem auto',
    position: 'relative',
    overflow: 'hidden',
    ...style
  };

  return (
    <div className={`ui-card ${interactive ? 'ui-card--interactive' : ''} custom-card ${className}`} style={cardStyle} {...props}>
      {decorative && <div aria-hidden="true" style={{
        position: 'absolute',
        top: '-20px',
        right: '-20px',
        width: '60px',
        height: '60px',
        background: 'var(--ui-primary-soft)',
        borderRadius: '50%',
        opacity: 0.5,
        zIndex: 0
      }} />}

      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
};

export default Card;
