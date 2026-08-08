/**
 * 친구 아지트 모듈 (Stage 3b — 학급 커뮤니티)
 *
 * 학생이 같은 반 친구의 제출 글을 읽고 반응·댓글을 남기며,
 * 친구가 꾸민 드래곤 아지트를 구경하는 고정 기능이다.
 */
export const friendsHideoutManifest = {
  id: 'friends-hideout',
  name: '친구 아지트',
  description: '친구들의 글과 드래곤 구경하기',
  icon: '👀',
  part: 'community',
  audience: 'student',
  core: true, // 모듈 구조·지연 로딩은 유지하지만 학급별로 끌 수 없다.
  performance: { home: 'none', load: 'on-open', writes: 'rpc', realtime: 'none', maxInitialRows: 50 },
  studentRoute: 'friends_hideout',
  studentEntry: () => import('./FriendsHideout'),
};
