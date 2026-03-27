import { create } from 'zustand';

/**
 * 전역 UI 및 네비게이션 상태 관리 스토어 🎨
 */
export const useAppStore = create((set) => ({
    // 내비게이션 상태
    internalPage: { name: 'main', params: {} },
    directPath: (() => {
        const path = window.location.pathname;
        if (path === '/terms') return 'terms';
        if (path === '/privacy') return 'privacy';
        return null;
    })(),
    
    // UI 상태
    isStudentLoginMode: false,
    isAdminMode: (() => {
        try {
            const saved = localStorage.getItem('app_admin_mode_v2');
            return saved === 'true';
        } catch (_e) {
            return false;
        }
    })(),

    // 액션들
    setInternalPage: (name, params = {}) => set({ internalPage: { name, params } }),
    
    setDirectPath: (path) => {
        set({ directPath: path });
        if (path === 'terms') {
            document.title = '이용약관 | 끄적끄적 아지트';
        } else if (path === 'privacy') {
            document.title = '개인정보 처리방침 | 끄적끄적 아지트';
        } else {
            document.title = '아지트 (agit) - 기록하는 즐거움';
        }
    },

    setIsStudentLoginMode: (isMode) => set({ isStudentLoginMode: isMode }),
    
    setAdminMode: (mode) => {
        set({ isAdminMode: mode });
        localStorage.setItem('app_admin_mode_v2', JSON.stringify(mode));
    },

    resetNavigation: () => set({ internalPage: { name: 'main', params: {} }, directPath: null })
}));
