/**
 * 검토 중 맞춤법 자료 스위치(2026-10-08, 선생님 결정 '넣되 꺼 둠').
 *
 * false 이면 학생 입력기는 검토 중 자료를 **받지도 않는다**(별도 청크라 첫 화면 크기도 그대로).
 * 선생님이 검토를 마치면: 뺄 것을 decisions.json 에 적고 `merge-spelling-expansion.mjs --batch ...` 로 기본 자료에 합친다.
 * 이 스위치를 true 로 바꾸는 것은 "검토 없이 우선 다 보이게" 할 때뿐이다 — 바꾸면 배포해야 학생에게 보인다.
 */
export const PENDING_SPELLING_ENABLED = false;

let detectorPromise = null;

/** 검토 중 자료 찾기 장치를 뒤에서 한 번만 받는다. */
export const loadPendingSpellingDetector = () => {
    if (!detectorPromise) {
        detectorPromise = import('./pendingSpellingDetector.js')
            .then(({ findPendingSpellingIssues }) => findPendingSpellingIssues)
            .catch((error) => {
                detectorPromise = null;
                throw error;
            });
    }
    return detectorPromise;
};
