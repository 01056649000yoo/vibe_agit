export const readLocalStorageJson = (key, fallback) => {
    if (typeof window === 'undefined') return fallback;
    try {
        const value = window.localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
    } catch (error) {
        console.warn(`[Storage] 저장된 설정을 읽지 못해 기본값을 사용합니다: ${key}`, error);
        return fallback;
    }
};

/*
 * 화면 편의 설정만 저장한다(글씨 크기·펼침 상태 같은 것).
 * 비밀 값이나 학생 식별 정보는 넣지 않는다. 저장이 막힌 브라우저에서도 화면은 계속 동작해야 하므로
 * 실패는 조용히 넘기고 기본값으로 그린다.
 */
export const writeLocalStorageJson = (key, value) => {
    if (typeof window === 'undefined') return false;
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.warn(`[Storage] 설정을 저장하지 못했습니다: ${key}`, error);
        return false;
    }
};
