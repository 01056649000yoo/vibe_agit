import { memo } from 'react';
import MasteryBadges from '../../../../learning/MasteryBadges';
import useLearningMastery from '../../../../learning/useLearningMastery';

/**
 * 친구가 얻은 학습 휘장.
 *
 * **관문 진행도까지 보인다**(2026-08-18 변경). 2026-08-17에는 "진행 중인 상태는 사적"이라는 기준으로
 * 친구용 응답에서 `passed_count` 를 뺐는데, 붙여 놓고 보니 반대 문제가 더 컸다 — 친구가 어디까지
 * 왔는지가 전혀 안 보여 휘장 칸이 "받았다/못 받았다" 두 값짜리가 됐다. 무엇을 보낼지는
 * `get_classmate_learning_mastery_v1` 이 정한다. 이 카드는 온 것을 그릴 뿐이다.
 *
 * 여전히 안 보내는 것: 시험 점수·오답·시도 횟수. 요약 응답에 애초에 담기지 않는다.
 *
 * 카드는 **완성한 게 없어도 사라지지 않는다**. 전에는 통째로 감췄는데, 그러면 친구 아지트를 아무리
 * 돌아다녀도 `어휘 마스터` 라는 것이 있다는 사실을 알 수 없다. 목표는 보여야 향해 간다.
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
