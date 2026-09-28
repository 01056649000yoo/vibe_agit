/**
 * 월간 회고 한 장 — 순수 함수. 명령은 `scripts/retro.mjs`(`npm run retro -- YYYY-MM`).
 *
 * 왜 (2026-09-28): 다음 달에 검사를 어디 더 만들지, 어느 곳을 정리할지를 감이 아니라 숫자로 정한다.
 * 원인 태그: fix 한 WORKLOG 항목의 `한 일` 줄에 `[원인: 반쪽수정]` 처럼 하나 단다. 정해 둔 이름만 센다 —
 * 이름이 제각각이면 합칠 수 없다. 새 원인이 필요하면 CAUSES 에 더한다.
 */

export const CAUSES = ['반쪽수정', '배포순서', '화면미확인', '추정단정', '낡은검사', '권한', '외부변화', '기타'];

const count = (list) => {
    const map = new Map();
    for (const key of list) map.set(key, (map.get(key) || 0) + 1);
    return [...map].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
};

/** `type(scope): …` 또는 `type: …` 커밋 제목. */
export const parseSubject = (subject) => {
    const match = subject.match(/^([a-z]+)(?:\(([^)]+)\))?!?:/i);
    return match ? { type: match[1].toLowerCase(), scope: match[2] || null } : { type: '기타', scope: null };
};

/** 바뀐 파일 → 영역. 커밋 제목에 범위를 안 쓴 fix 가 많아(9월 102개 중 80개) 폴더로 센다. */
export const areaOf = (file) => {
    const rules = [/^src\/modules\/[^/]+\/[^/]+/, /^src\/components\/[^/]+/, /^src\/[^/]+/, /^supabase\/functions\/[^/]+/, /^supabase\/migrations/, /^[^/]+(?=\/)/];
    for (const rule of rules) {
        const match = file.match(rule);
        if (match) return match[0];
    }
    return '(맨 위 파일)';
};

/** 작업 모델 이름을 묶는다 — `Claude Opus 5.5`·`Claude, 읽기 전용` → `Claude`, `GPT/Codex` → `Codex`. */
export const normalizeModel = (raw) => {
    const text = raw.split(/[,·]/)[0].trim();
    if (/codex|gpt/i.test(text)) return 'Codex';
    if (/claude/i.test(text)) return 'Claude';
    if (/gemini/i.test(text)) return 'Gemini';
    if (/kiro/i.test(text)) return 'Kiro';
    return text || '알 수 없음';
};

/** 로그 글들에서 그 달 항목만: 제목·모델·원인 태그. */
export const monthEntries = (logs, month) => logs.flatMap((text) => text.split(/^(?=## \d{4}-\d{2}-\d{2})/m).filter((block) => block.startsWith('## ')))
    .filter((block) => block.startsWith(`## ${month}-`))
    .map((block) => {
        const title = block.split('\n')[0];
        const model = title.match(/\(([^()]+)\)\s*$/)?.[1] ?? '';
        const causes = [...block.matchAll(/\[원인:\s*([^\]]+)\]/g)].flatMap((m) => m[1].split(/[,·]/).map((c) => c.trim()));
        return { title, model: normalizeModel(model), causes };
    });

/**
 * @param {{ month: string, subjects: string[], fixFiles?: string[][], logs: string[], openItems: {id:string,kind:string,since:string}[],
 *           pitfallsAdded: number, checkCounts: Record<string, number|null>, failures: string[], today: string }} input
 */
export const buildRetro = ({ month, subjects, fixFiles = [], logs, openItems, pitfallsAdded, checkCounts, failures, today }) => {
    const commits = subjects.map(parseSubject);
    const fixes = commits.filter((c) => c.type === 'fix');
    const entries = monthEntries(logs, month);
    const causes = entries.flatMap((e) => e.causes);
    const unknownCauses = causes.filter((c) => !CAUSES.includes(c));
    const stale = openItems.filter((i) => (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${i.since}T00:00:00Z`)) / 86400000 > 30);
    const table = (rows, head) => (rows.length ? [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)] : ['(없음)']);

    const [year, mm] = month.split('-');
    return [
        `# 월간 회고 — ${year}년 ${Number(mm)}월`,
        '',
        `> ⚙️ \`npm run retro -- ${month}\` 가 만든 초안이다(${today}). 숫자 아래 \`판단\` 만 사람이 쓴다.`,
        '> 원인 태그는 WORKLOG `한 일` 줄의 `[원인: …]` 에서 센다. 이름은 `scripts/retroReport.mjs` 의 CAUSES 만.',
        '',
        '## 숫자',
        '',
        `- 커밋 ${commits.length}개 · 고침(fix) ${fixes.length}개 (${commits.length ? Math.round((fixes.length / commits.length) * 100) : 0}%) · WORKLOG 항목 ${entries.length}개`,
        `- 새 교훈(PITFALLS) ${pitfallsAdded}줄 · 열린 일 ${openItems.length}개(30일 넘음 ${stale.length})`,
        `- 검사 장부: 단위 ${checkCounts.unitTests ?? '?'} · SQL 스모크 ${checkCounts.sqlSmokes ?? '?'} · 화면 ${checkCounts.e2eTests ?? '?'} · 건너뛰기 ${checkCounts.skipped ?? '?'}`,
        '',
        '### 커밋 종류',
        '',
        ...table(count(commits.map((c) => c.type)), ['종류', '수']),
        '',
        '### 고침이 몰린 곳 (fix 커밋이 바꾼 영역, 테스트·문서 제외)',
        '',
        ...table(count(fixFiles.flatMap((files) => [...new Set(files
            .filter((file) => !/^(tests|e2e|docs)\//.test(file) && !file.endsWith('.md')).map(areaOf))])).slice(0, 12), ['영역', '고친 커밋']),
        ...(fixes.length ? ['', `커밋 제목에 범위를 쓴 fix: ${fixes.filter((c) => c.scope).length}/${fixes.length} — \`fix(범위): …\` 로 쓰면 더 잘 모인다.`] : []),
        '',
        '### 모델별 작업 항목',
        '',
        ...table(count(entries.map((e) => e.model)), ['모델', '항목']),
        '',
        '### 사고 원인 태그',
        '',
        ...table(count(causes), ['원인', '수']),
        ...(unknownCauses.length ? ['', `⚠️ 정해 두지 않은 원인 이름: ${[...new Set(unknownCauses)].join(', ')} — CAUSES 에 더하거나 이름을 맞추세요.`] : []),
        ...(causes.length === 0 ? ['', '원인 태그가 아직 없다. fix 항목의 `한 일` 줄에 `[원인: …]` 를 달면 다음 달부터 센다.'] : []),
        '',
        '### 푸시 전 검사에서 자주 깨진 것',
        '',
        ...table(count(failures).slice(0, 10), ['검사', '실패']),
        ...(failures.length === 0 ? ['', '(기록 없음 — `~/.agit/check-failures.log` 는 푸시 전 검사가 실패할 때 쌓인다)'] : []),
        '',
        '### 30일 넘은 열린 일',
        '',
        ...(stale.length ? stale.map((i) => `- ${i.id} ${i.kind} (${i.since})`) : ['(없음)']),
        '',
        '## 판단 (사람이 쓴다)',
        '',
        '- 고침이 몰린 곳 중 구조를 손볼 곳:',
        '- 두 번째로 난 사고 → 검사로 바꿀 것:',
        '- 다음 달 줄일 것 / 얼릴 기능:',
        ''
    ].join('\n');
};
