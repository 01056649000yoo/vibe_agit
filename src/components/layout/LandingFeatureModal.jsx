import { useEffect, useId, useRef } from 'react';
import ModalPortal from '../common/ModalPortal';
import ModalCloseButton from '../common/ModalCloseButton';

/*
 * 소개 카드 세 개는 ROADMAP 의 **제품 집중 3대 기둥**과 같은 갈래를 쓴다
 * (①교사의 글쓰기 지도 ②학생의 자율 글쓰기·과제 ③포인트 동기부여).
 *
 * 전에는 `쓰기 / 읽기 / 키우기` 였다. 그러면 독서록·친구 글 읽기가 기둥과 같은 무게로 올라가
 * `글쓰기 플랫폼` 이라는 정체성이 흐려지고, 정작 첫 번째 기둥인 **교사의 지도**는 버튼 라벨에서
 * 사라져 눌러야만 보였다(2026-08-28 점검). 읽고 나누기는 없애지 않고 자율 글쓰기 카드 안으로
 * 자리를 옮겼다 — 독서록은 원래 자율 글쓰기의 갈래다.
 *
 * `shortNoun` 은 버튼에 그대로 보이는 유일한 문구다. 세 개가 모두 `쓰기`·`자라기` 로 끝나
 * 클릭하지 않아도 무엇을 하는 곳인지 남게 한다.
 */
export const landingExperiences = [
  {
    id: 'writing',
    icon: '✍️',
    tone: 'writing',
    title: '선생님과 함께 글쓰기 배우기',
    shortLead: '선생님과 함께',
    shortNoun: '글쓰기 배우기',
    summary: '선생님이 과제와 연구소 활동으로 글쓰기를 지도하고, 학생은 질문·피드백을 받아 자기 글을 완성해요.',
    details: [
      { title: '글쓰기 과정을 설계하고 지도하기', description: '선생님은 과제와 연구소 활동을 준비하고 핵심 질문·안내를 건넨 뒤, 학생 글을 확인·보완 요청·평가하며 성장을 지도해요.' },
      { title: '여러 방법으로 생각하고 쓰기', description: '학생은 자유 글·시·보고서까지 알맞은 형식으로 쓰고, 맞춤법 도구와 선생님 피드백으로 다듬어요.' },
      { title: '글쓰기 연구소에서 생각 키우기', description: '글 개요 짜기·질문 만들기·좋은 질문 고르기·한줄모아 활동으로 생각을 구체화하고, 그 결과를 글쓰기에서 참고해 이어 써요.' },
    ],
  },
  {
    id: 'reading',
    icon: '📖',
    tone: 'reading',
    title: '독서록·일기까지 스스로 쓰기',
    shortLead: '독서록·일기까지',
    shortNoun: '스스로 쓰기',
    summary: '과제가 없어도 읽은 책과 하루를 스스로 남기고, 친구들의 공개 글을 함께 읽으며 나눠요.',
    details: [
      { title: '언제든 내가 정해 쓰기', description: '선생님 과제가 없는 날에도 독서록과 일기를 스스로 시작해 쓰고, 쓴 글은 나만의 책장에 쌓여요.' },
      { title: '독서마라톤 함께 달리기', description: '개인·학급·모둠 목표를 향해 읽고, 확인된 독서록의 책과 쪽수가 거리와 메달로 이어져요.' },
      { title: '친구 아지트에서 읽고 나누기', description: '우리 반의 공개 과제 글·독서록·일기를 찾아 읽고 따뜻한 댓글과 반응을 나눠요.' },
    ],
  },
  {
    id: 'dragon',
    icon: '🐲',
    tone: 'dragon',
    title: '쓴 만큼 자라고 꾸미기',
    shortLead: '쓴 만큼',
    shortNoun: '자라고 꾸미기',
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
