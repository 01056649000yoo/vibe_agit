import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { countEntries, lintEntries, parseLog, rotate, splitForRotation } from '../scripts/worklogRotation.mjs';

/*
 * 작업 로그 순환(2026-09-28): 옮기는 범위를 모델 판단에 맡기지 않는다.
 * 기준은 `scripts/worklogRotation.mjs` 한 곳 — 최근 7일, 그래도 최소 20항목.
 */

const HEAD = '# 작업 로그 (WORKLOG)\n\n> 규칙\n';
const entry = (date, title = '일', extra = '') => [
    `## ${date} — ${title} (Claude)`,
    '- **한 일**: 무엇',
    '- **변경**: 파일',
    '- **결과/검증**: 통과',
    `- **남은 것 / 다음**: 없음${extra}`
].join('\n');
const log = (dates) => `${HEAD}${dates.map((d) => entry(d)).join('\n\n')}\n\n## 지난 기록\n\n표\n`;

test('최근 7일 안이면 남기고, 오래됐어도 위에서 최소 개수까지는 남긴다', () => {
    const dates = ['2026-10-30', '2026-10-25', '2026-10-23', '2026-10-22', '2026-10-01'];
    const { entries } = parseLog(log(dates));
    const byDays = splitForRotation(entries, { keepDays: 7, keepMin: 1 });
    assert.deepEqual(byDays.keep.map((e) => e.date), ['2026-10-30', '2026-10-25'], '기준일(10-23) 보다 뒤만 남는다 — 최근 7일은 10-24~10-30');
    const byMin = splitForRotation(entries, { keepDays: 7, keepMin: 4 });
    assert.equal(byMin.keep.length, 4, '오래돼도 최소 개수는 남긴다');
});

test('옮긴 항목은 달별 보관소 맨 위로 가고, 항목 수와 내용이 그대로다', () => {
    const worklog = log(['2026-11-02', '2026-10-31', '2026-10-20', '2026-09-30']);
    const archives = { '2026-10': '# 작업 로그 — 2026년 10월\n\n> 보관소\n\n' + entry('2026-10-05', '옛일') + '\n' };
    const result = rotate(worklog, archives, { keepDays: 7, keepMin: 1 });

    assert.equal(result.moved, 2);
    assert.deepEqual(parseLog(result.worklog).entries.map((e) => e.date), ['2026-11-02', '2026-10-31']);
    assert.deepEqual(parseLog(result.archives['2026-10'], { tailFromFirstUndated: false }).entries.map((e) => e.date),
        ['2026-10-20', '2026-10-05'], '새로 옮긴 것이 위, 원래 있던 것이 아래');
    assert.ok(result.archives['2026-09'].startsWith('# 작업 로그 — 2026년 9월\n'), '없는 달은 머리말째 새로 만든다');
    assert.match(result.archives['2026-10'], /^# 작업 로그 — 2026년 10월 \(20일까지\)$/m, '아직 WORKLOG 에 걸친 달은 "N일까지"');

    const all = (r) => countEntries(r.worklog) + Object.values(r.archives).reduce((s, t) => s + countEntries(t), 0);
    assert.equal(all(result), 5);
    assert.match(result.worklog, /\| 2026년 10월 20일까지 \| \[docs\/worklog\/2026-10\.md\]/);
    assert.match(result.worklog, /\| 2026년 9월 \| \[docs\/worklog\/2026-09\.md\]/);
});

test('두 번 돌려도 결과가 같다', () => {
    const first = rotate(log(['2026-11-02', '2026-10-20', '2026-09-30']), {}, { keepDays: 7, keepMin: 1 });
    const second = rotate(first.worklog, first.archives, { keepDays: 7, keepMin: 1 });
    assert.equal(second.moved, 0);
    assert.equal(second.worklog, first.worklog);
    assert.deepEqual(second.archives, first.archives);
});

test('보관소 사이에 끼인 날짜 없는 절은 앞 항목과 함께 그대로 남는다', () => {
    const archive = `# 작업 로그 — 2026년 7월\n\n${entry('2026-07-31')}\n\n## 칭호 개편 계획 (미착수)\n계획 본문\n\n${entry('2026-07-01')}\n`;
    const result = rotate(log(['2026-08-10', '2026-07-30']), { '2026-07': archive }, { keepDays: 7, keepMin: 1 });
    assert.match(result.archives['2026-07'], /## 칭호 개편 계획 \(미착수\)\n계획 본문/);
    assert.equal(countEntries(result.archives['2026-07']), 3);
});

test('새 항목 형식: 네 칸·제목 형식·본문 15줄 상한을 잡는다', () => {
    const since = '2026-10-01';
    assert.deepEqual(lintEntries(log(['2026-10-02']), { since }), []);
    assert.deepEqual(lintEntries(`${HEAD}## 2026-09-01 — 옛 형식\n아무거나\n`, { since }), [], '기준일 전 항목은 보지 않는다');

    const missing = `${HEAD}## 2026-10-02 — 빠짐 (Codex)\n- **한 일**: 무엇\n`;
    const problems = lintEntries(missing, { since });
    assert.ok(problems.some((p) => p.includes('변경')));
    assert.ok(problems.some((p) => p.includes('남은 것')));

    assert.ok(lintEntries(`${HEAD}${entry('2026-10-02').replace(' (Claude)', '')}\n`, { since })
        .some((p) => p.includes('제목')), '모델 이름이 없으면 잡는다');

    const long = `${HEAD}${entry('2026-10-02', '김', '\n' + Array.from({ length: 12 }, (_, i) => `  줄 ${i}`).join('\n'))}\n`;
    assert.ok(lintEntries(long, { since }).some((p) => p.includes('상한')), '16줄 이상이면 잡는다');
});

test('실제 WORKLOG 는 순환이 끝난 상태이고 새 항목 형식을 지킨다', () => {
    const worklog = readFileSync('WORKLOG.md', 'utf8');
    const archives = Object.fromEntries(readdirSync('docs/worklog')
        .filter((f) => /^\d{4}-\d{2}\.md$/.test(f))
        .map((f) => [f.slice(0, 7), readFileSync(`docs/worklog/${f}`, 'utf8')]));
    const result = rotate(worklog, archives);
    assert.equal(result.moved, 0, `옮길 항목 ${result.moved}개가 남았습니다. \`npm run worklog:rotate\` 를 돌리세요.`);
    assert.deepEqual(lintEntries(worklog), [], '`npm run worklog:lint` 가 짚은 것을 고치세요.');
});
