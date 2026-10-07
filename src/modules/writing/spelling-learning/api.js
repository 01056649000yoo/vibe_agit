import { supabase } from '../../../lib/supabaseClient';
import { readLocalStorageJson, writeLocalStorageJson } from '../../../lib/browserStorage';
import { applyCommonResponse, combineStudentEntries, COMMON_SPELLING_CACHE_KEY } from './entryCache';

// 한 화면에서 밑줄 부품 여럿이 동시에 부르므로 잠깐 묶는다. 다음에 글쓰기 화면을 열면 "바뀌었나요?"만 다시 묻는다.
const STUDENT_ENTRIES_CACHE_MS = 5 * 60_000;

let studentEntriesPromise = null;
let studentEntriesCache = [];
let studentEntriesExpiresAt = 0;
let studentEntriesCacheUserId = null;

const unwrap = ({ data, error }) => {
    if (error) throw error;
    return data;
};

const fetchStudentEntries = async () => {
    const fetchV3 = async (since) => unwrap(await supabase.rpc('get_student_spelling_entries_v3', { p_common_since: since }));
    const cached = readLocalStorageJson(COMMON_SPELLING_CACHE_KEY, null);
    let response = await fetchV3(cached?.version || null);
    let { next, consistent } = applyCommonResponse(cached, response);
    if (!consistent && !response?.full) {
        // 합친 개수가 서버와 다르면 저장본을 버리고 처음부터 받는다.
        response = await fetchV3(null);
        ({ next } = applyCommonResponse(null, response));
    }
    writeLocalStorageJson(COMMON_SPELLING_CACHE_KEY, next);
    return combineStudentEntries(next.entries, response?.class_entries);
};

export const spellingLearningApi = {
    getTeacherWorkspace: async (classId) => unwrap(await supabase.rpc(
        'get_spelling_learning_workspace_v3', { p_class_id: classId }
    )),
    getStudentEntries: async ({ force = false } = {}) => {
        const { data: { session } = {} } = await supabase.auth.getSession();
        const currentUserId = session?.user?.id || null;
        if (studentEntriesCacheUserId !== currentUserId) {
            studentEntriesPromise = null;
            studentEntriesCache = [];
            studentEntriesExpiresAt = 0;
            studentEntriesCacheUserId = currentUserId;
        }
        if (!force && Date.now() < studentEntriesExpiresAt) return studentEntriesCache;
        if (!studentEntriesPromise) {
            const requestUserId = currentUserId;
            const requestPromise = fetchStudentEntries()
                .then((entries) => {
                    if (studentEntriesCacheUserId === requestUserId) {
                        studentEntriesCache = entries;
                        studentEntriesExpiresAt = Date.now() + STUDENT_ENTRIES_CACHE_MS;
                    }
                    return entries;
                })
                .finally(() => {
                    if (studentEntriesPromise === requestPromise) studentEntriesPromise = null;
                });
            studentEntriesPromise = requestPromise;
        }
        return studentEntriesPromise;
    },
    invalidateStudentEntries: () => {
        studentEntriesPromise = null;
        studentEntriesCache = [];
        studentEntriesExpiresAt = 0;
    },
    saveEntry: async (classId, entry, approve = false) => unwrap(await supabase.rpc(
        'save_spelling_learning_entry_v1', {
            p_class_id: classId,
            p_entry_id: entry.id || null,
            p_entry: entry,
            p_approve: approve
        }
    )),
    recordSearchBatch: async (items) => {
        if (!items.length) return null;
        return unwrap(await supabase.rpc('record_spelling_search_batch_v2', { p_items: items.slice(0, 20) }));
    },
    generateDraft: async (wrongExpression) => {
        const result = await supabase.functions.invoke('vibe-ai', {
            body: { type: 'SPELLING_DRAFT', content: wrongExpression }
        });
        if (result.error) throw result.error;
        const raw = String(result.data?.text || '');
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('AI 초안 형식을 확인하지 못했습니다.');
        return JSON.parse(match[0]);
    }
};
