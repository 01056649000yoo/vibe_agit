export const NEIGHBOR_AGIT_ROLLOUT_MODES = Object.freeze({
    INTERNAL: 'internal',
    LIMITED_BETA: 'limited_beta',
    PUBLIC_BETA: 'public_beta',
    PAUSED: 'paused'
});

export const NEIGHBOR_AGIT_LIMITS = Object.freeze({
    maxClassesPerSpace: 4,
    maxActiveSpacesPerClass: 1,
    minimumActiveClasses: 2,
    inviteTtlHours: 24,
    initialFeedRows: 20,
    maximumFeedRows: 50
});

export const NEIGHBOR_AGIT_DEFAULT_ROLLOUT_MODE = NEIGHBOR_AGIT_ROLLOUT_MODES.INTERNAL;


/*
 * 관문은 서버 한 곳이다 — 여기에 다시 두지 않는다.
 *
 * 학생: 홈 bootstrap 이 내려 주는 `neighbor_agit_available` 하나로 메뉴와 진입을 정한다
 *       (공개 단계·학급 선택·교사 스위치·활성 공간·참여 상태를 서버가 모두 본 결과다).
 * 교사: 화면은 그냥 열고, 자격이 없으면 RPC 가 거절한다. `TeacherEntry` 가 그 거절을
 *       "현재 선택한 학급에서는 모두의 아지트를 아직 사용할 수 없습니다." 로 받는다.
 *
 * 2026-09-17: 같은 판단을 하는 `getNeighborAgitTeacherSurface`·`canEnterNeighborAgitAsStudent`
 * 가 여기 있었지만 **화면 어디서도 부르지 않았다**. 검사만 그 둘을 붙들고 있어 "통과는 하는데
 * 아무것도 안 보는 검사" 가 됐다. 판단이 두 곳에 있으면 한 곳이 낡는다 — 서버만 남긴다.
 */
