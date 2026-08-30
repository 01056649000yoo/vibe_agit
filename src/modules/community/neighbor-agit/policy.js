export const NEIGHBOR_AGIT_ROLLOUT_MODES = Object.freeze({
    INTERNAL: 'internal',
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

const VALID_ROLLOUT_MODES = new Set(Object.values(NEIGHBOR_AGIT_ROLLOUT_MODES));

/**
 * 화면 선택을 위한 보조 함수다. 실제 권한은 같은 조건을 DB의 전용 RPC에서 다시 검사해야 한다.
 * 알 수 없는 단계는 공개하지 않는 쪽으로 닫는다.
 */
export function getNeighborAgitTeacherSurface({ rolloutMode, isAdmin = false }) {
    if (!VALID_ROLLOUT_MODES.has(rolloutMode)) return 'preparation';
    if (rolloutMode === NEIGHBOR_AGIT_ROLLOUT_MODES.PAUSED) return 'paused';
    if (rolloutMode === NEIGHBOR_AGIT_ROLLOUT_MODES.INTERNAL) {
        return isAdmin ? 'workspace' : 'preparation';
    }
    return 'workspace';
}

/**
 * 학생 메뉴와 화면의 최소 노출 조건이다. 서버 RPC 권한 검사를 대신하지 않는다.
 */
export function canEnterNeighborAgitAsStudent({
    rolloutMode,
    classModuleEnabled = false,
    spaceStatus,
    membershipStatus,
    activeClassCount = 0
}) {
    return rolloutMode === NEIGHBOR_AGIT_ROLLOUT_MODES.PUBLIC_BETA
        && classModuleEnabled === true
        && spaceStatus === 'active'
        && membershipStatus === 'active'
        && activeClassCount >= NEIGHBOR_AGIT_LIMITS.minimumActiveClasses;
}
