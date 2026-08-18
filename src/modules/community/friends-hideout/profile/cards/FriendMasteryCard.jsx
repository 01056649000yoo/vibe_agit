import { memo } from 'react';
import MasteryBadges from '../../../../learning/MasteryBadges';
import useLearningMastery from '../../../../learning/useLearningMastery';

/**
 * 친구가 얻은 학습 휘장.
 *
 * **진행도는 여전히 안 보인다.** `덱마스터 7/10` 같은 숫자는 서버가 친구용 응답에 아예 넣지 않는다 —
 * 화면에서 거르면 개발자 도구로 보이고, 무엇보다 진행 중인 숫자가 상시 공개되면 은근한 비교가
 * 계속된다. 완성된 성취는 자랑스럽고 진행 중인 숫자는 사적인 것이라는 기준(2026-08-17 결정)이다.
 *
 * **다만 휘장 자체는 늘 보인다**(2026-08-18 변경). 전에는 완성한 게 하나도 없으면 카드가 통째로
 * 사라졌는데, 그러면 친구 아지트를 아무리 돌아다녀도 `어휘 마스터` 라는 것이 있다는 사실을 알 수 없다.
 * 목표는 보여야 향해 간다. 숫자가 없으므로 새로 드러나는 사적인 정보도 없다 —
 * `도전 중`과 `모두 완료`는 이전에도 이미 응답에 있던 값이다.
 */
const FriendMasteryCard = ({ friend }) => {
    const { contents, loading } = useLearningMastery({
        viewer: 'classmate',
        studentId: friend?.id,
        active: Boolean(friend?.id)
    });

    return (
        <MasteryBadges
            contents={contents}
            loading={loading}
            emptyText="아직 도전한 기록이 없어요."
        />
    );
};

export default memo(FriendMasteryCard);
