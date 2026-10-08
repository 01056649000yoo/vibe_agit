let detectorPromise = null;

/**
 * 500개 본문·문제 데이터는 글쓰기 화면의 첫 렌더를 막지 않고 뒤에서 한 번만 받는다.
 * 수첩을 나중에 열면 브라우저가 같은 청크를 그대로 재사용한다.
 */
export const loadElementarySpellingDetector = () => {
    if (!detectorPromise) {
        detectorPromise = import('./elementarySpellingEntries.js')
            .then(({ findElementarySpellingIssues }) => findElementarySpellingIssues)
            .catch((error) => {
                detectorPromise = null;
                throw error;
            });
    }
    return detectorPromise;
};
