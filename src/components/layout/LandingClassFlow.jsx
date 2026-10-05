import { useEffect, useRef } from 'react';
import './LandingClassFlow.css';

/*
 * 첫 화면 "수업 한 바퀴" (2026-10-05, 선생님 요청: "이 앱이 뭘 하는 앱인지 확 드러나는 게 없다").
 *
 * 로그인 카드 아래로 내리면 과제 → 생각 키우기(글쓰기 연구소) → 쓰기 → 고쳐 주기 → 스스로 쓰기(독서록·일기) → 자라기
 * 여섯 단계가 차례로 보인다(10-05 선생님 요청으로 연구소·독서록·일기 추가).
 * 그림은 실제 화면을 **단순하게 옮겨 그린 것**이다 — 실험실 화면을 찍으면 개발용 표시가 섞이고,
 * 진짜 학생 글을 쓰면 개인정보가 된다. 글·이름은 모두 지어낸 견본이다.
 * 한 번에 한 페이지씩 넘기는 스크롤은 쓰지 않는다(매일 로그인하는 선생님이 답답해진다).
 * 처음엔 접혀 있고 `아지트 수업은 이렇게 흘러가요` 를 누르면 펼쳐지며 그 자리로 내려간다(선생님 결정).
 * 접혀 있어도 내용은 문서에 남는다(hidden) — 검색엔진·화면 읽기 프로그램이 읽을 수 있게.
 */
const STEPS = [
    {
        id: 'mission',
        badge: '선생님',
        title: '과제 내기',
        body: '주제와 글자 수·문단 수, 마감을 정해 과제를 내면 우리 반 학생 화면에 바로 떠요.',
    },
    {
        id: 'lab',
        badge: '선생님 · 학생',
        title: '글쓰기 연구소에서 생각 키우기',
        body: '쓰기 전에 글 개요 짜기·질문 만들기·좋은 질문 고르기·한줄모아로 생각을 모으고, 그 결과를 보며 이어 써요.',
    },
    {
        id: 'write',
        badge: '학생',
        title: '내 아지트에서 글쓰기',
        body: '학생은 자기만의 아지트에서 글을 쓰고, AI 도움과 맞춤법 검사로 스스로 다듬어 제출해요.',
    },
    {
        id: 'feedback',
        badge: '선생님',
        title: '읽고 고쳐 주기',
        body: '자주 쓰는 피드백 문장으로 빠르게 다시 쓰기를 요청하고, 고쳐 준 곳은 빨간 펜 교정 부호로 보여 줘요.',
    },
    {
        id: 'self',
        badge: '학생',
        title: '독서록·일기는 스스로',
        body: '과제가 없어도 읽은 책과 하루를 독서록·일기로 남기고, 친구들이 공개한 글을 읽으며 생각을 나눠요.',
    },
    {
        id: 'grow',
        badge: '함께',
        title: '쓴 만큼 자라기',
        body: '승인된 글은 포인트가 되어 수호룡이 자라고, 내 서재 책장에 꽂히고, 우리 반 전시로 함께 읽어요.',
    },
];

const MissionMock = () => (
    <div className="flow-mock flow-mock--mission" aria-hidden="true">
        <div className="flow-mock__bar"><span>📝 새 과제</span><em>4학년 2반</em></div>
        <div className="flow-mission-card">
            <strong>우리 반 운동회 이야기</strong>
            <div className="flow-chips">
                <span>300자 이상</span><span>3문단</span><span>금요일 마감</span>
            </div>
        </div>
        <div className="flow-mock__foot">👀 학생 24명 화면에 올라감</div>
    </div>
);

const LabMock = () => (
    <div className="flow-mock flow-mock--lab" aria-hidden="true">
        <div className="flow-mock__bar"><span>🔬 글쓰기 연구소 · 질문 만들기</span><em>내 질문 3개</em></div>
        <div className="flow-questions">
            <span>운동회는 왜 할까?</span>
            <span className="is-picked">⭐ 우리 반이 이긴 비결은 무엇일까?</span>
            <span>내년엔 무엇을 하고 싶을까?</span>
        </div>
        <div className="flow-outline"><b>처음</b><b>가운데</b><b>끝</b></div>
    </div>
);

