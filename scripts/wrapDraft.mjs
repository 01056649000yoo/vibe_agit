/**
 * 마감 도우미의 순수 함수 — WORKLOG 초안 만들기. 명령은 `scripts/wrap.mjs`.
 *
 * 왜 (2026-09-28): WORKLOG 항목은 평균 18줄, 길게는 49줄이었고 그중 `변경`·`결과/검증` 은 git 에 이미 있는
 * 사실(커밋·파일·새 검사)을 손으로 옮겨 적은 것이었다. 기계가 아는 칸은 기계가 채우고, 모델은
 * `한 일(왜)` 과 `남은 것` 만 쓴다. 초안은 **출력만** 한다 — WORKLOG 에 직접 쓰지 않는다(사람이 고를 수 있게).
 */

const GROUPS = [
    ['DB', (f) => f.startsWith('supabase/')],
    ['검사', (f) => f.startsWith('tests/') || f.startsWith('e2e/')],
    ['화면', (f) => f.startsWith('src/')],
    ['도구', (f) => f.startsWith('scripts/') || f.startsWith('ops/') || f.startsWith('.github/') || f.startsWith('.claude/') || f.startsWith('.codex/')],
    ['문서', (f) => f.endsWith('.md')],
    ['기타', () => true]
];

/** 바뀐 파일을 갈래별로 묶는다. 각 갈래는 앞 몇 개만 이름을 보이고 나머지는 개수로 적는다. */
export const groupFiles = (files, shown = 4) => {
    const buckets = new Map(GROUPS.map(([name]) => [name, []]));
    for (const file of [...new Set(files)].sort()) {
        const [name] = GROUPS.find(([, match]) => match(file));
        buckets.get(name).push(file);
    }
    return [...buckets].filter(([, list]) => list.length).map(([name, list]) => {
        // 이름이 겹치면(.claude·.codex 의 같은 훅) 겹치지 않을 때까지 위 폴더를 붙인다.
        const tail = (file, depth) => file.split('/').slice(-depth).join('/');
        const label = (file) => {
            let depth = 1;
            while (list.some((other) => other !== file && tail(other, depth) === tail(file, depth))) depth += 1;
            return tail(file, depth);
        };
        const names = list.slice(0, shown).map((file) => `\`${label(file)}\``).join('·');
        return `${name} ${list.length}(${names}${list.length > shown ? ` 외 ${list.length - shown}` : ''})`;
    });
};

/**
 * @param {{ date: string, model: string, commits: {hash:string, subject:string}[], files: string[], counts?: string }} input
 * @returns {string} WORKLOG 항목 초안(15줄 이하)
 */
export const buildDraft = ({ date, model, commits, files, counts = '' }) => {
    const migrations = files.filter((f) => /^supabase\/migrations\/.+\.sql$/.test(f)).map((f) => `\`${f.split('/').at(-1).replace(/_.*$/, '')}\``);
    const tests = files.filter((f) => /^tests\/.+\.test\.mjs$|^tests\/sql\/.+\.smoke\.sql$|^e2e\/.+\.spec\./.test(f));
    const range = commits.length === 0
        ? '아직 커밋 전(작업트리)'
        : commits.length === 1 ? `\`${commits[0].hash}\`` : `\`${commits.at(-1).hash}\`~\`${commits[0].hash}\` (${commits.length}커밋)`;
    const lines = [
        `## ${date} — 제목을 쓰세요 (${model})`,
        '- **한 일**: (왜 했는지 한두 줄 — 초안이 채우지 못하는 칸. 고친 일이면 [원인: 반쪽수정|배포순서|화면미확인|추정단정|낡은검사|권한|외부변화|기타])',
        `- **변경**: ${range}. ${groupFiles(files).join(', ') || '바뀐 파일 없음'}.`,
        ...(migrations.length ? [`  마이그레이션 ${migrations.join('·')} — 운영 적용 여부는 \`npm run migrate:status\``] : []),
        `- **결과/검증**: ${tests.length ? `검사 파일 ${tests.length}개 바뀜/추가. ` : ''}${counts || '(돌린 검사와 결과를 쓰세요)'}`,
        '- **남은 것 / 다음**: (없으면 "없음". 새 일은 docs/OPEN_ITEMS.md 에 올리고 → OI-번호, 끝낸 일은 "OI-번호 닫음")'
    ];
    return lines.join('\n');
};

/** 초안의 빈칸 표시. 이것이 남은 채 WORKLOG 에 들어가면 `worklog:lint` 가 막는다. */
export const DRAFT_PLACEHOLDERS = ['제목을 쓰세요', '(왜 했는지 한두 줄', '(돌린 검사와 결과를 쓰세요)', '(없으면 "없음".'];
