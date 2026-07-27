import { lazy } from 'react';

const FriendDragonProfileCard = lazy(() => import('./cards/FriendDragonProfileCard'));
const FriendWritingFootprintCard = lazy(() => import('../../../writing/writing-footprint/FriendWritingFootprintCard'));
const FriendWritingShelf = lazy(() => import('../FriendWritingShelf'));

/**
 * 친구 프로필 확장 지점.
 * 신규 게임이나 활동은 셸을 수정하지 않고 이 목록에 카드를 등록한다.
 * planned 항목은 정책과 데이터 인터페이스가 확정될 때 component를 연결한다.
 */
export const friendProfileCardManifest = [
    {
        id: 'dragon',
        title: '대표 드래곤',
        order: 10,
        status: 'active',
        component: FriendDragonProfileCard,
        loadingMessage: '친구 드래곤을 깨우는 중... 🐲'
    },
    {
        id: 'writing-footprint',
        title: '글쓰기 발자국',
        order: 20,
        status: 'active',
        component: FriendWritingFootprintCard,
        loadingMessage: '글쓰기 발자국을 모으는 중... 👣'
    },
    {
        id: 'writing-shelf',
        title: '공개 글 책장',
        order: 30,
        status: 'active',
        component: FriendWritingShelf,
        loadingMessage: '공개 글 책장을 준비하는 중... 📚'
    },
    { id: 'relationships', title: '함께 나눈 반응', order: 40, status: 'planned', component: null },
    { id: 'point-activity', title: '포인트 활동', order: 50, status: 'planned', component: null }
];

export const getActiveFriendProfileCards = () => (
    friendProfileCardManifest
        .filter((card) => card.status === 'active' && card.component)
        .sort((left, right) => left.order - right.order)
);
