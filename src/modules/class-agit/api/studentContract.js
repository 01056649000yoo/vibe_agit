import { CLASS_AGIT_LIMITS as limits, isClassAgitWorkId as workId } from '../policy.js';

const fail = () => { throw new Error('전시 응답을 확인하지 못했어요. 다시 열어 주세요.'); };
const keys = (data, allowed) => data && Object.keys(data).every((key) => allowed.includes(key));
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && Array.from(value).length <= max;
const summaryKeys = new Set(['id', 'title', 'author', 'format', 'kindLabel', 'excerpt']);
const validSummary = (work, detailed = false) => record(work) && workId(work.id) && text(work.title, 200)
    && text(work.author, 30) && ['prose', 'poem'].includes(work.format) && text(work.kindLabel, 10) && text(work.excerpt, 96)
    && Object.keys(work).every((key) => summaryKeys.has(key) || (detailed && key === 'blocks'));

export function assertStudentExhibitions(data) {
    if (!keys(data, ['version', 'exhibitions']) || data?.version !== 1 || !Array.isArray(data.exhibitions) || data.exhibitions.length > 20
        || data.exhibitions.some((item) => !record(item) || !text(item.id, 36) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id) || !text(item.title, 80) || !text(item.introduction, 240)
            || !Number.isInteger(item.publication_no) || item.publication_no < 1
            || Object.keys(item).some((key) => !['id', 'title', 'introduction', 'publication_no', 'published_at'].includes(key)))) fail();
    return data;
}

export function assertStudentRoom(data, id, room) {
    if (!keys(data, ['version', 'exhibition_id', 'publication_no', 'title', 'introduction', 'room', 'rooms', 'total_count', 'items', 'visibility_revision']) || data?.version !== 1 || data.exhibition_id !== id || data.room !== room || !text(data.title, 80) || !text(data.introduction, 240)
        || !Number.isInteger(data.publication_no) || data.publication_no < 1
        || (data.visibility_revision !== undefined && (!Number.isInteger(data.visibility_revision) || data.visibility_revision < 1))
        || !Number.isInteger(data.total_count) || data.total_count < 0 || data.total_count > limits.maxWorks
        || !Array.isArray(data.rooms) || data.rooms.length > limits.maxRooms
        || data.rooms.some((entry, index) => !keys(entry, ['number', 'count']) || entry.number !== index + 1 || !Number.isInteger(entry.count) || entry.count < 1 || entry.count > limits.worksPerRoom)
        || data.rooms.reduce((sum, entry) => sum + entry.count, 0) !== data.total_count
        || !Array.isArray(data.items) || data.items.length > (room === 0 ? 0 : limits.worksPerRoom)
        || data.items.length !== (room === 0 ? 0 : (data.rooms.find((entry) => entry.number === room)?.count ?? 0))
        || data.items.some((item) => !validSummary(item)) || new Set(data.items.map((item) => item.id)).size !== data.items.length) fail();
    return data;
}

export function assertStudentWork(data, id, publicationNo) {
    if (!keys(data, ['version', 'publication_no', 'previous_id', 'next_id', 'work', 'visibility_revision']) || data?.version !== 1 || data.publication_no !== publicationNo || data.work?.id !== id || !validSummary(data.work, true)
        || !Array.isArray(data.work.blocks) || data.work.blocks.length < 1 || data.work.blocks.length > 200
        || data.work.blocks.some((block) => !text(block, 20000)) || !text(data.work.blocks.join(' '), 20000)
        || (data.previous_id != null && !workId(data.previous_id)) || (data.next_id != null && !workId(data.next_id))) fail();
    return data;
}
