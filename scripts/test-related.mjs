#!/usr/bin/env node
/**
 * 바뀐 파일을 지키는 검사만 먼저: `npm run test:related`
 *
 *   npm run test:related                 아직 안 올린 변경(origin/main 대비 + 작업트리) 기준
 *   npm run test:related -- src/a.jsx    파일을 직접 줘도 된다
 *   npm run test:related -- --list       돌리지 않고 목록만
 *
 * 찾는 법은 `scripts/relatedTests.mjs`. 전체 검사는 푸시 전 검사(`npm run test:all`)가 그대로 돌린다.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { relatedTests } from './relatedTests.mjs';

const git = (...args) => {
    try {
        return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return '';
    }
};

export const changedFiles = () => {
    const base = process.env.CHECKLIST_BASE || (git('rev-parse', '--verify', '--quiet', 'origin/main') ? 'origin/main' : 'HEAD');
    return [...new Set([
        ...git('diff', '--name-only', base).split('\n'),
        ...git('ls-files', '--others', '--exclude-standard').split('\n')
    ].filter(Boolean))];
};

export const readUnitTests = () => Object.fromEntries(readdirSync('tests')
    .filter((f) => f.endsWith('.test.mjs'))
    .map((f) => [`tests/${f}`, readFileSync(`tests/${f}`, 'utf8')]));

const isMain = process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].split('/').at(-1));
if (isMain) {
    const args = process.argv.slice(2);
    const listOnly = args.includes('--list');
    const given = args.filter((a) => !a.startsWith('--'));
    const files = given.length ? given : changedFiles();
    const tests = relatedTests(files, readUnitTests());

    if (tests.length === 0) {
        console.log(`바뀐 파일 ${files.length}개를 지키는 단위 검사를 못 찾았습니다. 필요하면 \`npm run test:all\`.`);
        process.exit(0);
    }
    console.log(`바뀐 파일 ${files.length}개 → 관련 검사 ${tests.length}개`);
    for (const t of tests) console.log(`    ${t}`);
    if (listOnly) process.exit(0);
    const result = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' });
    process.exit(result.status ?? 1);
}
