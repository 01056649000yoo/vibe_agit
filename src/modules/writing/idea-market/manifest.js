/**
 * 회의 안건 만들기 글쓰기 입력 모듈.
 *
 * 교사가 `meeting` 미션을 만들고 학생이 아이디어를 제안·토론·투표한다.
 * 제출 결과는 기존 student_posts에 남아 글쓰기 기록·포인트 흐름을 재사용한다.
 */
export const ideaMarketManifest = {
  id: 'idea-market',
  name: '회의 안건 만들기',
  description: '학급 회의 안건에 의견을 제안하고 토론하는 입력 미션',
  icon: '🏛️',
  part: 'writing',
  audience: 'both',
  toggleable: false,
  performance: { home: 'none', load: 'on-open', writes: 'rpc', realtime: 'core-only', maxInitialRows: 100 },
  writingMissionTypes: ['meeting'],
  // 학생은 별도 페이지가 아니라 **'제안하는 글' 미션**으로 들어온다.
  // 교사가 회의 미션을 내면 과제 목록에 뜨고, 학생은 일반 글쓰기 화면에서 안건을 낸다.
  // (missionTypeManifest.js 의 meetingMissionType — studentRoute: 'writing')
  // 교사 화면은 그 미션의 teacherEntry 로 열린다: 미션 목록의 '학생 제안 보기'.
  teacherEntry: () => import('./IdeaMarketManager'),
};

export default ideaMarketManifest;
