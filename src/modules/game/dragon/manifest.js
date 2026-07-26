/**
 * 드래곤 기르기 모듈 (Stage 3b 첫 이전 대상)
 *
 * 3대 기둥 중 ③포인트 동기부여에 해당 — 유지 기능.
 * 학생: 드래곤 아지트(성장·먹이·상점) / 교사: 설정은 아직 GameManager에 있음(추후 이전).
 *
 * 주의: 학생 아바타로 쓰이는 `pet_data` 자체는 친구목록·글 작성자 표시 등
 * 여러 곳에서 쓰이므로 코어 데이터로 남긴다. 이 모듈은 "드래곤 기르기 기능"만 담당.
 */
export const dragonManifest = {
  id: 'dragon',
  name: '드래곤 파트너',
  description: '포인트로 드래곤을 키우고 꾸미기',
  icon: '🐉',
  part: 'game',
  audience: 'student',
  defaultEnabled: true, // 기존 동작 보존: 지금까지 모든 학급에 노출돼 있었음
  studentEntry: () => import('./DragonHideoutModal'),
};

export default dragonManifest;
