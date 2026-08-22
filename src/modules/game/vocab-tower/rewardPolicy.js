/**
 * 어휘의 탑 V2 층당 진도 보상 총액 정책의 앱 쪽 원본.
 *
 * 서버 쪽 원본은 `public.vocab_tower_v2_floor_reward_points_v1` 이며,
 * 두 곳이 어긋나지 않는지는 `tests/vocabTower.test.mjs` 의 층당 보상 상한 검사가 한꺼번에 본다.
 *
 * 2026-08-22에 위쪽 상한(500P)을 없앴다. 남은 한계는 정책이 아니라
 * `classes.vocab_tower_v2_perfect_reward_points` 가 integer 컬럼이라는 기술적 한계다.
 * 이 값을 넘겨 저장하면 DB가 알아보기 어려운 오류를 내므로 입력 단계에서 막는다.
 */

/** 층당 보상 총액 기본값(P). DB 컬럼 기본값과 같아야 한다. */
export const VOCAB_FLOOR_REWARD_DEFAULT_POINTS = 100;

/** 입력 최솟값(P). 0P로 저장하면 보상을 끈다. */
export const VOCAB_FLOOR_REWARD_MIN_POINTS = 0;

/** integer 컬럼이 담을 수 있는 최댓값. 정책 상한이 아니라 기술적 한계다. */
export const VOCAB_FLOOR_REWARD_MAX_POINTS = 2147483647;

/** 입력칸의 증가 단위(P). */
export const VOCAB_FLOOR_REWARD_STEP_POINTS = 10;

/** 저장 전 층당 보상 총액을 정수로 다듬는다. 위쪽 상한 없이 음수·소수·빈 값만 보정한다. */
export const normalizeFloorRewardPoints = (value) => {
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed)) return VOCAB_FLOOR_REWARD_DEFAULT_POINTS;
    if (parsed < VOCAB_FLOOR_REWARD_MIN_POINTS) return VOCAB_FLOOR_REWARD_MIN_POINTS;
    if (parsed > VOCAB_FLOOR_REWARD_MAX_POINTS) return VOCAB_FLOOR_REWARD_MAX_POINTS;
    return parsed;
};
