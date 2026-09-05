import { assertStudentRoom, assertStudentWork } from '../api/studentContract.js';
export const validShareToken = (token) => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
export function createShareToken() {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) => value.toString(16).padStart(2, '0')).join('');
}
export function buildShareUrl(token, origin = window.location.origin) {
    if (!validShareToken(token)) throw new Error('공유 주소를 확인할 수 없습니다.');
    return `${origin}/exhibition#${token}`;
}
const errors = { unavailable: '공유가 끝났거나 지금 볼 수 없는 전시입니다. 안내받은 주소를 확인해 주세요.', changed: '전시가 새로 바뀌었습니다. 전시실에서 작품을 다시 골라 주세요.', rate_limited: '잠시 많은 분이 전시를 보고 있습니다. 잠시 뒤 다시 열어 주세요.' };
export function assertPublicGalleryResponse(data, room, workId = null, publicationNo = null) {
    if (data?.error) throw new Error(Reflect.get(errors, data.error) || errors.unavailable);
    if (data?.version !== 1 || Object.keys(data).some((key) => !['version', 'title', 'introduction', 'publication_no', 'room', 'total_count', 'rooms', 'items', 'work'].includes(key))) throw new Error('전시 응답을 확인할 수 없습니다.');
    if (!workId) assertStudentRoom({ version: data.version, exhibition_id: 'public', title: data.title, introduction: data.introduction, publication_no: data.publication_no, room: data.room, total_count: data.total_count, rooms: data.rooms, items: data.items }, 'public', room);
    else {
        assertStudentRoom({ version: data.version, exhibition_id: 'public', title: data.title, introduction: data.introduction, publication_no: data.publication_no, room: 0, total_count: data.total_count, rooms: data.rooms, items: [] }, 'public', 0);
        assertStudentWork({ version: data.version, publication_no: data.publication_no, work: data.work, previous_id: null, next_id: null }, workId, publicationNo);
    }
    return data;
}
// 인증 클라이언트를 가져오지 않는다. 로그인 세션·학생 홈·분석을 시작하지 않는 익명 POST 경로.
export const publicClassAgitApi = {
    async read(token, room = 0, workId = null, publicationNo = null) {
        if (!validShareToken(token)) throw new Error(errors.unavailable);
        let response;
        try { response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/read_public_class_agit_v1`, {
            method: 'POST', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
            headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
            body: JSON.stringify({ p_token: token, p_room: room, p_work_id: workId, p_publication_no: publicationNo }), signal: AbortSignal.timeout(8000),
        }); } catch { throw new Error('네트워크 연결을 확인하고 전시를 다시 열어 주세요.'); }
        let data; try { data = await response.json(); } catch { throw new Error('전시를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.'); }
        if (!response.ok && !data?.error) throw new Error('전시를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.');
        return assertPublicGalleryResponse(data, room, workId, publicationNo);
    },
};
