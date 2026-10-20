/*
 * 보고서 사진을 담기 전의 **선생님 확인 장치**(2026-10-20, 설계 docs/CLASS_AGIT_PHOTOS_PLAN.md 2c).
 *
 * 글을 전시·책에 담는 모든 길(작품 찾기·미션별·학생별 담기)은 `classAgitApi.getSources` 로 글의 현재 모습을 받아 온다.
 * 그 결과에 **확인하지 않은 사진이 든 보고서**가 있으면, 담기 전에 확인 화면(`PhotoConfirmHost`)을 거친다.
 *   - 선생님이 사진을 보고 확인한 사진만 서버가 복사해 고정하고, 그 글을 다시 받아 오면 사진이 문단 목록에 들어 있다.
 *   - `사진 없이 글만 담기`를 고르면 받은 그대로(사진 없이) 담긴다.
 *   - 확인 화면이 없으면(등록된 장치 없음) 사진 없이 글만 담긴다 — 안전한 쪽이 기본이다.
 * 이 파일은 DB 클라이언트를 모른다(화면 장치와 api 를 잇는 등록소일 뿐).
 */
let handler = null;

/** 확인 화면이 자신을 등록한다. 돌려주는 함수로 등록을 푼다. */
export const registerPhotoGate = (fn) => {
    handler = fn;
    return () => { if (handler === fn) handler = null; };
};

/** 사진을 확인해야 하는 글인가: 사진이 든 칸이 있는데 아직 모두 담기지 않았다. */
export const needsPhotoReview = (source) => Boolean(source) && Array.isArray(source.photo_sections)
    && source.photo_sections.length > 0 && Number(source.photos_included || 0) < source.photo_sections.length;

/**
 * `items`: getSources 결과 [{ id, source, reason }]. 확인할 글이 있으면 확인 화면을 띄우고, 다시 받은 글로 바꿔 돌려준다.
 * 취소하면 던진다(아무것도 담기지 않는다). `reloadSources(classId, ids)`: 확인 뒤 글을 다시 받는 함수(이 장치를 거치지 않는 원본 호출).
 */
export async function applyPhotoGate(classId, items, reloadSources) {
    const pending = items.filter((item) => needsPhotoReview(item.source));
    if (!pending.length || !handler) return items;
    const refreshed = await handler({ classId, sources: pending.map((item) => item.source), reloadSources });
    if (!(refreshed instanceof Map) || !refreshed.size) return items;
    return items.map((item) => refreshed.get(item.id) ?? item);
}
