/**
 * 간단한 메모리 기반 데이터 캐시 유틸리티
 * API 호출 결과를 특정 시간 동안 보존하여 반복적인 네트워크 요청을 방지합니다.
 */

const cache = new Map();
const pendingRequests = new Map();

export const dataCache = {
    /**
     * @param {string} key 캐시 키
     * @param {Function} fetcher 데이터 수집 함수 (Promise 반환)
     * @param {number} ttl 유효 시간 (밀리초, 기본 30초)
     */
    async get(key, fetcher, ttl = 30000) {
        const cached = cache.get(key);
        const now = Date.now();

        // 1. 유효한 캐시가 있으면 반환
        if (cached && (now - cached.timestamp < ttl)) {
            return cached.data;
        }

        // 2. 이미 동일한 키로 진행 중인 요청이 있다면 해당 Promise를 재사용 (중복 요청 방지)
        if (pendingRequests.has(key)) {
            return pendingRequests.get(key);
        }

        // 3. 실제 요청 실행 및 상태 관리
        const promise = (async () => {
            try {
                const data = await fetcher();
                cache.set(key, { data, timestamp: Date.now() });
                return data;
            } catch (error) {
                // 에러 발생 시 기존 만료된 캐시라도 있으면 반환, 없으면 에러
                if (cached) return cached.data;
                throw error;
            } finally {
                pendingRequests.delete(key);
            }
        })();

        pendingRequests.set(key, promise);
        return promise;
    },
    invalidate(key) {
        if (key) cache.delete(key);
        else cache.clear();
    }
};
