#!/usr/bin/env node
/**
 * 고치기 전에 그 파일의 과거 맥락을 한 번에: `npm run recall -- <파일> [<파일> …]`
 *
 *   ① 최근 커밋 5개(그 파일을 건드린 것)
 *   ② 그 파일 이름이 나오는 WORKLOG·보관소 항목 제목(최신 5개)
 *   ③ 관련 교훈 — PITFALLS 의 `[경로: …]` 꼬리표가 맞는 것
 *   ④ 이 파일을 지키는 검사 — `scripts/relatedTests.mjs`
 *   ⑤ 이 파일이 나오는 열린 일(OPEN_ITEMS)·BACKLOG 줄
 *
 * 왜 (2026-09-28): 9월 fix 커밋은 `neighbor-agit` 6·`class-agit` 3 처럼 같은 곳에 몰렸다. 고치기 전에 그곳의
 * 지난 사고가 먼저 보이면 같은 실수를 덜 한다. 지금은 모델이 매번 grep 으로 흩어진 기록을 찾아야 했다.
 * 읽기만 한다 — 아무 파일도 쓰지 않는다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { guardsFor } from './relatedTests.mjs';
import { entriesMentioning, lessonsFor, parseOpenItems, parsePitfalls } from './workMemory.mjs';

const git = (...args) => {
    try {
        return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return '';
    }
};
const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (files.length === 0) {
    console.log('쓰는 법: npm run recall -- <파일> [<파일> …]   (예: npm run recall -- src/components/student/StudentBottomNav.jsx)');
    process.exit(0);
}

const archives = existsSync('docs/worklog')
    ? readdirSync('docs/worklog').filter((f) => /^\d{4}-\d{2}\.md$/.test(f)).sort().reverse().map((f) => read(`docs/worklog/${f}`))
    : [];
const logs = [read('WORKLOG.md'), ...archives];
const lessons = parsePitfalls(read('docs/wiki/PITFALLS.md'));
const openItems = parseOpenItems(read('docs/OPEN_ITEMS.md'));
const backlog = read('docs/roadmap/BACKLOG.md').split('\n');
const tests = existsSync('tests')
    ? Object.fromEntries(readdirSync('tests').filter((f) => f.endsWith('.test.mjs')).map((f) => [`tests/${f}`, read(`tests/${f}`)]))
    : {};

for (const file of files) {
    const name = path.basename(file).replace(/\.[^.]+$/, '');
    console.log(`\n━━ ${file} ━━`);
    if (!existsSync(file)) console.log('  (지금은 없는 파일 — 지웠거나 새로 만들 파일)');

    const commits = git('log', '-5', '--format=%h %ad %s', '--date=short', '--', file);
    console.log('\n① 최근 커밋');
    console.log(commits ? commits.split('\n').map((l) => `   ${l}`).join('\n') : '   (없음)');

    const entries = entriesMentioning(logs, name);
    console.log(`\n② 작업 기록에 나온 곳 (\`${name}\`)`);
    console.log(entries.length ? entries.map((e) => `   ${e}`).join('\n') : '   (없음)');

    const related = lessonsFor(lessons, [file]);
    console.log('\n③ 관련 교훈 (docs/wiki/PITFALLS.md)');
    console.log(related.length
        ? related.map((l) => `   [${l.section}] ${l.headline}${l.guards.length ? ` — 검사가 막음: ${l.guards.join(', ')}` : ''}`).join('\n')
        : '   (없음)');

    const guards = guardsFor(file, tests);
    console.log('\n④ 이 파일을 지키는 검사');
    console.log(guards.length ? `   ${guards.join('\n   ')}\n   → npm run test:related -- ${file}` : '   (못 찾음 — 새 검사가 필요한지 보세요)');

    const items = openItems.filter((i) => `${i.text} ${i.source}`.includes(name));
    const backlogHits = backlog.filter((l) => l.startsWith('  - [ ]') && l.includes(name));
    console.log('\n⑤ 열린 일');
    if (!items.length && !backlogHits.length) console.log('   (없음)');
    for (const item of items) console.log(`   ${item.id} ${item.kind} · ${item.text.slice(0, 90)}`);
    for (const line of backlogHits.slice(0, 5)) console.log(`   BACKLOG ${line.trim().slice(0, 100)}`);
}
console.log('');
