/**
 * 검사 개수 장부 — 순수 함수. 명령은 `scripts/check-counts.mjs`, 장부는 `ops/check-counts.json`.
 *
 * 왜 (2026-09-28): 롤백 스모크 47개가 낡은 채 "아무도 안 돌리고" 있었고, 반응 취소 알림 결함은
 * 스모크가 잡고 있었는데도 운영까지 갔다. 검사가 조용히 빠지거나 건너뛰어지면 통과 표시는 그대로라
 * 아무도 모른다. 그래서 개수를 장부에 적고 **줄면 막는다.** 늘면 마감(`npm run wrap`)이 장부를 올린다.
 *
 * 세는 법은 일부러 **파일을 읽기만** 한다(검사를 돌리지 않는다). 몇 초 안에 끝나야 모든 검사에 끼울 수 있다.
 * 반복문으로 만드는 검사는 선언 한 줄로 센다 — 정확한 실행 수가 아니라 "지워졌는가"를 보려는 것이다.
 */

const DECLARATION = /^\s*test\(/gm;
const E2E_DECLARATION = /^\s*test\(/gm;
// 건너뛰기·혼자 돌리기는 개수를 줄이지 않고도 검사를 끈다. 따로 센다.
const SKIPPED = /\btest\.(skip|todo|only)\(|\{\s*(skip|todo|only)\s*:\s*true/g;

const countMatches = (text, pattern) => (text.match(pattern) || []).length;

/**
 * @param {{ unit: Record<string,string>, smoke: string[], e2e: Record<string,string>|null }} sources
 *   unit: tests/*.test.mjs 경로 → 내용, smoke: tests/sql/*.smoke.sql 경로, e2e: e2e/*.spec.* 경로 → 내용
 */
export const countChecks = ({ unit, smoke, e2e }) => {
    const unitTexts = Object.values(unit);
    const e2eTexts = e2e ? Object.values(e2e) : [];
    return {
        unitFiles: unitTexts.length,
        unitTests: unitTexts.reduce((sum, text) => sum + countMatches(text, DECLARATION), 0),
        sqlSmokes: smoke.length,
        e2eFiles: e2e ? e2eTexts.length : null,
        e2eTests: e2e ? e2eTexts.reduce((sum, text) => sum + countMatches(text, E2E_DECLARATION), 0) : null,
        skipped: [...unitTexts, ...e2eTexts].reduce((sum, text) => sum + countMatches(text, SKIPPED), 0)
    };
};

export const COUNT_LABELS = {
    unitFiles: '단위 검사 파일',
    unitTests: '단위 검사 선언',
    sqlSmokes: 'SQL 롤백 스모크',
    e2eFiles: '화면 검사 파일',
    e2eTests: '화면 검사 선언',
    skipped: '건너뛰기·혼자 돌리기'
};

/** 장부와 견준다. `skipped` 는 늘면 문제, 나머지는 줄면 문제. */
export const compareCounts = (ledger, current) => {
    const drops = [];
    const rises = [];
    for (const key of Object.keys(COUNT_LABELS)) {
        const before = ledger[key] ?? 0;
        // 못 센 항목(null)은 견주지 않는다 — 폴더가 없는 환경에서 거짓 경보를 내지 않게.
        if (current[key] === null || current[key] === undefined) continue;
        const now = current[key];
        const worse = key === 'skipped' ? now > before : now < before;
        const better = key === 'skipped' ? now < before : now > before;
        if (worse) drops.push({ key, label: COUNT_LABELS[key], before, now });
        else if (better) rises.push({ key, label: COUNT_LABELS[key], before, now });
    }
    return { drops, rises };
};
