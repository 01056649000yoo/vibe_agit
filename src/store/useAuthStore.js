import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';

/**
 * 전역 인증 및 프로필 상태 관리 스토어 (Zustand) 🔐
 */
export const useAuthStore = create((set, get) => ({
    session: null,
    profile: null,
    studentSession: null,
    loading: true,

    // 상태 변경 액션들
    setSession: (session) => set({ session }),
    setProfile: (profile) => set({ profile }),
    setStudentSession: (studentSession) => set({ studentSession }),
    setLoading: (loading) => set({ loading }),

    // 1. 프로필 정보 가져오기 (교사/관리자)
    fetchProfile: async (userId) => {
        if (!userId) return;
        
        const startTime = performance.now();
        console.log('⏱️ [AuthStore] 프로필 로드 시작...');

        try {
            const [updateResult, profileResult, teacherResult] = await Promise.all([
                // (A) 최근 접속 시간 업데이트
                supabase
                    .from('profiles')
                    .update({ last_login_at: new Date().toISOString() })
                    .eq('id', userId),
                
                // (B) 프로필 정보 조회
                supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .maybeSingle(),
                
                // (C) 교사 정보 조회
                supabase
                    .from('teachers')
                    .select('name, school_name')
                    .eq('id', userId)
                    .maybeSingle()
            ]);

            console.log(`✅ [AuthStore] 프로필 로드 완료 (${(performance.now() - startTime).toFixed(0)}ms)`);

            const profileData = profileResult.data;
            const teacherData = teacherResult.data;

            if (profileData) {
                const fullProfile = {
                    ...profileData,
                    role: profileData.role || 'TEACHER',
                    teacherName: teacherData?.name,
                    schoolName: teacherData?.school_name
                };
                set({ profile: fullProfile });
                return fullProfile;
            } else if (teacherData) {
                const basicProfile = {
                    role: 'TEACHER',
                    teacherName: teacherData.name,
                    schoolName: teacherData.school_name
                };
                set({ profile: basicProfile });
                return basicProfile;
            }
        } catch (e) {
            console.warn("[AuthStore] 프로필 로드 중 오류 발생:", e);
        }
        return null;
    },

    // 2. 초기 세션 확인 및 복구
    checkSessions: async () => {
        const start = performance.now();
        console.log('🔍 [AuthStore] 세션 확인 중...');

        if (!supabase) {
            set({ loading: false });
            return;
        }

        try {
            const { data: { session } } = await supabase.auth.getSession();
            console.log(`🔐 [AuthStore] 세션 획득 완료 (${(performance.now() - start).toFixed(0)}ms)`);

            if (session) {
                const isAnonymous = session.user?.is_anonymous === true;

                if (isAnonymous) {
                    // 학생 익명 세션 복구
                    try {
                        const { data: studentResult } = await supabase.rpc('get_student_by_auth');
                        if (studentResult?.success) {
                            const s = studentResult.student;
                            const sessionData = {
                                id: s.id,
                                name: s.name,
                                code: s.code,
                                classId: s.classId,
                                className: s.className,
                                role: 'STUDENT'
                            };
                            set({ studentSession: sessionData, session: null, profile: null });
                            localStorage.setItem('student_session', JSON.stringify(sessionData));
                        } else {
                            console.warn('[AuthStore] 학생 auth 바인딩 해제됨');
                            localStorage.removeItem('student_session');
                            set({ studentSession: null });
                        }
                    } catch (e) {
                        console.warn('[AuthStore] 학생 세션 복구 실패:', e);
                        localStorage.removeItem('student_session');
                        set({ studentSession: null });
                    }
                } else {
                    // 교사의 경우
                    localStorage.removeItem('student_session');
                    set({ session, studentSession: null });
                    await get().fetchProfile(session.user.id);
                }
            } else {
                localStorage.removeItem('student_session');
                set({ session: null, profile: null, studentSession: null });
            }
        } catch (e) {
            console.error("[AuthStore] 세션 체크 중 오류:", e);
        } finally {
            set({ loading: false });
        }
    },

    // 3. 교사/관리자 로그아웃
    logout: async () => {
        try {
            if (supabase) await supabase.auth.signOut();
        } catch (err) {
            console.warn('[AuthStore] Logout failed:', err);
        } finally {
            set({ session: null, profile: null, studentSession: null });
            const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-'));
            sbKeys.forEach(k => localStorage.removeItem(k));
            window.location.href = '/';
        }
    },

    // 4. 학생 로그아웃
    studentLogout: async () => {
        try {
            await supabase.rpc('unbind_student_auth');
            await supabase.auth.signOut();
        } catch (e) {
            console.warn('[AuthStore] 학생 로그아웃 실패:', e);
        } finally {
            localStorage.removeItem('student_session');
            set({ studentSession: null, session: null, profile: null });
            const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-'));
            sbKeys.forEach(k => localStorage.removeItem(k));
            window.location.href = '/';
        }
    }
}));
