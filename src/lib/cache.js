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
                } catch {
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
    /**
     * 이미 손에 있는 결과를 캐시에 직접 넣는다.
     * "더 보기"처럼 이어 받아 합친 목록을 다시 요청하지 않고 담아 둘 때 쓴다.
     */
    set(key, data) {
        cache.set(key, { data, timestamp: Date.now() });
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
    },
    /**
     * 앞부분이 같은 키를 한꺼번에 버린다.
     * 글 한 편을 고치면 그 학급의 목록·집계·현황이 같이 틀어지는데, 어떤 키가 떠 있는지
     * 부르는 쪽이 일일이 알 수 없다. `classKey()` 로 키를 만들어 두면 학급 하나만 비울 수 있다.
     * @param {string} prefix 예: `posts:<classId>`
     */
    invalidatePrefix(prefix) {
        if (!prefix) return;
        cache.forEach((_, key) => {
            if (key.startsWith(prefix)) cache.delete(key);
        });
        Object.keys(localStorage).forEach((k) => {
            if (k.startsWith(`cache_${prefix}`)) localStorage.removeItem(k);
        });
    }
};

/**
 * 학급에 매인 조회의 캐시 키를 만든다. **학급 글 조회의 캐시 키는 모두 이걸로 만든다.**
 * 앞이 `posts:<classId>` 로 고정되므로 `dataCache.invalidatePrefix(classScope(classId))`
 * 한 번으로 그 학급 것만 비울 수 있다.
 *
 * @param {string} classId 학급 id
 * @param {string} name 조회 이름 (예: 'reading-log-list')
 * @param {object} params 조회를 가르는 값들 (필터·검색어·페이지 등)
 */
export const classKey = (classId, name, params = {}) => {
    const parts = Object.entries(params)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => `${k}=${v ?? ''}`);
    return `posts:${classId}:${name}${parts.length ? `:${parts.join('&')}` : ''}`;
};

/** 그 학급의 캐시를 전부 가리키는 접두사. */
export const classScope = (classId) => `posts:${classId}`;
