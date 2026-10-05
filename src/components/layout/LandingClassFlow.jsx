import './LandingClassFlow.css';

/*
 * 첫 화면 "수업 한 바퀴" (2026-10-05, 선생님 요청: "이 앱이 뭘 하는 앱인지 확 드러나는 게 없다").
 *
 * 로그인 카드 아래로 내리면 과제 → 쓰기 → 고쳐 주기 → 자라기 네 단계가 차례로 보인다.
 * 그림은 실제 화면을 **단순하게 옮겨 그린 것**이다 — 실험실 화면을 찍으면 개발용 표시가 섞이고,
 * 진짜 학생 글을 쓰면 개인정보가 된다. 글·이름은 모두 지어낸 견본이다.
 * 한 번에 한 페이지씩 넘기는 스크롤은 쓰지 않는다(매일 로그인하는 선생님이 답답해진다).
 */
const STEPS = [
    {
        id: 'mission',
        badge: '선생님',
        title: '과제 내기',
        body: '주제와 글자 수·문단 수, 마감을 정해 과제를 내면 우리 반 학생 화면에 바로 떠요.',
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

const MOCKS = { mission: MissionMock, write: WriteMock, feedback: FeedbackMock, grow: GrowMock };

const LandingClassFlow = () => (
    <section className="landing-flow" id="landing-flow" aria-labelledby="landing-flow-title">
        <div className="landing-flow__heading">
            <h2 id="landing-flow-title">아지트 수업 한 바퀴</h2>
            <p>과제를 내고, 쓰고, 고치고, 자라는 흐름이 한곳에서 이어져요.</p>
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

export default LandingClassFlow;
