/**
 * 코드 지도의 "필요한 조각만 보여 주기" — 순수 함수. 파일 전체를 읽는 대신 함수 하나·DB 함수 최신 정의만 뽑는다.
 *
 * 왜 (2026-10-25): 토큰은 "찾는 데"보다 "큰 파일을 통째로 읽는 데" 많이 든다. src 7.6MB·migrations 5MB·tests 3MB 중
 * 우리가 필요한 것은 함수 하나(수십 줄)인 경우가 대부분이다. 특히 DB 함수는 같은 이름이 열 번 넘게 다시 정의돼
 * grep 하면 낡은 정의까지 섞여 나온다.
 */

/** 시작 줄(1부터)에서 중괄호가 닫힐 때까지의 줄을 돌려준다. 문자열·주석 속 중괄호는 완벽히 가리지 못하므로 상한을 둔다. */
export const extractBlock = (lines, startLine, maxLines = 160) => {
    const start = Math.max(0, startLine - 1);
    let depth = 0;
    let opened = false;
    for (let index = start; index < Math.min(lines.length, start + maxLines); index += 1) {
        const text = lines.at(index).replace(/\/\/.*$/, '').replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""');
        for (const char of text) {
            if (char === '{') { depth += 1; opened = true; } else if (char === '}') depth -= 1;
        }
        if (opened && depth <= 0) return { from: start + 1, to: index + 1, truncated: false };
        // 중괄호 없는 화살표 한 줄 함수: `const x = (a) => a + 1;`
        if (!opened && /;\s*$/.test(text)) return { from: start + 1, to: index + 1, truncated: false };
    }
    return { from: start + 1, to: Math.min(lines.length, start + maxLines), truncated: true };
};

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 마이그레이션들(이름순 정렬된 [{file, text}])에서 DB 함수의 정의·삭제·권한을 찾아 최신 정의 위치를 돌려준다. */
export const findSqlFunction = (migrations, name) => {
    const definition = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${escape(name)}\\s*\\(`, 'i');
    const drop = new RegExp(`DROP\\s+FUNCTION\\s+(?:IF\\s+EXISTS\\s+)?(?:public\\.)?${escape(name)}\\s*[(;]`, 'i');
    const grant = new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+(?:public\\.)?${escape(name)}\\b`, 'i');
    const defs = [];
    let lastDrop = null;
    for (const { file, text } of migrations) {
        const lines = text.split('\n');
        lines.forEach((line, index) => {
            if (definition.test(line)) defs.push({ file, line: index + 1 });
            else if (drop.test(line)) lastDrop = { file, line: index + 1 };
        });
    }
    const latest = defs.at(-1) || null;
    const droppedAfter = latest && lastDrop && lastDrop.file > latest.file ? lastDrop : null;
    const grants = migrations.filter(({ text }) => text.split('\n').some((line) => grant.test(line))).map(({ file }) => file);
    return { definitions: defs, latest, droppedAfter, grants };
};

/** 최신 정의 본문: 시작 줄부터 `AS $태그$ … $태그$` 가 닫히는 줄까지(없으면 `;` 로 끝나는 줄까지). */
export const extractSqlFunction = (text, startLine, maxLines = 260) => {
    const lines = text.split('\n');
    const start = startLine - 1;
    let tag = null;
    for (let index = start; index < Math.min(lines.length, start + maxLines); index += 1) {
        const line = lines.at(index);
        if (!tag) {
            const opening = /\bAS\s+(\$[A-Za-z_]*\$)/i.exec(line);
            if (opening) { tag = opening[1]; if (line.indexOf(tag, line.indexOf(tag) + tag.length) !== -1) return { from: startLine, to: index + 1, truncated: false }; }
        } else if (line.includes(tag)) {
            return { from: startLine, to: index + 1, truncated: false };
        }
    }
    return { from: startLine, to: Math.min(lines.length, start + maxLines), truncated: true };
};
