import { useEffect, useId, useRef } from 'react';
import ModalPortal from '../common/ModalPortal';
import './TeacherWelcomeModal.css';

/*
 * 가입 직후 딱 한 번 뜨는 환영 안내.
 *
 * 바로 동행 모드를 시작해 버리면 교사는 "지금 뭘 시키는 건가" 부터 묻게 된다.
 * **먼저 활용 안내서가 있다는 것을 알리고**, 그다음에 따라 할지 고르게 한다.
 *
 * 학급이 하나도 없는 계정에만 뜬다 — 이미 학급을 쓰고 계신 선생님께는
 * 어느 날 갑자기 환영 인사가 뜨지 않는다.
 */

const TeacherWelcomeModal = ({ teacherName, journeys = [], stepCount, onOpenGuide, onStartTour, onLater }) => {
    const titleId = useId();
    const startRef = useRef(null);

    useEffect(() => {
        startRef.current?.focus();
        const handleEscape = (event) => { if (event.key === 'Escape') onLater(); };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onLater]);

    return (
        <ModalPortal>
            <div className="teacher-welcome__backdrop" role="presentation">
                <section className="teacher-welcome" role="dialog" aria-modal="true" aria-labelledby={titleId}>
                    <span className="teacher-welcome__icon" aria-hidden="true">🌱</span>
                    <h2 id={titleId}>
                        {teacherName ? `${teacherName} 선생님, 반갑습니다!` : '반갑습니다!'}
                    </h2>
                    <p className="teacher-welcome__lead">
                        끄적끄적 아지트에는 <strong>활용 안내서</strong>가 있습니다.
                        학급 준비부터 학기 마무리까지 <strong>{journeys.length}개 흐름 {stepCount}단계</strong>를
                        순서대로 담아 두었습니다. 무엇을 언제 하면 되는지 여기 다 있습니다.
                    </p>

                    {/* 말로만 "안내서가 있습니다" 하면 무엇이 들었는지 모른다. 흐름을 그대로 보여 준다. */}
                    <ul className="teacher-welcome__journeys">
                        {journeys.map((journey) => (
                            <li key={journey.id}>
                                <span aria-hidden="true">{journey.icon}</span>
                                <span className="teacher-welcome__journey-title">{journey.title}</span>
                                <span className="teacher-welcome__journey-count">{journey.steps.length}단계</span>
                            </li>
                        ))}
                    </ul>

                    <p className="teacher-welcome__lead">
                        읽기만 하지 않으셔도 됩니다. <strong>동행 모드</strong>를 켜면 안내가 화면 옆에 붙어
                        다니면서 <strong>눌러야 할 자리에 테두리를 씌워</strong> 한 단계씩 같이 갑니다.
                        학급을 만들거나 학생을 등록하면 저절로 다음 단계로 넘어가고, 그냥 둘러보는
                        단계는 <strong>확인했어요</strong>를 누르면 됩니다. 언제든 그만두셔도 진행 위치가 남습니다.
                    </p>
                    <div className="teacher-welcome__actions">
                        <button ref={startRef} type="button" className="teacher-welcome__primary" onClick={onStartTour}>
                            🧭 동행 모드로 시작하기
                        </button>
                        <button type="button" className="teacher-welcome__secondary" onClick={onOpenGuide}>
                            활용 안내서 먼저 보기
                        </button>
                    </div>
                    <button type="button" className="teacher-welcome__later" onClick={onLater}>
                        나중에 볼게요
                    </button>
                    <p className="teacher-welcome__note">
                        나중에 보셔도 됩니다. 화면 <strong>오른쪽 위 「활용 안내서」</strong> 버튼에서 언제든 다시 열 수 있고,
                        흐름마다 <strong>🧭 동행 모드</strong> 버튼이 있어 원하는 것부터 골라 따라 하실 수 있습니다.
                        각 화면의 <strong>ⓘ</strong> 를 누르면 그 화면만의 도움말도 열립니다.
                    </p>
                </section>
            </div>
        </ModalPortal>
    );
};

export default TeacherWelcomeModal;
