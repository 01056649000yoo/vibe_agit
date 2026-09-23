import { supabase } from '../../../../lib/supabaseClient';
import { assertStudentBooks } from '../../../class-agit/anthology/studentContract.js';

/*
 * 📚 문집 나눔 — 교사가 우리 반 학급 문집(글꽃 책방 확정판)을 소개하고, 학생은 읽고 방문록을 남긴다.
 * 방문록은 문집 주인 반 교사가 승인해야 모두에게 보인다(SQL 20261335).
 *
 * 책 응답은 우리 반 서가(get_my_class_agit_books_v1)와 같은 모양이라 같은 검사(assertStudentBooks)를 쓴다.
 * 방문록은 그 모양 밖이므로 따로 떼어 검사한다.
 */
const GUESTBOOK_STATUSES = new Set(['pending', 'approved', 'rejected']);

const call = async (name, params) => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data;
};

const assertGuestbook = (guestbook) => {
    if (!guestbook || !Array.isArray(guestbook.entries) || guestbook.entries.length > 100
        || (guestbook.mine !== null && !GUESTBOOK_STATUSES.has(guestbook.mine?.status))) {
        throw new Error('방문록 응답을 확인하지 못했어요. 다시 열어 주세요.');
    }
    return guestbook;
};

export const neighborBooksApi = {
    // 교사: 우리 반 문집·공간에 소개된 문집·올라간 방문록
    async getTeacherBooks({ spaceId, classId }) {
        const data = await call('get_neighbor_teacher_books_v1', { p_space_id: spaceId, p_actor_class_id: classId });
        if (Number(data?.version) !== 1 || !Array.isArray(data?.my_books) || !Array.isArray(data?.shared_books)
            || !Array.isArray(data?.approved_entries)) {
            throw new Error('문집 나눔 응답을 확인하지 못했습니다.');
        }
        return data;
    },
    async shareBook({ spaceId, classId, bookId }) {
        const data = await call('share_neighbor_book_v1', { p_space_id: spaceId, p_actor_class_id: classId, p_book_id: bookId });
        if (data?.success !== true) throw new Error('문집 소개 결과를 확인하지 못했습니다.');
        return data;
    },
    async withdrawBook({ spaceId, classId, sharedBookId }) {
        const data = await call('withdraw_neighbor_book_v1', { p_space_id: spaceId, p_actor_class_id: classId, p_shared_book_id: sharedBookId });
        if (data?.success !== true) throw new Error('소개 내리기 결과를 확인하지 못했습니다.');
        return data;
    },
    // action: 'approve' | 'reject'(올라간 방문록을 내릴 때도 reject)
    async reviewGuestbook({ spaceId, classId, entryId, action }) {
        const data = await call('review_neighbor_guestbook_v1', { p_space_id: spaceId, p_actor_class_id: classId, p_entry_id: entryId, p_action: action });
        if (data?.success !== true || data?.entry_id !== entryId) throw new Error('방문록 확인 결과를 확인하지 못했습니다.');
        return data;
    },

    // 학생: 소개된 문집 목록·책 한 권(차례 또는 작품 한 편)·방문록 쓰기
    async getSpaceBooks(spaceId) {
        const data = await call('get_neighbor_space_books_v1', { p_space_id: spaceId });
        if (Number(data?.version) !== 1 || !Array.isArray(data?.books) || data.books.length > 60) {
            throw new Error('문집 목록을 확인하지 못했어요.');
        }
        return data.books;
    },
    async getSharedBook({ spaceId, sharedBookId, workId = null }) {
        const data = await call('get_neighbor_shared_book_v1', { p_space_id: spaceId, p_shared_book_id: sharedBookId, p_work_id: workId });
        const { guestbook, ...book } = data || {};
        assertStudentBooks(book, book.id, workId);
        return { ...book, guestbook: workId ? null : assertGuestbook(guestbook) };
    },
    async saveGuestbook({ spaceId, sharedBookId, content, action = 'save' }) {
        const data = await call('save_neighbor_guestbook_v1', { p_space_id: spaceId, p_shared_book_id: sharedBookId, p_content: content, p_action: action });
        if (data?.success !== true) throw new Error('방문록을 저장하지 못했어요.');
        return data;
    }
};
