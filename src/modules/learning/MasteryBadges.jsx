import './masteryBadges.css';

/**
 * 학습 성취 줄 — 콘텐츠별로 관문 진행과 정상 휘장을 보여 준다.
 *
 * 엔진이 콘텐츠 중립이라 이 화면도 그렇다. `learning_content_types`에 한 줄이 늘면(속담·맞춤법)
 * 여기 코드를 고치지 않아도 줄이 하나 더 생긴다. 이름·그림·관문 이름은 전부 서버가 준다.
 *
 * 공개 범위는 **서버가 정한다**(A안). 친구용 RPC는 응답에 `passed_count`를 아예 넣지 않으므로
 * 이 컴포넌트는 값이 있으면 진행도를, 없으면 완성 여부만 그린다. 화면에서 가리는 방식이 아니다.
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
                // 정상이 여러 단계인 콘텐츠는 별 개수로 어디까지 올랐는지 보여 준다(어휘는 3단계).
                // 별은 완성된 성취라 친구에게도 보인다 — 서버가 진행도만 가린다.
                const levelCount = Number(item.summit_level_count || 1);
                const level = Number(item.summit_level || 0);
                // 아직 못 오른 단계는 빈 별로 남긴다. **정상 줄은 통과 전에도 늘 보인다** —
                // 있는 줄 몰라서 향하지 못하는 것이 가장 아깝다(지도의 잠긴 도전 버튼과 같은 원칙).
                const stars = '⭐'.repeat(level) + '☆'.repeat(Math.max(levelCount - level, 0));
                const summitNote = summit
                    ? (level >= levelCount
                        ? '정상까지 올랐어요'
                        : `${level}단계까지 올랐어요`)
                    : cleared
                        ? '정상 관문이 열렸어요'
                        : `${item.collection_label} ${total}개를 모으면 열려요`;

                return (
                    <div key={item.content_type} className={`mastery-badges__row${summit ? ' is-summit' : ''}`}>
                        <span className="mastery-badges__icon" aria-hidden="true">{item.emblem_icon}</span>
                        <div className="mastery-badges__body">
                            <strong className="mastery-badges__name">{item.display_name}</strong>
                            <span className="mastery-badges__count">
                                {hasProgress
                                    ? `${item.collection_label} ${passed} / ${total}`
                                    : cleared ? `${item.collection_label} 모두 완료` : '도전 중'}
                            </span>

                            {/* 정상 줄. 받기 전에는 흐린 빈 별로 두되 이름과 여는 방법을 함께 적는다. */}
                            <span className={`mastery-badges__title${summit ? '' : ' is-locked'}`}>
                                <span aria-hidden="true">👑</span>
                                {summit ? item.master_title : item.summit_label}
                                <b className="mastery-badges__stars"
                                   aria-label={levelCount > 1 ? `${level}단계 / ${levelCount}단계` : undefined}>
                                    {stars}
                                </b>
                                {/* 열렸는데 아직 안 친 상태는 '할 수 있는 일'이라 흐리게 두지 않는다. */}
                                <em className={`mastery-badges__note${!summit && cleared ? ' is-open' : ''}`}>{summitNote}</em>
                            </span>
                        </div>

                        {/* 진행 칸은 본인·교사에게만 나온다. 남은 칸이 보이는 것이 계속하게 만드는 부분이다. */}
                        {hasProgress && total > 0 && (
                            <div className="mastery-badges__pips" aria-label={`${item.collection_label} ${passed}/${total}`}>
                                {Array.from({ length: total }, (_, index) => (
                                    <span key={index} className={index < passed ? 'is-on' : ''} />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default MasteryBadges;
