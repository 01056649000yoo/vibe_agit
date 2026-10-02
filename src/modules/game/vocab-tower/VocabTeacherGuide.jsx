/*
 * 어휘의 탑 교사 `📘 운영 설명` 탭(2026-10-02 선생님 요청 "읽기 어려워" → 쉬운 네 덩어리).
 * 값은 부모(TeacherManager)가 읽은 학급 설정만 받는다 — DB 를 부르지 않아 실험실·검사에서 그대로 그려 볼 수 있다.
 */
import './teacherManager.css';

export default function VocabTeacherGuide({ grade, perfectRewardPoints }) {
    const config = { grade, perfectRewardPoints };
    /*
     * 운영 설명(2026-10-02 선생님 요청 "읽기 어려워"): 긴 문단 대신 네 덩어리 — 학생이 하는 일·낱말 상태·문제 모양·포인트.
     * ⚠️ 낱말 상태 이름은 학생 지도(`V2DeckMap`)·학생 현황 탭과 **같은 말**을 쓴다(교사와 학생이 같은 화면을 보며 이야기하게).
     * ⚠️ 문제 모양·순서는 `get_next_my_vocab_tower_v2_practice_question_v1` 이, 포인트 몫은
     *    `vocab_tower_v2_progress_milestones_v1`(20·20·30·30%)이 원본이다. 옛 V1 `뜻의 방 → 문장의 방` 은 학생에게 안 보인다.
     */
    const total = config.perfectRewardPoints;
    const first = Math.round(total * 0.2);
    const third = Math.round(total * 0.3);
    const milestones = [
        { percent: 25, points: first },
        { percent: 50, points: first },
        { percent: 75, points: third },
        { percent: 100, points: total - first * 2 - third }
    ];
    return (
            <section className="vocab-guide" aria-labelledby="vocab-journey-title">
                <header className="vocab-guide__head">
                    <h3 id="vocab-journey-title">어휘의 탑은 이렇게 돌아가요</h3>
                    <p>학생이 혼자 낱말을 연습하며 1층부터 10층까지 올라가는 곳이에요.</p>
                </header>

                <div className="vocab-guide__now" aria-label="우리 반 지금 설정">
                    <div><small>출제 학년</small><strong>{config.grade}학년</strong></div>
                    <div><small>층 수</small><strong>10층</strong></div>
                    <div><small>연습 횟수·시간</small><strong>제한 없음</strong></div>
                    <div><small>한 층에서 받는 포인트</small><strong>{total}P</strong></div>
                </div>

                <article className="vocab-guide__card">
                    <h4><span aria-hidden="true">①</span> 학생이 하는 일</h4>
                    <ol className="vocab-guide__steps">
                        <li><b>1층부터</b> 시작해요. 한 번 연습하면 <b>12문제</b>가 나와요.</li>
                        <li>그 층 낱말을 충분히 익히면 <b>덱마스터 도전</b>을 해요. 통과하면 <b>다음 층이 열려요</b>.</li>
                        <li>10층까지 오르면 마지막 <b>어휘 마스터 관문</b>에 도전해요.</li>
                    </ol>
                </article>

                <article className="vocab-guide__card">
                    <h4><span aria-hidden="true">②</span> 낱말은 네 가지 상태가 있어요</h4>
                    <ul className="vocab-guide__states" aria-label="낱말 학습 상태">
                        <li className="is-new"><b>처음 볼 낱말</b><span>아직 안 나온 낱말</span></li>
                        <li className="is-learning"><b>연습 중</b><span>나왔지만 아직 익히는 중</span></li>
                        <li className="is-review"><b>다시 볼 낱말</b><span>틀린 낱말 — 다음 연습에 먼저 나와요</span></li>
                        <li className="is-mastered"><b>완전히 익힘</b><span>서로 다른 두 형태를 힌트 없이 연속으로 맞힘</span></li>
                    </ul>
                    <p className="vocab-guide__tip">덱마스터 도전 자격과 포인트는 모두 <b>완전히 익힘</b> 낱말 수로 세요.</p>
                </article>

                <article className="vocab-guide__card">
                    <h4><span aria-hidden="true">③</span> 문제는 이렇게 나와요</h4>
                    <ul className="vocab-guide__types">
                        <li><span aria-hidden="true">📖</span><b>뜻 고르기</b><small>뜻에 맞는 낱말</small></li>
                        <li><span aria-hidden="true">✍️</span><b>문맥 고르기</b><small>빈칸에 맞는 낱말</small></li>
                        <li><span aria-hidden="true">🔎</span><b>쓰임 구별</b><small>문맥에 어울리는 말</small></li>
                        <li><span aria-hidden="true">⌨️</span><b>직접 입력</b><small>한 번 맞힌 낱말은 직접 써요</small></li>
                    </ul>
                    <ul className="vocab-guide__points-list">
                        <li>12문제는 <b>덜 익힌 낱말 5 · 복습할 낱말 4 · 처음 보는 낱말 3</b>개로 골라요.</li>
                        <li>틀린 낱말은 조금 뒤에 <b>다른 모양으로 한 번 더</b> 나와요.</li>
                    </ul>
                </article>

                <article className="vocab-guide__card">
                    <h4><span aria-hidden="true">④</span> 포인트는 이렇게 받아요</h4>
                    <p>한 층의 낱말을 익혀 갈수록 <b>네 번 나눠</b> 받아요(한 층 {total}P).</p>
                    <ol className="vocab-guide__milestones" aria-label="층 익힘 포인트 단계">
                        {milestones.map((item) => <li key={item.percent}><small>완전히 익힘</small><b>{item.percent}%</b><span>+{item.points}P</span></li>)}
                    </ol>
                    <ul className="vocab-guide__points-list">
                        <li>같은 단계는 <b>한 번만</b> 받아요.</li>
                        <li>덱마스터를 통과하면 다음 층이 열려요. <b>덱마스터 통과로는 포인트가 나오지 않습니다.</b></li>
                    </ul>
                </article>
            </section>
    );
}
