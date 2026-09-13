import { CLASS_AGIT_LIMITS as limits } from '../policy.js';

/*
 * 주제(미션) 하나를 통째로 담기.
 *
 * 왜 따로 두나: 담기 화면은 원래 전시실 큐레이션용이라 글을 **한 편씩** 고르게 되어 있다.
 * 문집은 대부분 "이 미션 글 다 넣기" 라서, 30편짜리 미션이면 체크를 서른 번 해야 했다(2026-09-14 지적).
 *
 * 한 번의 누름 뒤에 오가는 것이 둘이다 — 목록은 **30편씩** 끊겨 오고(`candidatePage`),
 * 전문 확인은 **50편씩**이다(`selectionBatch`). 둘 다 여기서 이어 붙인다.
 */

// 커서가 잘못돼 제자리를 돌 때 멈추는 고리. 한도만큼 받으려면 최대 몇 번인지에서 두 번을 더한다.
const MAX_ROUNDS = Math.ceil(limits.anthologyWorks / limits.candidatePage) + 2;

export async function collectMissionSources(api, classId, { missionId, capacity, added = new Set(), excludedStudents = [], onProgress } = {}) {
    if (!missionId) throw new Error('담을 미션을 골라 주세요.');
    if (!(capacity > 0)) throw new Error(`문집에 남은 자리가 없습니다. 한 권에 ${limits.anthologyWorks}편까지 담을 수 있습니다.`);
    const ids = [];
    const seen = new Set();
    let cursor = null;
    for (let round = 0; round < MAX_ROUNDS; round++) {
        // 커서를 받아야 다음 쪽을 부를 수 있어 하나씩 기다린다.
        const page = await api.getCandidates(classId, {
            mission_id: missionId, query: '', sort: 'student',
            // 서버가 100명까지만 받는다. 그보다 많으면 거르지 않고 담은 뒤 화면에서 뺀다.
            excluded_students: excludedStudents.length <= limits.maxCandidates ? excludedStudents : [],
            cursor,
        });
        for (const item of page.items) {
            if (added.has(item.id) || seen.has(item.id)) continue;
            seen.add(item.id); ids.push(item.id);
        }
        if (!page.has_more || !page.next_cursor || ids.length >= capacity) break;
        cursor = page.next_cursor;
    }
    const target = ids.slice(0, capacity);
    const sources = []; const skipped = [];
    for (let at = 0; at < target.length; at += limits.selectionBatch) {
        const chunk = target.slice(at, at + limits.selectionBatch);
        // 전문 확인은 한 번에 50편까지다.
        const results = await api.getSources(classId, chunk);
        for (const result of results) {
            if (result.source) sources.push(result.source); else skipped.push({ id: result.id, reason: result.reason });
        }
        onProgress?.({ done: Math.min(at + chunk.length, target.length), total: target.length });
    }
    /*
     * `truncated` = 자리가 모자라 **나머지를 아예 받지 않았다**.
     * 못 담은 수를 세어 주려고 남은 쪽을 마저 받지는 않는다 — 담지도 않을 목록을 받자고
     * 서버를 열 번 더 두들기는 셈이다. 미션에 몇 편이 있는지는 미션 목록이 이미 안다.
     */
    return { sources, skipped, truncated: ids.length > capacity };
}

/** 담기 결과를 교사가 읽을 한 줄로. 숫자만 나열하지 않고 **무엇이 왜 빠졌는지**까지 말한다. */
export function describeBulkResult({ added, skipped, truncated }) {
    const parts = [`${added}편을 초안에 담았습니다.`];
    if (skipped > 0) parts.push(`${skipped}편은 지금 담을 수 없어 건너뛰었습니다.`);
    if (truncated) parts.push(`문집에 남은 자리가 없어 나머지는 담지 못했습니다. 한 권에 ${limits.anthologyWorks}편까지입니다.`);
    return parts.join(' ');
}
