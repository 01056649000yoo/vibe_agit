import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';
import { useAppStore } from './useAppStore';

const PROFILE_FETCH_DEDUPE_MS = 15000;
const LAST_LOGIN_TOUCH_MS = 10 * 60 * 1000;
const PROFILE_FETCH_TIMEOUT_MS = 5000;

const profileFetchCache = new Map();
const profileFetchInflight = new Map();
const lastLoginTouchCache = new Map();

const buildStudentSession = (student) => ({
    id: student.id,
    name: student.name,
    code: student.code,
    classId: student.classId,
    className: student.className,
    role: 'STUDENT'
});

const clearStudentClientState = () => {
    localStorage.removeItem('student_session');
    const sbKeys = Object.keys(localStorage).filter((key) => key.startsWith('sb-'));
    sbKeys.forEach((key) => localStorage.removeItem(key));
};

const moveToStudentEntry = () => {
    try {
        useAppStore.getState().setInternalPage('main');
        useAppStore.getState().setIsStudentLoginMode(true);
    } catch {
        window.location.href = '/';
    }
};

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const withTimeout = async (promise, ms, label) => {
    let timeoutId;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timeoutId = window.setTimeout(() => reject(new Error(`${label} timeout`)), ms);
            })
        ]);
    } finally {
        window.clearTimeout(timeoutId);
    }
};

const runAfterPaint = (task) => {
    const run = () => {
        task().catch((error) => console.warn('[AuthStore] background task failed:', error));
    };

    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(run, { timeout: 3000 });
    } else {
        window.setTimeout(run, 0);
    }
};

const touchLastLogin = async (userId) => {
    if (
        !userId ||
        (lastLoginTouchCache.has(userId) &&
            Date.now() - lastLoginTouchCache.get(userId) <= LAST_LOGIN_TOUCH_MS)
    ) {
        return;
    }

    const { error } = await supabase
        .from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', userId);

    if (!error) {
        lastLoginTouchCache.set(userId, Date.now());
    }
};

