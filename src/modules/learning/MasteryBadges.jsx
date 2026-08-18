import './masteryBadges.css';

/**
 * 학습 성취 휘장 — 콘텐츠마다 한 장. 정상(어휘 마스터)이 주인공이고 관문(덱마스터)은 그 아래 진행 띠다.
 *
 * 엔진이 콘텐츠 중립이라 이 화면도 그렇다. `learning_content_types`에 한 줄이 늘면(속담·맞춤법)
 * 여기 코드를 고치지 않아도 휘장이 하나 더 생긴다. 이름·그림·관문 이름은 전부 서버가 준다.
 *
 * 공개 범위는 **서버가 정한다**. 무엇이 오는지는 부르는 RPC가 결정하고 이 컴포넌트는 온 것을 그린다 —
 * 화면에서 가리면 개발자 도구로 보이기 때문이다. 지금은 친구용 응답에도 관문 진행도가 들어온다
 * (2026-08-18 변경). 값이 없는 응답이 와도 완성 여부만으로 그려지도록 남겨 둔다.
 *
 * 배치 순서에 뜻이 있다: 처음에는 정상이 **먼저 이름을 드러내고**(비어 있어도) 관문이 그 길로 보인다.
 * 정상 줄을 관문 아래 작게 두었더니 어휘 마스터가 덱마스터의 하위 항목처럼 읽혔다(2026-08-18).
 */
const MasteryBadges = ({ contents = [], loading = false, emptyText = '아직 도전한 기록이 없어요.' }) => {
    if (loading) {
        return <div className="mastery-badges mastery-badges--loading" role="status">성취를 불러오는 중이에요…</div>;
    }
    if (!contents.length) {
        return <div className="mastery-badges mastery-badges--empty">{emptyText}</div>;
    }

    return (
        <div className="mastery-badges">
            {contents.map((item) => {
                const total = Number(item.collection_count || 0);
                // 서버가 진행도를 안 준 경우(친구 보기)와 0인 경우를 구분한다.
                const hasProgress = item.passed_count !== undefined && item.passed_count !== null;
                const passed = hasProgress ? Number(item.passed_count) : null;
                const cleared = Boolean(item.all_collections_cleared);
                const summit = Boolean(item.summit_reached);

                const levelCount = Number(item.summit_level_count || 1);
                const level = Number(item.summit_level || 0);
                const complete = summit && level >= levelCount;
                // 어느 묶음(층)을 통과했는지. 서버가 묶음 키 끝 숫자를 번호로 보내 준다.
                // 번호가 없는 콘텐츠는 빈 배열이 오고, 그때는 칸에 번호를 쓰지 않는다.
                const passedOrdinals = Array.isArray(item.passed_ordinals) ? item.passed_ordinals : [];
                const hasOrdinals = passedOrdinals.length > 0 || (hasProgress && passed === 0);
                // 아직 못 오른 단계는 빈 별로 남긴다. **정상은 통과 전에도 늘 보인다** —
                // 있는 줄 몰라서 향하지 못하는 것이 가장 아깝다(지도의 잠긴 도전 버튼과 같은 원칙).
                const stars = '⭐'.repeat(level) + '☆'.repeat(Math.max(levelCount - level, 0));

                // 이 문구는 친구 아지트에도 쓰인다. 보는 사람에게 말하는 투("지금 도전해 보세요")를
                // 쓰면 남의 휘장 옆에 붙었을 때 어색하다. 탑의 상태를 적는 말로 둔다.
                const note = complete
                    ? '정상까지 올랐어요'
                    : summit
                        // 몇 단계짜리인지는 별이 이미 보여 준다. 알약에는 도달한 단계만 적는다.
                        ? `${level}단계까지 올랐어요`
                        : cleared
                            ? '정상 관문이 열렸어요'
                            : `${item.collection_label} ${total}개를 모으면 열려요`;

                const state = complete ? 'is-complete' : summit ? 'is-summit' : cleared ? 'is-open' : 'is-locked';

                return (
                    <article key={item.content_type} className={`mastery-badges__card ${state}`}>
                        <div className="mastery-badges__crest" aria-hidden="true">
                            <span className="mastery-badges__crest-icon">{item.emblem_icon}</span>
                        </div>

                        <div className="mastery-badges__head">
                            <span className="mastery-badges__eyebrow">{item.display_name}</span>
                            {/* 별은 제목 **옆**에 둔다. 아래에 깔면 제목에 딸린 장식처럼 보여
                                몇 단계까지 올랐는지가 눈에 안 들어온다. */}
                            <span className="mastery-badges__titleline">
                                <strong className="mastery-badges__title">
                                    {summit ? item.master_title : item.summit_label}
                                </strong>
                                <span
                                    className="mastery-badges__stars"
                                    aria-label={levelCount > 1 ? `${levelCount}단계 중 ${level}단계` : undefined}
                                >
                                    {stars}
                                </span>
                            </span>
                        </div>

                        {/* 상태 안내는 오른쪽에 둔다. 아래에 깔면 카드 오른쪽이 통째로 비어 허전하다. */}
                        <span className="mastery-badges__note">{note}</span>

                        {/* 관문 진행 띠. 정상으로 가는 길이라 정상 아래에 둔다.
                            칸마다 번호를 적어 **몇 층을 통과했는지** 바로 읽히게 한다 —
                            동그라미를 앞에서부터 채우면 3·5·7층을 통과해도 1·2·3층처럼 보인다. */}
                        <div className="mastery-badges__foot">
                            <div className="mastery-badges__foot-top">
                                <span className="mastery-badges__foot-label">{item.collection_label}</span>
                                <span className="mastery-badges__foot-count">
                                    {hasProgress ? `${passed} / ${total}` : cleared ? '모두 완료' : '도전 중'}
                                </span>
                            </div>
                            {hasProgress && total > 0 && (
                                <div
                                    className="mastery-badges__floors"
                                    aria-label={`${item.collection_label} ${passed}/${total}`}
                                >
                                    {Array.from({ length: total }, (_, index) => {
                                        const floor = index + 1;
                                        const done = hasOrdinals
                                            ? passedOrdinals.includes(floor)
                                            : index < passed;
                                        return (
                                            <span key={floor} className={done ? 'is-on' : ''}>
                                                {hasOrdinals ? floor : ''}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </article>
                );
            })}
        </div>
    );
};

export default MasteryBadges;
