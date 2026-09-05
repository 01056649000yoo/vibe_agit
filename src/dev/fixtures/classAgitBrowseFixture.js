import { CLASS_AGIT_LIMITS as limits } from '../../modules/class-agit/policy.js';
import { getSourceExclusion } from '../../modules/class-agit/sourceContract.js';

export function createClassAgitBrowseFixture(sources, classId, missions) {
    const current = () => [...sources.values()];
    const catalog = missions || [...new Map(current().map((source) => [source.mission_id, {
        id: source.mission_id, title: source.group_title || '우리 반 미션', format: source.input_template || 'prose',
        supported: !source.input_template || ['freeform', 'poem'].includes(source.input_template), archived: false, created_at: source.updated_at,
    }])).values()];
    const page = (all, cursor, count, version) => {
        const start = cursor ? all.findIndex((item) => item.id === cursor.id) + 1 : 0;
        const items = all.slice(start, start + count); const more = start + count < all.length;
        return { version, class_id: classId, items: structuredClone(items), has_more: more, next_cursor: more ? { id: items.at(-1).id, updated_at: items.at(-1).updated_at, created_at: items.at(-1).created_at, name: items.at(-1).student_name } : null };
    };
    const readCurrentSource = (id) => {
        const value = sources.get(id);
        return value && !getSourceExclusion(value, classId) ? structuredClone(value) : null;
    };
    return {
        async getMissions(_classId, { query = '', scope = 'all', cursor = null } = {}) {
            const all = catalog.filter((item) => item.title.includes(query) && (scope === 'all' || item.archived === (scope === 'archived')))
                .map((item) => ({ ...item, review_count: current().filter((entry) => entry.mission_id === item.id && !getSourceExclusion(entry, classId)).length }));
            return page(all, cursor, limits.missionPage, 1);
        },
        async getCandidates(_classId, { query = '', mission_id = null, cursor = null, sort = 'recent', excluded_students = [] } = {}) {
            const all = current().filter((item) => !getSourceExclusion(item, classId) && (!mission_id || item.mission_id === mission_id)
                && !excluded_students.includes(item.student_id) && `${item.title} ${item.student_name}`.toLocaleLowerCase('ko-KR').includes(query.toLocaleLowerCase('ko-KR')))
                .sort((a, b) => (sort === 'student' ? a.student_name.localeCompare(b.student_name, 'ko') : 0) || b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id))
                .map(({ id, title, student_name, student_id, mission_id: missionId, group_title, content, updated_at }) => ({ id, title, student_name, student_id, mission_id: missionId, group_title, excerpt: content.slice(0, 96), updated_at }));
            return page(all, cursor, limits.candidatePage, 2);
        },
        async getSources(_classId, ids) {
            if (!ids.length || ids.length > limits.selectionBatch || new Set(ids).size !== ids.length) throw new Error('서로 다른 작품을 1~50편 선택해 주세요.');
            return ids.map((id) => { const value = readCurrentSource(id); return { id, source: value, reason: value ? null : '현재 수록할 수 없습니다. 원글 상태를 확인해 주세요.' }; });
        },
    };
}
