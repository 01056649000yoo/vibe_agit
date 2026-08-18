import { memo } from 'react';
import MasteryBadges from '../../../../learning/MasteryBadges';
import useLearningMastery from '../../../../learning/useLearningMastery';

/**
 * 친구가 얻은 학습 휘장.
 *
 * **완성된 것만 보인다.** 진행도(덱마스터 7/10)는 서버가 친구용 응답에 아예 넣지 않는다 —
 * 화면에서 거르면 개발자 도구로 보이고, 무엇보다 진행 중인 상태가 상시 공개되면 은근한 비교가
 * 계속된다. 완성된 성취는 자랑스럽고 진행 중인 상태는 사적인 것이라는 기준(2026-08-17 결정)이다.
 */
const FriendMasteryCard = ({ friend }) => {
    const { contents, loading } = useLearningMastery({
        viewer: 'classmate',
        studentId: friend?.id,
        active: Boolean(friend?.id)
    });

    // 아무것도 완성하지 않은 친구에게는 빈 줄을 만들지 않는다. 이 카드 자체가 사라진다.
    const earned = contents.filter((item) => item.summit_reached || item.all_collections_cleared);
    if (!loading && earned.length === 0) return null;

    return (
        <MasteryBadges
            contents={earned}
            loading={loading}
            emptyText="아직 받은 휘장이 없어요."
        />
    );
};

export default memo(FriendMasteryCard);
