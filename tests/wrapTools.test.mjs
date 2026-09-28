import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareCounts, countChecks } from '../scripts/checkCounts.mjs';
import { readSources } from '../scripts/check-counts.mjs';
import { buildDraft } from '../scripts/wrapDraft.mjs';
import { lintEntries } from '../scripts/worklogRotation.mjs';

/*
 * 마감 도우미(2026-09-28): `npm run wrap` 의 초안과 검사 개수 장부.
 */

test('초안은 git 이 아는 칸을 채우고, 15줄 안이며, 빈칸 그대로면 형식 검사가 막는다', () => {
    const draft = buildDraft({
        date: '2026-10-02',
        model: 'Claude',
        commits: [{ hash: 'bbb', subject: 'b' }, { hash: 'aaa', subject: 'a' }],
        files: ['supabase/migrations/20261400_x_y.sql', 'tests/sql/20261400_x_y.smoke.sql', 'src/a.jsx', 'WORKLOG.md']
    });
    assert.match(draft, /^## 2026-10-02 — .+ \(Claude\)$/m);
    assert.match(draft, /`aaa`~`bbb` \(2커밋\)/, '오래된 커밋부터 최신까지');
    assert.match(draft, /DB 1\(/);
    assert.match(draft, /마이그레이션 `20261400`/);
    assert.match(draft, /검사 파일 1개/);
    assert.ok(draft.split('\n').length <= 15);

    const withHead = `# W\n\n${draft}\n`;
    const problems = lintEntries(withHead, { since: '2026-10-01' });
    assert.ok(problems.some((p) => p.includes('초안 빈칸')), '빈칸을 안 채우고 붙여 넣으면 잡아야 한다');

    const filled = withHead
        .replace('제목을 쓰세요', '무엇을 고침')
        .replace(/\(왜 했는지[^)]*\)/, '까닭')
        .replace('(돌린 검사와 결과를 쓰세요)', '통과')
        .replace(/\(없으면 "없음"\.[^)]*\)/, '없음');
    assert.deepEqual(lintEntries(filled, { since: '2026-10-01' }), []);
});

test('검사 개수: 선언·파일을 세고, 건너뛰기는 따로 센다', () => {
    const counts = countChecks({
        unit: { 'a.test.mjs': "test('x', () => {});\n  test('y', () => {});\ntest.skip('z', () => {});", 'b.test.mjs': '' },
        smoke: ['1.smoke.sql', '2.smoke.sql'],
        e2e: { 'e.spec.cjs': "test.describe('d', () => {\n    test('p', async () => {});\n});" }
    });
    assert.deepEqual(counts, { unitFiles: 2, unitTests: 2, sqlSmokes: 2, e2eFiles: 1, e2eTests: 1, skipped: 1 });
});

test('검사 개수: 줄면 문제, 건너뛰기는 늘면 문제', () => {
    const ledger = { unitFiles: 10, unitTests: 100, sqlSmokes: 5, e2eFiles: 1, e2eTests: 3, skipped: 0 };
    assert.deepEqual(compareCounts(ledger, ledger), { drops: [], rises: [] });
    const { drops, rises } = compareCounts(ledger, { ...ledger, unitTests: 99, sqlSmokes: 6, skipped: 1 });
    assert.deepEqual(drops.map((d) => d.key), ['unitTests', 'skipped']);
    assert.deepEqual(rises.map((r) => r.key), ['sqlSmokes']);
});

test('실제 저장소의 검사 수가 장부보다 줄지 않았다', () => {
    const ledger = JSON.parse(readFileSync('ops/check-counts.json', 'utf8'));
    const { drops } = compareCounts(ledger.counts, countChecks(readSources()));
    assert.deepEqual(drops.map((d) => `${d.label} ${d.before}→${d.now}`), [],
        '검사가 줄었다. 실수면 되살리고, 일부러면 `npm run checks:count -- --update --reason "까닭"`');
});
