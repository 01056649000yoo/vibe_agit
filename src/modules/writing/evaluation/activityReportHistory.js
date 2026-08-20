const createEmptyHistory = () => ({
    byStudentId: new Map(),
    byName: new Map(),
    format: 'empty'
});

export const serializeActivityReportHistory = (studentResults) => JSON.stringify({
    version: 2,
    students: (studentResults || [])
        .filter((result) => result?.student?.id && result?.ai_synthesis)
        .map((result) => ({
            studentId: String(result.student.id),
            studentName: String(result.student.name || ''),
            synthesis: String(result.ai_synthesis)
        }))
});

export const parseActivityReportHistory = (content) => {
    const result = createEmptyHistory();
    if (typeof content !== 'string' || !content.trim()) return result;

    try {
        const parsed = JSON.parse(content);
        if (Number(parsed?.version) === 2 && Array.isArray(parsed.students)) {
            parsed.students.forEach((student) => {
                const studentId = String(student?.studentId || '').trim();
                const synthesis = String(student?.synthesis || '').trim();
                if (studentId && synthesis) result.byStudentId.set(studentId, synthesis);
            });
            result.format = 'v2';
            return result;
        }
    } catch {
        // 과거 이력은 `[이름]\n내용` 평문이므로 아래에서 읽기 호환한다.
    }

    content.split('\n\n---\n\n').forEach((section) => {
        const match = section.match(/^\[(.*?)\]\n([\s\S]*)$/);
        const name = String(match?.[1] || '').trim();
        const synthesis = String(match?.[2] || '').trim();
        if (name && synthesis) result.byName.set(name, synthesis);
    });
    result.format = 'legacy';
    return result;
};

export const resolveActivityReportHistory = (content, students) => {
    const parsed = parseActivityReportHistory(content);
    const nameCounts = (students || []).reduce((counts, student) => {
        const name = String(student?.name || '').trim();
        if (name) counts.set(name, (counts.get(name) || 0) + 1);
        return counts;
    }, new Map());

    return (students || []).reduce((resolved, student) => {
        const studentId = String(student?.id || '').trim();
        const name = String(student?.name || '').trim();
        const synthesis = parsed.byStudentId.get(studentId)
            || (nameCounts.get(name) === 1 ? parsed.byName.get(name) : '');
        if (studentId && synthesis) resolved.set(studentId, synthesis);
        return resolved;
    }, new Map());
};
