/**
 * 아지트온클래스 격리 모듈.
 *
 * 현재 활용도가 낮아 기본 OFF로 보관한다. 교사가 다시 켜기 전에는 학생 메뉴,
 * Realtime 구독, 학생·교사 전용 청크를 로드하지 않는다.
 */
export const agitOnClassManifest = {
  id: 'agit-on-class',
  name: '아지트온클래스',
  description: '학급 공동 목표와 온도 아지트',
  icon: '🌡️',
  part: 'community',
  audience: 'both',
  defaultEnabled: false,
  studentEntry: () => import('./AgitOnClassPage'),
  teacherEntry: () => import('./AgitManager'),
};

export default agitOnClassManifest;
