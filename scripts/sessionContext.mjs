/**
 * SESSION_CONTEXT.md 생성기 — 순수 함수. 명령은 `scripts/build-session-context.mjs`.
 *
 * 왜 만드나 (2026-09-28):
 *   손으로 쓰던 SESSION_CONTEXT 가 12,757자까지 자라 Codex 훅 상한(12,000자)을 넘었다. 끝이 잘려
 *   뒤에 붙던 "최근 작업 5건"은 Codex 에 한 번도 닿지 않았고, "현재 위치"는 8월 날짜에 멈춰 있었다.
 *   모델마다 받는 내용이 달랐던 셈이다. 그래서 오래 가는 규칙(docs/wiki/SESSION_RULES.md)만 손으로 쓰고,
 *   지금 상태는 ROADMAP·WORKLOG 에서 매번 뽑는다. 출력에 오늘 날짜 같은 흔들리는 값은 넣지 않는다 —
 *   같은 입력이면 같은 결과여야 "생성본과 같은가" 검사가 뜻을 가진다.
 */

export const MAX_CONTEXT_CHARS = 8000;
export const MAX_RULES_CHARS = 4500;
export const ROADMAP_ITEMS = 6;
export const WORKLOG_ITEMS = 5;
const LINE_CAP = 200;

const clip = (text, cap = LINE_CAP) => (text.length > cap ? `${text.slice(0, cap - 1)}…` : text);

/** docs/wiki/ 기준 링크를 저장소 루트 기준으로 바꾼다(SESSION_CONTEXT 는 루트에 있다). */
// 순서가 중요하다 — 맨 이름(`PITFALLS.md`)을 먼저 docs/wiki/ 로 옮기고 나서 `../../` 를 벗긴다.
// 거꾸로 하면 `../../FEATURE_MAP.md` 가 `FEATURE_MAP.md` 가 된 뒤 docs/wiki/ 로 잘못 붙는다.
export const rebaseLinks = (markdown) => markdown
    .replace(/\]\((?![a-z]+:|#|\/|\.)([^)\s]+\.md)\)/gi, '](docs/wiki/$1)')
    .replace(/\]\(\.\.\/\.\.\//g, '](')
    .replace(/\]\(\.\.\//g, '](docs/');

/** 규칙 파일에서 머리 설명(첫 `## ` 앞)을 떼고 본문만 쓴다. */
const rulesBody = (rules) => {
    const index = rules.search(/^## /m);
    return (index < 0 ? rules : rules.slice(index)).trim();
};

/** ROADMAP `## 🧭 현재 위치` 절의 최상위 항목 첫 줄들. */
export const roadmapCurrent = (roadmap, limit = ROADMAP_ITEMS) => {
    const lines = roadmap.split('\n');
    const start = lines.findIndex((line) => /^## .*현재 위치/.test(line));
    if (start < 0) return [];
    const items = [];
    for (let i = start + 1; i < lines.length && items.length < limit; i++) {
        const line = lines[i];
        if (/^#{2,3} /.test(line)) break;
        if (/^- /.test(line)) items.push(clip(line.trim()));
    }
    return items;
};

/** WORKLOG 최신 항목의 제목과 `남은 것` 첫 줄. */
export const worklogRecent = (worklog, limit = WORKLOG_ITEMS) => {
    const blocks = worklog.split(/^(?=## \d{4}-\d{2}-\d{2})/m).slice(1, limit + 1);
    return blocks.map((block) => {
        const [title, ...body] = block.split('\n');
        const left = body.find((line) => line.startsWith('- **남은 것'));
        const leftText = left ? left.replace(/^- \*\*남은 것[^*]*\*\*:?\s*/, '').trim() : '';
        return { title: clip(title.replace(/^## /, '')), left: leftText ? clip(leftText, 160) : '' };
    });
};

/** 열린 일 중 세션 시작 때 알아야 할 것(선생님 결정·운영)만. 나머지는 파일에서 본다. */
export const openItemsForSession = (markdown = '') => markdown.split('\n')
    .filter((line) => /^\| OI-\d{3} \| (결정|운영) \|/.test(line))
    .map((line) => {
        const [id, kind, text] = line.split('|').slice(1, 4).map((cell) => cell.trim());
        return `- ${id} ${kind} · ${clip(text, 140)}`;
    });

export const buildSessionContext = ({ rules, roadmap, worklog, openItems = '' }) => {
    const current = roadmapCurrent(roadmap);
    const open = openItemsForSession(openItems);
    const recent = worklogRecent(worklog);
    const parts = [
        '# 세션 활성 컨텍스트',
        '',
        '> ⚙️ **생성 파일이다 — 직접 고치지 않는다.** 규칙은 [docs/wiki/SESSION_RULES.md](docs/wiki/SESSION_RULES.md) 를 고치고',
        '> `npm run context:build` 를 돌린다. 지금 상태는 ROADMAP `현재 위치`·WORKLOG 최신 항목에서 뽑는다.',
        '> 세션 시작 훅(Claude·Codex)이 이 파일을 주입한다. 훅이 없는 도구(Kiro 등)는 시작할 때 이 파일부터 읽는다.',
        '',
        rebaseLinks(rulesBody(rules)),
        '',
        `## 지금 상태 — ROADMAP \`현재 위치\` 위 ${current.length}개 (자세한 것은 [ROADMAP.md](ROADMAP.md))`,
        '',
        ...(current.length ? current : ['- (ROADMAP 에서 `현재 위치` 절을 찾지 못했다)']),
        '',
        `## 열린 일 — 결정·운영 ${open.length}건 (전체는 [docs/OPEN_ITEMS.md](docs/OPEN_ITEMS.md), 작업 전에 관련 행을 본다)`,
        '',
        ...(open.length ? open : ['- (없음)']),
        '',
        `## 최근 작업 ${recent.length}건 — 제목과 남은 것 (자세한 것은 [WORKLOG.md](WORKLOG.md) 에서 골라 읽는다)`,
        '',
        ...recent.flatMap(({ title, left }) => [`- ${title}`, ...(left ? [`  - 남은 것: ${left}`] : [])]),
        ''
    ];
    return parts.join('\n');
};
