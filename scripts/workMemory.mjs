/**
 * 작업 기억 조회 도우미 — 열린 일 장부·PITFALLS 경로 꼬리표. 순수 함수.
 * 쓰는 곳: `scripts/checklist.mjs`(관련 교훈·오래된 열린 일), `scripts/recall.mjs`, 검사.
 *
 * 왜 (2026-09-28): 교훈 32개를 매번 다 훑으라고 하면 정작 그 순간에는 안 떠오른다. 각 교훈에
 * "어느 파일을 고칠 때 떠올릴지" 경로 꼬리표를 달아, 바뀐 파일에 맞는 것만 띄운다.
 */

export const OPEN_ITEM_KINDS = ['결정', '운영', '후속', '실기기', '관측', '제보'];
export const MAX_OPEN_ITEMS = 60;
export const STALE_DAYS = 30;

/** docs/OPEN_ITEMS.md 표를 읽는다. */
export const parseOpenItems = (markdown) => markdown.split('\n')
    .filter((line) => /^\| OI-\d{3} \|/.test(line))
    .map((line) => {
        const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
        const [id, kind, text, source, since] = cells;
        return { id, kind, text, source, since, cellCount: cells.length };
    });

export const lintOpenItems = (items) => {
    const problems = [];
    const seen = new Set();
    let previous = 0;
    for (const item of items) {
        if (item.cellCount !== 5) problems.push(`${item.id}: 칸이 ${item.cellCount}개입니다(5개).`);
        if (seen.has(item.id)) problems.push(`${item.id}: 번호가 겹칩니다.`);
        seen.add(item.id);
        const number = Number(item.id.slice(3));
        if (number <= previous) problems.push(`${item.id}: 번호는 오름차순으로(새 일은 맨 아래, 다음 번호).`);
        previous = number;
        if (!OPEN_ITEM_KINDS.includes(item.kind)) problems.push(`${item.id}: 종류 \`${item.kind}\` 는 ${OPEN_ITEM_KINDS.join('·')} 중 하나여야 합니다.`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(item.since || '')) problems.push(`${item.id}: 생긴 날은 YYYY-MM-DD.`);
        if (!item.text) problems.push(`${item.id}: 내용이 비었습니다.`);
        if (!item.source) problems.push(`${item.id}: 출처가 비었습니다 — 어디서 나온 일인지 적어야 다음 사람이 확인한다.`);
        if (item.kind === '제보' && !/언제|기기|재현/.test(item.text)) {
            problems.push(`${item.id}: 제보는 언제·기기·재현 조건을 적습니다.`);
        }
    }
    if (items.length > MAX_OPEN_ITEMS) problems.push(`열린 일이 ${items.length}개입니다(상한 ${MAX_OPEN_ITEMS}). 끝난 것을 지우거나 BACKLOG 로 내리세요.`);
    return problems;
};

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
export const staleOpenItems = (items, today, days = STALE_DAYS) => items.filter((item) => daysBetween(item.since, today) > days);

/**
 * 경로 꼬리표 — 교훈 줄 끝의 `[경로: a, b/**, *.sql]`.
 * `**` 는 아무 폴더, `*` 는 한 칸 안 아무 글자. 앞에 폴더가 없는 패턴(`*.sql`)은 어느 폴더든 이름만 본다.
 */
export const globToRegExp = (glob) => {
    let source = '';
    for (let i = 0; i < glob.length; i++) {
        const ch = glob[i];
        if (ch === '*' && glob[i + 1] === '*') {
            source += '.*';
            i += 1;
            if (glob[i + 1] === '/') i += 1;
        } else if (ch === '*') source += '[^/]*';
        else if ('\\^$+?.()|{}[]'.includes(ch)) source += `\\${ch}`;
        else source += ch;
    }
    return new RegExp(glob.includes('/') ? `^${source}$` : `(^|/)${source}$`);
};

/** PITFALLS 를 갈래·교훈·꼬리표로 읽는다. 교훈은 `- ` 줄과 그 들여쓴 이어짐. */
export const parsePitfalls = (markdown) => {
    const lessons = [];
    let section = null;
    let current = null;
    for (const line of markdown.split('\n')) {
        if (line.startsWith('## ')) {
            section = line.slice(3).trim();
            current = null;
        } else if (section && line.startsWith('- ')) {
            current = { section, lines: [line] };
            lessons.push(current);
        } else if (current && /^\s+\S/.test(line)) current.lines.push(line);
        else current = null;
    }
    return lessons.map((lesson) => {
        const text = lesson.lines.join('\n');
        const pathTag = text.match(/\[경로:\s*([^\]]+)\]/);
        const guardTag = text.match(/\[검사:\s*([^\]]+)\]/);
        const headline = (lesson.lines[0].match(/\*\*(.+?)\*\*/)?.[1] ?? lesson.lines[0].slice(2)).trim();
        return {
            section: lesson.section,
            headline,
            paths: pathTag ? pathTag[1].split(',').map((p) => p.trim()).filter(Boolean) : [],
            guards: guardTag ? guardTag[1].split(',').map((p) => p.trim()).filter(Boolean) : []
        };
    });
};

/** 바뀐 파일에 해당하는 교훈만. */
export const lessonsFor = (lessons, files) => lessons.filter((lesson) => lesson.paths.length
    && lesson.paths.some((glob) => files.some((file) => globToRegExp(glob).test(file))));

/** 로그 파일들에서 `needle` 이 나오는 항목 제목. 파일 순서대로(WORKLOG 먼저, 최신 보관소 먼저). */
export const entriesMentioning = (logs, needle, limit = 5) => {
    const found = [];
    for (const text of logs) {
        for (const block of text.split(/^(?=## \d{4}-\d{2}-\d{2})/m).filter((block) => block.startsWith('## '))) {
            if (block.includes(needle)) found.push(block.split('\n')[0].replace(/^## /, ''));
            if (found.length >= limit) return found;
        }
    }
    return found;
};
