#!/usr/bin/env node
/**
 * 월간 회고 초안: `npm run retro -- 2026-09` (달을 빼면 지난달)
 * docs/retro/YYYY-MM.md 를 만든다. 이미 있으면 `## 판단` 아래(사람이 쓴 부분)는 그대로 둔다.
 * 무엇을 세는지는 `scripts/retroReport.mjs` 머리말. 매월 1일 백업 리허설 결과와 함께 본다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRetro } from './retroReport.mjs';
import { parseOpenItems } from './workMemory.mjs';

const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');
const git = (...args) => {
    try {
        return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return '';
    }
};

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const lastMonth = (() => {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7);
})();
const month = process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a)) || lastMonth;
const next = (() => {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d.toISOString().slice(0, 10);
})();

const subjects = git('log', `--since=${month}-01T00:00:00+09:00`, `--until=${next}T00:00:00+09:00`, '--format=%s').split('\n').filter(Boolean);
// fix 커밋마다 바뀐 파일 목록. 구분자로 널 문자를 쓴다(제목에 무엇이 들어 있어도 안 깨지게).
const fixFiles = git('log', `--since=${month}-01T00:00:00+09:00`, `--until=${next}T00:00:00+09:00`, '--format=%x00%s', '--name-only')
    .split('\0').slice(1).map((chunk) => chunk.split('\n')).filter(([subject]) => /^fix\b/i.test(subject))
    .map(([, ...files]) => files.filter(Boolean));
const logs = [read('WORKLOG.md'), ...(existsSync('docs/worklog')
    ? readdirSync('docs/worklog').filter((f) => /^\d{4}-\d{2}\.md$/.test(f)).map((f) => read(`docs/worklog/${f}`))
    : [])];
const pitfallsAdded = git('log', `--since=${month}-01T00:00:00+09:00`, `--until=${next}T00:00:00+09:00`, '-p', '--format=', '--', 'docs/wiki/PITFALLS.md')
    .split('\n').filter((l) => /^\+- /.test(l)).length;
const checkCounts = existsSync('ops/check-counts.json') ? JSON.parse(read('ops/check-counts.json')).counts : {};
const failureLog = path.join(os.homedir(), '.agit', 'check-failures.log');
const failures = read(failureLog).split('\n').filter((l) => l.startsWith(month)).map((l) => l.split('\t')[1]).filter(Boolean);

const draft = buildRetro({ month, subjects, fixFiles, logs, openItems: parseOpenItems(read('docs/OPEN_ITEMS.md')), pitfallsAdded, checkCounts, failures, today });

const file = `docs/retro/${month}.md`;
const previous = read(file);
const judged = previous.includes('## 판단') ? previous.slice(previous.indexOf('## 판단')) : null;
const output = judged ? `${draft.slice(0, draft.indexOf('## 판단'))}${judged}` : draft;
mkdirSync('docs/retro', { recursive: true });
writeFileSync(file, output);
console.log(`✔ ${file} — 커밋 ${subjects.length}개, 작업 항목은 파일에서. \`## 판단\` 을 채우세요.`);
