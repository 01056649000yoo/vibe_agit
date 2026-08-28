import { create } from 'zustand';
import { SERVICE_PAGE_TITLE } from '../constants/serviceIdentity';

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
        if (path === '/learning-support-software') return 'learning-support-software';
        return null;
    })(),
    
    // UI 상태
    isStudentLoginMode: false,
    isAdminMode: false,

    // 액션들
    setInternalPage: (name, params = {}) => set({ internalPage: { name, params } }),
    
    setDirectPath: (path) => {
        set({ directPath: path });
        if (path === 'terms') {
            document.title = '이용약관 | 끄적끄적 아지트';
        } else if (path === 'privacy') {
            document.title = '개인정보 처리방침 | 끄적끄적 아지트';
        } else if (path === 'learning-support-software') {
            document.title = '학습지원소프트웨어 선정기준 안내 | 끄적끄적 아지트';
        } else {
            document.title = SERVICE_PAGE_TITLE;
        }
    },

    setIsStudentLoginMode: (isMode) => set({ isStudentLoginMode: isMode }),
    
    setAdminMode: (mode) => set({ isAdminMode: mode }),

    resetNavigation: () => set({ internalPage: { name: 'main', params: {} }, directPath: null })
}));
