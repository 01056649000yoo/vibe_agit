import { useEffect, useId, useRef } from 'react';
import ModalPortal from '../common/ModalPortal';
import ModalCloseButton from '../common/ModalCloseButton';

export const landingExperiences = [
  {
    id: 'writing',
    icon: '✍️',
    tone: 'writing',
    title: '쓰고 다듬는 글',
    shortLead: '쓰고 다듬는',
    shortNoun: '글',
    summary: '과제로 시작한 글도 내 생각에서 시작한 글도, 의견을 주고받으며 한 편의 완성 글로 다듬어요.',
    details: [
      { title: '다양하게 쓰기', description: '과제 글, 자유 글, 일기, 시와 보고하는 글을 알맞은 형식으로 써요.' },
      { title: '함께 다듬기', description: '선생님의 의견과 다시쓰기, 친구의 따뜻한 댓글로 생각을 발전시켜요.' },
      { title: '성장 남기기', description: '완성한 글과 처음글 비교, 평가 기록이 쌓여 글쓰기 성장을 확인할 수 있어요.' },
    ],
  },
  {
    id: 'reading',
    icon: '📚',
    tone: 'reading',
    title: '읽고 채우는 책장',
    shortLead: '읽고 채우는',
    shortNoun: '책장',
    summary: '읽은 책을 기록하고 책장을 한 권씩 채우며, 나만의 독서 여정을 꾸준히 이어가요.',
    details: [
      { title: '책 찾고 기록하기', description: '읽은 책을 검색해 고르고, 기억에 남은 생각을 독서록으로 써요.' },
      { title: '나의 책장 채우기', description: '완성한 독서록이 책장에 쌓여 내가 읽은 책과 글을 한눈에 볼 수 있어요.' },
      { title: '독서 여정 이어가기', description: '독서마라톤과 성장 기록으로 꾸준히 읽은 과정과 성취를 확인해요.' },
    ],
  },
  {
    id: 'dragon',
    icon: '🐲',
    tone: 'dragon',
    title: '키우고 꾸미는 드래곤 아지트',
    shortLead: '키우고 꾸미는',
    shortNoun: '드래곤 아지트',
    summary: '글쓰기와 학급 활동이 포인트와 성장으로 이어져, 배움의 과정을 즐겁게 계속할 수 있어요.',
    details: [
      { title: '활동이 포인트로', description: '글쓰기와 독서, 선생님이 정한 학급 활동에 참여하며 포인트를 모아요.' },
      { title: '수호룡과 함께 성장하기', description: '꾸준히 활동할수록 수호룡이 자라고 새로운 성장 모습을 만날 수 있어요.' },
      { title: '나만의 아지트 만들기', description: '모은 포인트로 아지트를 꾸미고 퀘스트와 어휘 활동에도 도전해요.' },
    ],
  },
];

const focusableSelector = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const LandingFeatureModal = ({ activeExperienceId, onSelect, onClose }) => {
  const dialogRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const activeExperience = landingExperiences.find(({ id }) => id === activeExperienceId);
  const isOpen = Boolean(activeExperienceId);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const focusFrame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusableElements = [...dialogRef.current.querySelectorAll(focusableSelector)];
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const currentElement = document.activeElement;

      if (!focusableElements.includes(currentElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
      } else if (event.shiftKey && currentElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && currentElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!activeExperience) return null;

  return (
    <ModalPortal>
      <div className="landing-feature-modal-backdrop" role="presentation" onClick={onClose}>
        <section
          className={`landing-feature-modal landing-feature-modal--${activeExperience.tone}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          ref={dialogRef}
          tabIndex="-1"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="landing-feature-modal__header">
            <div className="landing-feature-modal__heading">
              <span aria-hidden="true">{activeExperience.icon}</span>
              <div>
                <p>끄적끄적 아지트에서</p>
                <h2 id={titleId}>{activeExperience.title}</h2>
              </div>
            </div>
            <ModalCloseButton onClick={onClose} label="아지트 기능 소개 닫기" />
          </header>

          <div className="landing-feature-modal__tabs" role="tablist" aria-label="아지트 기능 소개">
            {landingExperiences.map((experience) => (
              <button
                type="button"
                role="tab"
                aria-selected={experience.id === activeExperience.id}
                className={experience.id === activeExperience.id ? 'is-active' : ''}
                key={experience.id}
                onClick={() => onSelect(experience.id)}
              >
                <span aria-hidden="true">{experience.icon}</span>
                {experience.title}
              </button>
            ))}
          </div>

          <div className="landing-feature-modal__body" role="tabpanel" aria-label={activeExperience.title}>
            <p className="landing-feature-modal__summary" id={descriptionId}>{activeExperience.summary}</p>
            <ul className="landing-feature-modal__details">
              {activeExperience.details.map((detail, index) => (
                <li key={detail.title}>
                  <span aria-hidden="true">{index + 1}</span>
                  <div>
                    <strong>{detail.title}</strong>
                    <p>{detail.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </ModalPortal>
  );
};

export default LandingFeatureModal;
