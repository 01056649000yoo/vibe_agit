/**
 * 간단한 메모리 기반 데이터 캐시 유틸리티
 * API 호출 결과를 특정 시간 동안 보존하여 반복적인 네트워크 요청을 방지합니다.
 */

const cache = new Map();

export const dataCache = {
    /**
     * @param {string} key 캐시 키
     * @param {Function} fetcher 데이터 수집 함수 (Promise 반환)
     * @param {number} ttl 유효 시간 (밀리초, 기본 30초)
     */
    async get(key, fetcher, ttl = 30000) {
        const cached = cache.get(key);
        const now = Date.now();

        if (cached && (now - cached.timestamp < ttl)) {
            return cached.data;
        }

        try {
            const data = await fetcher();
            cache.set(key, { data, timestamp: now });
            return data;
        } catch (error) {
            // 에러 발생 시 기존 캐시가 있다면 반환, 없으면 에러 던짐
            if (cached) return cached.data;
            throw error;
        }
    },

    invalidate(key) {
        if (key) cache.delete(key);
        else cache.clear();
    }
};