const WriteMock = () => (
    <div className="flow-mock flow-mock--write" aria-hidden="true">
        <div className="flow-mock__bar"><span>✍️ 우리 반 운동회 이야기</span><em>214 / 300자</em></div>
        <div className="flow-paper">
            <p>운동회 날 아침, 운동장에 만국기가 펄럭였다.</p>
            <p>이어달리기에서 바통을 놓칠 뻔했지만<span className="flow-caret" /></p>
        </div>
        <div className="flow-ai">🤖 그때 마음이 어땠는지 한 문장 더 써 볼까요?</div>
    </div>
);

const FeedbackMock = () => (
    <div className="flow-mock flow-mock--feedback" aria-hidden="true">
        <div className="flow-mock__bar"><span>✏️ 선생님 교정지</span><em>2회째</em></div>
        <div className="flow-paper">
            <p>우리 반이 끝까지 <ins>힘을 모아</ins> 이겼다.</p>
            <p>내년에도 <del>꼭이기고</del><ins>꼭 이기고</ins> 싶다.</p>
        </div>
        <div className="flow-feedback-row">
            <span className="flow-feedback-chip">💬 그날의 기분을 더 자세히 써 볼까요?</span>
            <span className="flow-approve">승인</span>
        </div>
    </div>
);

const SelfMock = () => (
    <div className="flow-mock flow-mock--self" aria-hidden="true">
        <div className="flow-mock__bar"><span>📚 내 독서록 · 일기</span><em>이번 주 3편</em></div>
        <div className="flow-entries">
            <span><i>📖 독서록</i>『마당을 나온 암탉』 잎싹이 대단했다</span>
            <span><i>📔 일기</i>비 오는 날, 우산을 같이 썼다</span>
        </div>
        <div className="flow-mock__foot">👀 친구가 공개한 글 2편 새로 올라옴</div>
    </div>
);

const GrowMock = () => (
    <div className="flow-mock flow-mock--grow" aria-hidden="true">
        <div className="flow-grow">
            <img src="/assets/dragons/dragon_stage_2.webp" alt="" width="96" height="96" loading="lazy" decoding="async" />
            <div className="flow-grow__copy">
                <strong>+30P</strong>
                <span>수호룡이 한 단계 자랐어요</span>
            </div>
        </div>
        <div className="flow-shelf">
            {['운동회', '가을 소풍', '내 친구', '독서록', '시'].map((title) => <span key={title}>{title}</span>)}
        </div>
        <div className="flow-mock__foot">🏡 우리 반 전시에 걸림</div>
    </div>
);

const MOCKS = { mission: MissionMock, lab: LabMock, write: WriteMock, feedback: FeedbackMock, self: SelfMock, grow: GrowMock };

const LandingClassFlow = ({ open = false }) => {
    const sectionRef = useRef(null);
    useEffect(() => {
        if (!open || !sectionRef.current) return;
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        sectionRef.current.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }, [open]);

    return (
    <section className="landing-flow" id="landing-flow" aria-labelledby="landing-flow-title" ref={sectionRef} hidden={!open}>
        <div className="landing-flow__heading">
            <h2 id="landing-flow-title">아지트 수업 한 바퀴</h2>
            <p>과제부터 생각 키우기, 쓰고 고치기, 스스로 쓰기, 자라기까지 한곳에서 이어져요.</p>
        </div>
        <ol className="landing-flow__steps">
            {STEPS.map((step, index) => {
                const Mock = MOCKS[step.id];
                return (
                    <li className={`landing-flow__step landing-flow__step--${step.id}`} key={step.id}>
                        <div className="landing-flow__copy">
                            <span className="landing-flow__num" aria-hidden="true">{index + 1}</span>
                            <div>
                                <small className="landing-flow__badge">{step.badge}</small>
                                <h3>{step.title}</h3>
                                <p>{step.body}</p>
                            </div>
                        </div>
                        <Mock />
                    </li>
                );
            })}
        </ol>
    </section>
    );
};

export default LandingClassFlow;
