// 우리 반 스크린의 사진 주소 규칙을 화면 밖으로 꺼낸 곳.
// 임시 주소를 언제 다시 받을지, 실패하면 얼마 뒤 다시 해 볼지, 실패했을 때 무엇을 지킬지를 여기서 정한다.
// 화면 부품(.jsx)에 두면 node --test 가 직접 부를 수 없어 눈으로만 확인하게 된다.

// 스토리지 임시 주소의 수명. 스크린은 아침에 켜서 하교까지 두는 화면이라 이 시간을 반드시 넘긴다.
export const CLASS_BOARD_ASSET_TTL_SECONDS = 6 * 60 * 60;

// 만료 직전이 아니라 넉넉히 앞서 다시 받는다. 만료된 주소로 그림을 다시 받으면 깨진 그림이 된다.
export const CLASS_BOARD_ASSET_REFRESH_RATIO = 0.6;

// 실패는 대개 잠깐이다. 점점 뜸하게 다시 해 보고, 마지막 간격을 계속 쓴다.
export const CLASS_BOARD_ASSET_RETRY_DELAYS_MS = Object.freeze([3_000, 10_000, 30_000, 60_000]);

const MIN_REFRESH_DELAY_MS = 60_000;

export const getClassBoardAssetRefreshDelayMs = (ttlSeconds = CLASS_BOARD_ASSET_TTL_SECONDS) => {
  const ttl = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : CLASS_BOARD_ASSET_TTL_SECONDS;
  return Math.max(MIN_REFRESH_DELAY_MS, Math.round(ttl * 1000 * CLASS_BOARD_ASSET_REFRESH_RATIO));
};

export const getClassBoardAssetRetryDelayMs = (failureCount) => CLASS_BOARD_ASSET_RETRY_DELAYS_MS.at(
  Math.max(0, Math.min(Math.round(failureCount) - 1, CLASS_BOARD_ASSET_RETRY_DELAYS_MS.length - 1))
);

// 다시 받을 때가 됐는지. 컴퓨터를 덮어 두었다 열면 타이머가 늦게 울리므로 시각으로도 다시 본다.
export const isClassBoardAssetStale = (signedAtMs, nowMs, ttlSeconds = CLASS_BOARD_ASSET_TTL_SECONDS) => {
  if (!Number.isFinite(signedAtMs) || signedAtMs <= 0) return true;
  return (nowMs - signedAtMs) >= getClassBoardAssetRefreshDelayMs(ttlSeconds);
};

// 새로 받은 주소로 덮되, 이번에 못 받은 사진은 이전 주소를 그대로 둔다.
// 실패를 빈 목록으로 바꾸면 위젯이 "사진이 없다"로 읽어 올려 둔 사진이 사라진 것처럼 보인다.
export const mergeClassBoardAssetUrls = (previousUrls, nextUrls, paths) => {
  const wanted = Array.isArray(paths) ? paths.filter(Boolean) : [];
  const merged = new Map();
  wanted.forEach((path) => {
    const next = nextUrls?.get?.(path);
    const previous = previousUrls?.get?.(path);
    const value = next || previous;
    if (value) merged.set(path, value);
  });
  return merged;
};

// 아직 주소를 못 받은 사진이 몇 장인지. 화면에 "몇 장이 안 열렸는지" 그대로 알려 주기 위해서다.
export const getMissingClassBoardAssetPaths = (urls, paths) => (
  (Array.isArray(paths) ? paths.filter(Boolean) : []).filter((path) => !urls?.get?.(path))
);

export const CLASS_BOARD_ASSET_ERROR_MESSAGE = '사진 주소를 받지 못했습니다.';

export const getClassBoardAssetErrorMessage = (missingCount) => (
  missingCount > 0 ? `사진 ${missingCount}장을 열지 못했어요.` : CLASS_BOARD_ASSET_ERROR_MESSAGE
);

// 어제 그 스크린에 어떤 사진이 있었는지만 기억해 둔다. 주소가 아니라 **경로**다 —
// 경로만으로는 아무것도 못 열고, 실제 주소는 열 때마다 로그인 상태로 새로 받는다.
// 이 기억 덕분에 스크린 내용을 받아오는 것과 사진 주소를 받는 것을 나란히 할 수 있다.
const ASSET_MEMORY_PREFIX = 'class-board-assets:';
const ASSET_MEMORY_MAX_PATHS = 12;

export const rememberClassBoardAssetPaths = (storage, boardId, paths) => {
  if (!storage || !boardId) return false;
  const wanted = (Array.isArray(paths) ? paths : []).filter(Boolean).slice(0, ASSET_MEMORY_MAX_PATHS);
  try {
    if (wanted.length === 0) storage.removeItem(`${ASSET_MEMORY_PREFIX}${boardId}`);
    else storage.setItem(`${ASSET_MEMORY_PREFIX}${boardId}`, JSON.stringify(wanted));
    return true;
  } catch {
    // 저장이 막힌 브라우저에서도 화면은 그대로 돌아가야 한다. 한 왕복 더 걸릴 뿐이다.
    return false;
  }
};

export const readRememberedClassBoardAssetPaths = (storage, boardId) => {
  if (!storage || !boardId) return [];
  try {
    const stored = JSON.parse(storage.getItem(`${ASSET_MEMORY_PREFIX}${boardId}`) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter((item) => typeof item === 'string' && item).slice(0, ASSET_MEMORY_MAX_PATHS);
  } catch {
    return [];
  }
};
