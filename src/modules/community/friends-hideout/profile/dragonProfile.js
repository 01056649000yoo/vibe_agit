import {
    getDragonGrowthFromWriterLevel,
    getDragonStage
} from '../../../game/dragon/presentation';

// 친구 아지트도 드래곤 모듈의 단계 이미지·배경 표현을 그대로 공유한다.
export { getDragonGrowthFromWriterLevel, getDragonStage };

export const normalizeFriendPet = (petData) => ({
    name: '친구 드래곤',
    level: 1,
    background: 'default',
    exp: 0,
    species: 'star',
    ...(petData || {})
});
