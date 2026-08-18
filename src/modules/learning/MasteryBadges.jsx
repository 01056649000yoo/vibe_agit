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

                return (
                    <div key={item.content_type} className={`mastery-badges__row${summit ? ' is-summit' : ''}`}>
                        <span className="mastery-badges__icon" aria-hidden="true">{item.emblem_icon}</span>
                        <div className="mastery-badges__body">
                            <strong className="mastery-badges__name">{item.display_name}</strong>
                            {summit ? (
                                <span className="mastery-badges__title">{item.master_title}</span>
                            ) : hasProgress ? (
                                <span className="mastery-badges__count">
                                    {item.collection_label} {passed} / {total}
                                </span>
                            ) : (
                                <span className="mastery-badges__count">
                                    {cleared ? `${item.collection_label} 모두 완료` : '도전 중'}
                                </span>
                            )}
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
