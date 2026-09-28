#!/usr/bin/env node
/**
 * 작업 로그 명령.
 *
 *   npm run worklog:rotate            오래된 항목을 docs/worklog/YYYY-MM.md 로 옮긴다
 *   npm run worklog:rotate -- --dry-run   무엇을 옮길지만 보여 준다
 *   npm run worklog:lint              새 항목 형식(네 칸·15줄)을 본다
 *
 * 기준과 까닭은 `scripts/worklogRotation.mjs` 머리말에 있다.
 * 옮기기 전후 항목 수가 한 개라도 다르면 아무 파일도 쓰지 않고 멈춘다 — 기록을 잃지 않는 것이 먼저다.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { countEntries, KEEP_DAYS, KEEP_MIN, lintEntries, rotate } from './worklogRotation.mjs';

const ROOT = process.cwd();
const WORKLOG = path.join(ROOT, 'WORKLOG.md');
const ARCHIVE_DIR = path.join(ROOT, 'docs', 'worklog');

const readArchives = () => {
    if (!existsSync(ARCHIVE_DIR)) return {};
    return Object.fromEntries(readdirSync(ARCHIVE_DIR)
        .filter((file) => /^\d{4}-\d{2}\.md$/.test(file))
        .map((file) => [file.slice(0, 7), readFileSync(path.join(ARCHIVE_DIR, file), 'utf8')]));
};

const total = (worklog, archives) => countEntries(worklog)
    + Object.values(archives).reduce((sum, text) => sum + countEntries(text), 0);

const [command = 'rotate', ...flags] = process.argv.slice(2);

if (command === 'lint') {
    const problems = lintEntries(readFileSync(WORKLOG, 'utf8'));
    if (problems.length === 0) {
        console.log('✔ WORKLOG 새 항목 형식 정상.');
        process.exit(0);
    }
    console.log('✖ WORKLOG 새 항목 형식 문제:');
    for (const problem of problems) console.log(`    ${problem}`);
    process.exit(1);
}

if (command !== 'rotate') {
    console.error(`모르는 명령: ${command} (rotate | lint)`);
    process.exit(2);
}

const dryRun = flags.includes('--dry-run');
const worklog = readFileSync(WORKLOG, 'utf8');
const archives = readArchives();
const result = rotate(worklog, archives);

const before = total(worklog, archives);
const after = total(result.worklog, result.archives);
if (before !== after) {
    console.error(`✖ 옮기기 전 ${before}항목, 후 ${after}항목 — 어긋나서 아무것도 쓰지 않았습니다.`);
    process.exit(1);
}

const changedFiles = [];
if (result.worklog !== worklog) changedFiles.push(['WORKLOG.md', WORKLOG, result.worklog]);
for (const [month, text] of Object.entries(result.archives)) {
    if (archives[month] !== text) changedFiles.push([`docs/worklog/${month}.md`, path.join(ARCHIVE_DIR, `${month}.md`), text]);
}

if (result.moved === 0 && changedFiles.length === 0) {
    console.log(`✔ 옮길 항목 없음 (최근 ${KEEP_DAYS}일·최소 ${KEEP_MIN}항목 기준, 전체 ${before}항목).`);
    process.exit(0);
}

console.log(`${dryRun ? '· (미리보기) ' : '✔ '}${result.moved}항목 이동 — 기준일 ${result.cutoff} 이하, 전체 ${before}항목 그대로.`);
for (const [label] of changedFiles) console.log(`    ${label}`);
if (dryRun) process.exit(0);

mkdirSync(ARCHIVE_DIR, { recursive: true });
for (const [, file, text] of changedFiles) writeFileSync(file, text);
