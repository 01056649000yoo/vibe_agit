/*
 * 새 배포 뒤 옛 화면 조각(청크)을 못 받아 오는 오류를 한 번 새로고침으로 푼다(2026-09-23).
 *
 * 배포하면 화면 조각 파일 이름(해시)이 바뀌고 옛 파일은 서버에서 사라진다. 배포 전에 열어 둔 탭이
 * 다른 화면으로 들어가며 옛 파일을 부르면 브라우저가 이렇게 말한다(브라우저마다 문구가 다르다).
 *   사파리  : "Importing a module script failed."
 *   크롬    : "Failed to fetch dynamically imported module: …"
 *   파이어폭스: "error loading dynamically imported module"
 * 새로고침하면 새 index.html 이 새 파일 이름을 알려 주므로 풀린다. 그러나 무한 새로고침은 막아야 하므로
 * 짧은 시간 안에는 한 번만 한다(저장소를 못 쓰는 브라우저에서는 새로고침하지 않고 오류 화면을 둔다).
 */
const CHUNK_ERROR_PATTERN = /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError/i;
const RELOAD_KEY = 'agit:chunk-reload-at';
const RELOAD_GUARD_MS = 30_000;

export const isChunkLoadError = (error) => CHUNK_ERROR_PATTERN.test(String(error?.message || error || ''));

/** 새 배포를 받으러 한 번 새로고침한다. 실제로 새로고침했으면 true. */
export const reloadOnceForNewDeploy = ({ storage = globalThis.sessionStorage, now = Date.now(), reload = () => globalThis.location?.reload() } = {}) => {
    try {
        const last = Number(storage?.getItem(RELOAD_KEY) || 0);
        if (last && now - last < RELOAD_GUARD_MS) return false;
        storage.setItem(RELOAD_KEY, String(now));
    } catch {
        return false;
    }
    reload();
    return true;
};
