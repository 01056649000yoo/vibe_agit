/*
 * 학생 글쓰기 맞춤법 밑줄 자료를 기기에 저장해 두고 바뀐 것만 받는다(2026-10-07, 선생님 결정).
 *
 * - 공통 자료는 모든 학생이 같으므로 **기기에 한 벌**만 둔다(한 태블릿을 여러 학생이 써도 한 번만 받는다).
 * - 서버 get_student_spelling_entries_v3 가 마지막 시각 뒤에 바뀐 줄만 준다. 꺼진 줄은 status 가 approved 가 아니다.
 * - 합친 뒤 개수가 서버와 다르면 믿지 않고 처음부터 다시 받는다(부르는 쪽이 consistent 를 본다).
 * - 반별 수첩은 몇 개뿐이라 저장하지 않고 늘 통째로 받는다.
 */
export const COMMON_SPELLING_CACHE_KEY = 'agit:spelling-common:v1';

const byNewest = (left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || ''));
const strip = (row) => {
    const entry = { ...row, scope: 'common' };
    delete entry.status;
    return entry;
};

/** 저장해 둔 공통 자료(cached)에 서버 응답을 덮는다. `{ next, consistent }` */
export function applyCommonResponse(cached, response) {
    const rows = Array.isArray(response?.common) ? response.common : [];
    const base = response?.full || !Array.isArray(cached?.entries) ? [] : cached.entries;
    const byId = new Map(base.map((entry) => [entry.id, entry]));
    for (const row of rows) {
        if (row?.status && row.status !== 'approved') byId.delete(row.id);
        else if (row?.id) byId.set(row.id, strip(row));
    }
    const entries = [...byId.values()].sort(byNewest);
    return {
        next: { version: response?.common_version || null, entries },
        consistent: entries.length === Number(response?.common_count ?? entries.length)
    };
}

const keyOf = (entry) => String(entry?.wrong_expression || '').trim().toLocaleLowerCase('ko-KR');

/** 공통 자료가 먼저, 같은 틀린 표현의 반별 수첩은 뺀다(서버 v2 가 하던 규칙 그대로). */
export function combineStudentEntries(commonEntries, classEntries) {
    const seen = new Set();
    const result = [];
    for (const entry of commonEntries || []) {
        const key = keyOf(entry);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result.push(entry);
    }
    for (const entry of classEntries || []) {
        const key = keyOf(entry);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result.push({ ...entry, scope: 'class' });
    }
    return result;
}
