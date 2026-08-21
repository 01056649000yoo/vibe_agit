import { useEffect, useId, useRef } from 'react';
import ModalPortal from '../common/ModalPortal';
import ModalCloseButton from '../common/ModalCloseButton';

export const landingExperiences = [
  {
    id: 'writing',
    icon: '✍️',
    tone: 'writing',
    title: '과제부터 자유 글까지 쓰고 다듬기',
    shortLead: '과제·자율 글을',
    shortNoun: '쓰고 다듬기',
    summary: '선생님은 글쓰기 활동을 만들고, 학생은 과제와 자율 글을 쓰며 피드백과 다시쓰기로 한 편을 완성해요.',
    details: [
      { title: '여러 형식으로 쓰기', description: '선생님 과제와 자유 글·일기·독서록을 쓰고, 시와 보고서는 알맞은 전용 틀에서 완성해요.' },
      { title: '피드백으로 다시쓰기', description: '선생님의 확인·보완 요청과 의견, 친구의 댓글·반응을 보며 생각과 표현을 다듬어요.' },
      { title: '지도와 성장 기록 남기기', description: '글쓰기 연구소·맞춤법 도구를 활용하고, 평가와 글쓰기 발자국·완성 글을 차곡차곡 남겨요.' },
    ],
  },
  {
    id: 'reading',
    icon: '📚',
    tone: 'reading',
    title: '독서록부터 친구 글까지 읽고 나누기',
    shortLead: '독서록·친구 글을',
    shortNoun: '읽고 나누기',
    summary: '읽은 책과 생각을 독서록으로 남기고, 책장과 독서마라톤을 채우며 친구들의 공개 글도 함께 읽어요.',
    details: [
      { title: '책 찾고 나의 책장 채우기', description: '읽은 책을 검색해 독서록을 쓰고, 선생님이 확인한 책과 글을 나만의 책장에서 다시 봐요.' },
      { title: '독서마라톤 함께 달리기', description: '개인·학급·모둠 목표를 향해 읽고, 확인된 독서록의 책과 쪽수가 거리와 메달로 이어져요.' },
      { title: '친구 아지트에서 나누기', description: '우리 반의 공개 과제 글·독서록·일기를 찾아 읽고 따뜻한 댓글과 반응을 나눠요.' },
    ],
  },
  {
    id: 'dragon',
    icon: '🐲',
    tone: 'dragon',
    title: '포인트와 성장 기록으로 키우고 꾸미기',
    shortLead: '포인트·성장 기록으로',
    shortNoun: '키우고 꾸미기',
    summary: '글쓰기와 독서, 학급 활동에서 쌓은 포인트와 성장 기록으로 나만의 수호룡과 아지트를 만들어요.',
    details: [
      { title: '포인트와 칭호 모으기', description: '확인된 글과 학급 활동으로 포인트를 모으고, 글쓰기·독서 기록에 따라 새로운 칭호를 만나요.' },
      { title: '수호룡과 아지트 꾸미기', description: '꾸준히 쓸수록 수호룡이 성장하고, 모은 포인트로 배경과 소품을 골라 나만의 공간을 꾸며요.' },
      { title: '놀이터에서 도전하기', description: '어휘의 탑과 퀘스트·게임에 도전하고, 내가 모으고 사용한 포인트 기록도 한눈에 확인해요.' },
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
