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
     * @param {number} ttl 유효 시간 (밀리초, 기본 2분)
     * @param {boolean} persist localStorage 저장 여부
     */
    async get(key, fetcher, ttl = 120000, persist = false) {
        const now = Date.now();
        
        // 1. 메모리 캐시 확인
        let cached = cache.get(key);
        
        // 2. 메모리에 없으면 localStorage 확인 (persist 옵션 시)
        if (!cached && persist) {
            const stored = localStorage.getItem(`cache_${key}`);
            if (stored) {
                try {
                    cached = JSON.parse(stored);
                } catch (e) {
                    localStorage.removeItem(`cache_${key}`);
                }
            }
        }

        // 3. 유효한 캐시가 있으면 반환
        if (cached && (now - cached.timestamp < ttl)) {
            return cached.data;
        }

        // 4. 이미 진행 중인 요청 재사용
        if (pendingRequests.has(key)) {
            return pendingRequests.get(key);
        }

        // 5. 실제 요청 실행
        const promise = (async () => {
            try {
                const data = await fetcher();
                const entry = { data, timestamp: Date.now() };
                cache.set(key, entry);
                if (persist) {
                    localStorage.setItem(`cache_${key}`, JSON.stringify(entry));
                }
                return data;
            } catch (error) {
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
        if (key) {
            cache.delete(key);
            localStorage.removeItem(`cache_${key}`);
        } else {
            cache.clear();
            Object.keys(localStorage).forEach(k => {
                if (k.startsWith('cache_')) localStorage.removeItem(k);
            });
        }
    }
};
