import { supabase } from '../../../lib/supabaseClient.js';
import { dataCache, classScope } from '../../../lib/cache.js';
import { assertBookEdition, assertBookWorkspace, buildBookSavePayload } from '../anthology/contract.js';
import { assertClassAgitShareWorkspace } from './contract.js';
const call = async (name, args) => {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw error;
    return data;
};
export const classAgitReleaseApi = {
    getAccess: (classId) => call('get_class_agit_access_v1', { p_class_id: classId }),
    manageRollout: (payload = null) => call('manage_class_agit_rollout_v1', { p_payload: payload }),
    async getBooks(classId, bookId = null) {
        return assertBookWorkspace(await call('get_class_agit_book_workspace_v1', { p_class_id: classId, p_book_id: bookId }), classId);
    },
    async bookAction(classId, action, payload) {
        const data = assertBookWorkspace(await call('run_class_agit_book_action_v1', { p_class_id: classId, p_action: action, p_payload: payload }), classId);
        dataCache.invalidatePrefix(classScope(classId)); return data;
    },
    saveBook(classId, book) { return this.bookAction(classId, 'save', buildBookSavePayload(book)); },
    async getBookPreview(classId, bookId, revision) { return assertBookEdition(await call('get_class_agit_book_preview_v1', { p_class_id: classId, p_book_id: bookId, p_revision: revision })); },
    async getEdition(classId, editionId) { return assertBookEdition(await call('get_class_agit_book_edition_v1', { p_class_id: classId, p_edition_id: editionId })); },
    async getShare(classId, exhibitionId) {
        const data = await call('get_class_agit_share_workspace_v1', { p_class_id: classId, p_exhibition_id: exhibitionId });
        return assertClassAgitShareWorkspace(data);
    },
    shareAction: (classId, exhibitionId, action, payload) => call('run_class_agit_share_action_v1', { p_class_id: classId, p_exhibition_id: exhibitionId, p_action: action, p_payload: payload }),
    getStudentBooks: (editionId = null, workId = null) => call('get_my_class_agit_books_v1', { p_edition_id: editionId, p_work_id: workId }),
};
