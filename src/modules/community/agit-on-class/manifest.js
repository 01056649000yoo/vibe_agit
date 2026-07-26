/**
 * 아지트온클래스 격리 모듈.
 *
 * 현재 활용도가 낮아 UI에서 완전히 숨겨 보관한다. 코드와 기존 설정 데이터는 유지하며,
 * 추후 필요할 때 available만 true로 되돌려 다시 연결할 수 있다.
 */
export const agitOnClassManifest = {
  id: 'agit-on-class',
  name: '아지트온클래스',
  description: '학급 공동 목표와 온도 아지트',
  icon: '🌡️',
  part: 'community',
  audience: 'both',
  defaultEnabled: false,
  available: false,
  studentEntry: () => import('./AgitOnClassPage'),
  teacherEntry: () => import('./AgitManager'),
};

export default agitOnClassManifest;
