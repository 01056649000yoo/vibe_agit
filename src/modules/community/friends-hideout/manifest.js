/**
 * 친구 아지트 모듈 (Stage 3b — 학급 커뮤니티)
 *
 * 학생이 같은 반 친구의 제출 글을 읽고 반응·댓글을 남기며,
 * 친구가 꾸민 드래곤 아지트를 구경하는 선택 기능이다.
 */
export const friendsHideoutManifest = {
  id: 'friends-hideout',
  name: '친구 아지트',
  description: '친구들의 글과 드래곤 구경하기',
  icon: '👀',
  part: 'community',
  audience: 'student',
  defaultEnabled: true, // 기존에는 모든 학급에 노출되던 기능
  studentRoute: 'friends_hideout',
  studentEntry: () => import('./FriendsHideout'),
};

export default friendsHideoutManifest;
