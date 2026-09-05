export function assertClassAgitWorkspace(data, classId) {
    if (data?.version !== 1 || data?.class?.id !== classId || !Array.isArray(data.projects) || data.projects.length > 20
        || !Array.isArray(data.students) || data.students.length > 100 || (data.draft && (data.draft.classId !== classId || !Array.isArray(data.draft.items) || data.draft.items.length > 60))) {
        throw new Error('전시 작업공간 응답을 확인할 수 없습니다.');
    }
    return data;
}

export function buildClassAgitSavePayload(draft, expectedRevision) {
    return {
        exhibition_id: draft.id, expected_revision: expectedRevision, title: draft.title, introduction: draft.introduction,
        // 본문/이름/장르/공개 상태는 보내지 않는다. 서버가 최신 원본에서 다시 만든다.
        items: draft.items.map((item) => ({ sourceId: item.sourceId, sourceRevision: item.sourceRevision,
            publicAlias: item.publicAlias, classAcknowledged: item.scopes.class === true })),
    };
}
