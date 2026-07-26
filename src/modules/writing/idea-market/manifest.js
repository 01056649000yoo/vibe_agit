/**
 * 아이디어마켓 글쓰기 입력 모듈.
 *
 * 교사가 `meeting` 미션을 만들고 학생이 아이디어를 제안·토론·투표한다.
 * 제출 결과는 기존 student_posts에 남아 글쓰기 기록·포인트 흐름을 재사용한다.
 */
export const ideaMarketManifest = {
  id: 'idea-market',
  name: '아이디어마켓',
  description: '아이디어를 제안하고 토론하는 입력 미션',
  icon: '🏛️',
  part: 'writing',
  audience: 'both',
  toggleable: false,
  studentRoute: 'idea_market',
  writingMissionTypes: ['meeting'],
  studentEntry: () => import('./IdeaMarketPage'),
  teacherEntry: () => import('./IdeaMarketManager'),
};

export default ideaMarketManifest;
