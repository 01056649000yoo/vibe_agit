import { lazy } from 'react';

const FriendDragonProfileCard = lazy(() => import('./cards/FriendDragonProfileCard'));
const FriendWritingShelf = lazy(() => import('../FriendWritingShelf'));
const FriendRelationshipCard = lazy(() => import('./cards/FriendRelationshipCard'));

/**
 * 친구 프로필 확장 지점.
 * 신규 게임이나 활동은 셸을 수정하지 않고 이 목록에 카드를 등록한다.
 * 친구 화면은 공개 자기표현과 둘 사이의 관계만 보여 준다.
 * 전체 활동 통계·포인트 내역은 데이터가 있어도 이 화면에는 연결하지 않는다.
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
        id: 'writing-shelf',
        title: '공개 글 책장',
        order: 20,
        status: 'active',
        component: FriendWritingShelf,
        loadingMessage: '공개 글 책장을 준비하는 중... 📚'
    },
    {
        id: 'relationships',
        title: '친구와 나눈 기록',
        order: 30,
        status: 'active',
        component: FriendRelationshipCard,
        loadingMessage: '둘이 나눈 기록을 찾는 중... 🤝'
    }
];

export const getActiveFriendProfileCards = () => (
    friendProfileCardManifest
        .filter((card) => card.status === 'active' && card.component)
        .sort((left, right) => left.order - right.order)
);
