export const findClassSpellingIssues = (value, entries, limit = 50) => {
    const text = String(value || '');
    const issues = [];
    for (const entry of entries || []) {
        const wrong = String(entry.wrong_expression || '');
        if (!wrong || wrong === entry.correct_expression) continue;
        let start = text.indexOf(wrong);
        while (start >= 0 && issues.length < limit) {
            issues.push({
                id: `class:${entry.id}:${start}`,
                entryId: `class:${entry.id}`,
                start,
                end: start + wrong.length,
                text: wrong,
                wrong,
                right: entry.correct_expression,
                lookup: entry.correct_expression,
                label: entry.label
            });
            start = text.indexOf(wrong, start + wrong.length);
        }
        if (issues.length >= limit) break;
    }
    return issues;
};
