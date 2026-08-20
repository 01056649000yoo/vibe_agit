import { supabase } from '../../../lib/supabaseClient';

let studentEntriesPromise = null;

const unwrap = ({ data, error }) => {
    if (error) throw error;
    return data;
};

export const spellingLearningApi = {
    getTeacherWorkspace: async (classId) => unwrap(await supabase.rpc(
        'get_spelling_learning_workspace_v2', { p_class_id: classId }
    )),
    getStudentEntries: async () => {
        if (!studentEntriesPromise) {
            studentEntriesPromise = supabase.rpc('get_student_spelling_entries_v1')
                .then(unwrap)
                .catch((error) => { studentEntriesPromise = null; throw error; });
        }
        return studentEntriesPromise;
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
