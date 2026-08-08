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
