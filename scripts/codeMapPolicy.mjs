/**
 * 코드 지도(Graphify) 운영 규칙 — 순수 함수. `scripts/code-map.mjs` 와 시험이 쓴다.
 *
 * 지도는 코드가 바뀌면 낡는다. 사람이 "갱신해야지" 하고 기억하는 방식은 곧 깨지므로, 조회할 때마다
 * "마지막 지도 이후에 소스가 바뀌었나"를 보고 낡았을 때만 다시 만든다(약 4~6초). 훅·백그라운드 프로세스 없이 항상 신선하다.
 */

/** 지도를 다시 만들어야 하는가. `reason` 은 사람에게 보여 줄 한 줄. */
export const staleReason = ({ graphMtimeMs = null, newestSourceMtimeMs = 0, recordedFileCount = null, currentFileCount = 0 }) => {
    if (graphMtimeMs == null) return '지도가 아직 없어요';
    if (recordedFileCount == null || recordedFileCount !== currentFileCount) return `소스 파일 수가 달라졌어요(${recordedFileCount ?? '?'} → ${currentFileCount})`;
    if (newestSourceMtimeMs > graphMtimeMs) return '지도를 만든 뒤에 소스가 바뀌었어요';
    return '';
};

/** 파일 수가 달라졌으면(지운 파일 포함) 전체를 다시 훑게 한다. 그 밖에는 바뀐 파일만 다시 읽는다. */
export const needsFullRescan = ({ recordedFileCount = null, currentFileCount = 0 }) => recordedFileCount != null && recordedFileCount !== currentFileCount;

/** 지도는 영문 이름(함수·파일·컴포넌트)으로 찾는다. 한글만 있는 질문은 못 찾으니 미리 알려 준다. */
export const needsEnglishName = (query) => !/[A-Za-z_]{3,}/.test(String(query || ''));

/** 소스로 센다 — 지도가 읽는 확장자와 같게. */
export const isMapSource = (file) => /\.(jsx?|tsx?|mjs|cjs)$/.test(file);
