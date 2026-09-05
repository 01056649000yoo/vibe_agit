import { supabase } from '../../../lib/supabaseClient.js';
import { assertStudentExhibitions, assertStudentRoom, assertStudentWork } from './studentContract.js';

async function call(name, args) {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw error;
    return data;
}

// 학생/학급 ID를 전달하지 않는다. 서버가 현재 auth.uid() 연결로 범위를 정한다.
// 철회 뒤 실패한 응답을 오래된 캐시로 대체하지 않도록 각 화면 열기에서 다시 검증한다.
export const classAgitStudentApi = {
    async getExhibitions() { return assertStudentExhibitions(await call('get_my_class_agit_exhibitions_v1')); },
    async getRoom(id, room = 0) {
        return assertStudentRoom(await call('get_my_class_agit_room_v1', { p_exhibition_id: id, p_room: room, p_layout_version: 2 }), id, room);
    },
    async getWork(id, publicationNo, workId) {
        return assertStudentWork(await call('get_my_class_agit_work_v1', {
            p_exhibition_id: id, p_publication_no: publicationNo, p_work_id: workId, p_layout_version: 2,
        }), workId, publicationNo);
    },
};