export const useAuthStore = create((set, get) => ({
    session: null,
    profile: null,
    studentSession: null,
    loading: true,

    setSession: (session) => set({ session }),
    setProfile: (profile) => set({ profile }),
    setStudentSession: (studentSession) => set({ studentSession }),
    setLoading: (loading) => set({ loading }),

    fetchProfile: async (userId, options = {}) => {
        if (!userId || !supabase) return null;

        const { force = false, touchLogin = true } = options;
        const startTime = performance.now();
        console.log('[AuthStore] Profile load start...');

        const cached = profileFetchCache.get(userId);
        if (!force && cached && Date.now() - cached.timestamp < PROFILE_FETCH_DEDUPE_MS) {
            if (cached.profile) set({ profile: cached.profile });
            if (touchLogin) runAfterPaint(() => touchLastLogin(userId));
            return cached.profile;
        }

        const inflight = profileFetchInflight.get(userId);
        if (!force && inflight) return inflight;

        const fetchPromise = (async () => {
            try {
                const [profileResult, teacherResult] = await Promise.all([
                    supabase
                        .from('profiles')
                        .select('id, role, full_name, is_approved, primary_class_id, api_mode, created_at, last_login_at')
                        .eq('id', userId)
                        .maybeSingle(),
                    supabase
                        .from('teachers')
                        .select('name, school_name, phone')
                        .eq('id', userId)
                        .maybeSingle()
                ]);

                console.log(`[AuthStore] Profile load complete (${(performance.now() - startTime).toFixed(0)}ms)`);

                const profileData = profileResult.data;
                const teacherData = teacherResult.data;

                if (profileData) {
                    const fullProfile = {
                        ...profileData,
                        role: profileData.role || 'TEACHER',
                        teacherName: teacherData?.name,
                        schoolName: teacherData?.school_name,
                        phone: teacherData?.phone
                    };
                    profileFetchCache.set(userId, { profile: fullProfile, timestamp: Date.now() });
                    set({ profile: fullProfile });
                    if (touchLogin) runAfterPaint(() => touchLastLogin(userId));
                    return fullProfile;
                }

                if (teacherData) {
                    const basicProfile = {
                        role: 'TEACHER',
                        teacherName: teacherData.name,
                        schoolName: teacherData.school_name
                    };
                    profileFetchCache.set(userId, { profile: basicProfile, timestamp: Date.now() });
                    set({ profile: basicProfile });
                    if (touchLogin) runAfterPaint(() => touchLastLogin(userId));
                    return basicProfile;
                }
            } catch (e) {
                console.warn('[AuthStore] Profile load failed:', e);
            } finally {
                profileFetchInflight.delete(userId);
            }

            return null;
        })();

        profileFetchInflight.set(userId, fetchPromise);
        return fetchPromise;
    },

    checkSessions: async () => {
        const start = performance.now();
        console.log('[AuthStore] Checking session...');

        if (!supabase) {
            set({ loading: false });
            return;
        }

        try {
            const { data: { session } } = await supabase.auth.getSession();
            console.log(`[AuthStore] Session loaded (${(performance.now() - start).toFixed(0)}ms)`);

            if (session) {
                const isAnonymous = session.user?.is_anonymous === true;

                if (isAnonymous) {
                    try {
                        const { data: studentResult } = await supabase.rpc('get_student_by_auth');
                        if (studentResult?.success) {
                            const sessionData = buildStudentSession(studentResult.student);
                            set({ studentSession: sessionData, session: null, profile: null });
                            localStorage.setItem('student_session', JSON.stringify(sessionData));
                        } else {
                            console.warn('[AuthStore] Student auth binding is missing.');
                            localStorage.removeItem('student_session');
                            set({ studentSession: null });
                        }
                    } catch (e) {
                        console.warn('[AuthStore] Student session restore failed:', e);
                        localStorage.removeItem('student_session');
                        set({ studentSession: null });
                    }
                } else {
                    localStorage.removeItem('student_session');
                    set({ session, studentSession: null });
                    await withTimeout(
                        get().fetchProfile(session.user.id),
                        PROFILE_FETCH_TIMEOUT_MS,
                        'profile fetch'
                    );
                }
            } else {
                localStorage.removeItem('student_session');
                set({ session: null, profile: null, studentSession: null });
            }
        } catch (e) {
            console.error('[AuthStore] Session check failed:', e);
        } finally {
            set({ loading: false });
        }
    },

    verifyStudentSession: async ({ notify = false } = {}) => {
        if (!supabase) return false;

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session || session.user?.is_anonymous !== true) return false;

            let studentResult = null;
            let error = null;

            for (let attempt = 0; attempt < 2; attempt += 1) {
                const response = await supabase.rpc('get_student_by_auth');
                studentResult = response.data;
                error = response.error;

                if (studentResult?.success) break;
                if (error) {
                    console.warn('[AuthStore] Student session verification failed:', error);
                    return true;
                }
                if (attempt === 0) await wait(300);
            }

            if (studentResult?.success) {
                const sessionData = buildStudentSession(studentResult.student);
                set({ studentSession: sessionData, session: null, profile: null });
                localStorage.setItem('student_session', JSON.stringify(sessionData));
                return true;
            }

            await supabase.auth.signOut();
            clearStudentClientState();
            set({ studentSession: null, session: null, profile: null, loading: false });

            if (notify) {
                window.alert('다른 기기에서 같은 학생 코드로 다시 로그인되어 현재 기기의 연결이 해제되었어요.');
            }

            moveToStudentEntry();
            return false;
        } catch (e) {
            console.warn('[AuthStore] Student session verification exception:', e);
            return true;
        }
    },

    logout: async () => {
        try {
            if (supabase) await supabase.auth.signOut();
        } catch (err) {
            console.warn('[AuthStore] Logout failed:', err);
        } finally {
            set({ session: null, profile: null, studentSession: null, loading: false });
            clearStudentClientState();
            moveToStudentEntry();
        }
    },

    studentLogout: async () => {
        try {
            await supabase.rpc('unbind_student_auth');
            await supabase.auth.signOut();
        } catch (e) {
            console.warn('[AuthStore] Student logout failed:', e);
        } finally {
            set({ studentSession: null, session: null, profile: null, loading: false });
            clearStudentClientState();
            moveToStudentEntry();
        }
    }
}));
