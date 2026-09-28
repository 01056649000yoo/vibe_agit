#!/usr/bin/env node
/**
 * 새 검사가 정말 잡는지: `npm run verify:guard`
 *
 *   npm run verify:guard               작업트리의 새·바뀐 단위 검사를, 코드는 HEAD(고치기 전)인 사본에서 돌린다
 *   npm run verify:guard -- <커밋>     그 커밋의 새·바뀐 검사를, 코드는 부모 커밋인 사본에서 돌린다
 *
 * 검사가 **실패하면 좋은 것**이다 — 고치기 전 코드를 잡는다는 뜻이다. 통과하면 그 검사는 아무것도 안 본다.
 *
 * 왜 (2026-09-28): PITFALLS "새로 넣은 검사는 일부러 망가뜨려 실패하는 것까지 본다" 를 지금까지 손으로 했다
 * (렌더 스모크 4건, `20261355` 스모크). 손으로 하면 건너뛴다. 정규식이 아무것도 못 잡던 검사가 여러 번 나왔다.
 *
 * 사본은 `git worktree` 로 임시 폴더에 만들고 끝나면 지운다. 작업트리는 건드리지 않는다.
 * 단위 검사(`tests/*.test.mjs`)만 돌린다. SQL 스모크·화면 검사는 DB·브라우저가 있어야 해서 이름만 알려 준다.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const git = (args, cwd = process.cwd()) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (args, cwd) => {
    try {
        return git(args, cwd);
    } catch {
        return null;
    }
};

const commit = process.argv.slice(2).find((a) => !a.startsWith('--'));
const isTest = (f) => /^tests\/.+\.test\.mjs$/.test(f);
const isOtherGuard = (f) => /^tests\/sql\/.+\.smoke\.sql$|^e2e\/.+\.spec\./.test(f);

let base;
let changed;
if (commit) {
    base = git(['rev-parse', `${commit}^`]);
    changed = git(['diff', '--name-only', base, commit]).split('\n').filter(Boolean);
} else {
    base = git(['rev-parse', 'HEAD']);
    changed = [...new Set([
        ...git(['diff', '--name-only', 'HEAD']).split('\n'),
        ...git(['ls-files', '--others', '--exclude-standard']).split('\n')
    ].filter(Boolean))];
}

const tests = changed.filter(isTest).filter((f) => (commit ? tryGit(['cat-file', '-e', `${commit}:${f}`]) !== null : existsSync(f)));
const others = changed.filter(isOtherGuard);
if (tests.length === 0) {
    console.log('새로 넣거나 바꾼 단위 검사가 없습니다.');
    if (others.length) console.log(`  SQL·화면 검사 ${others.length}개는 DB·브라우저가 필요해 손으로 확인하세요:\n    ${others.join('\n    ')}`);
    process.exit(0);
}

const dir = mkdtempSync(path.join(os.tmpdir(), 'agit-guard-'));
let exitCode = 0;
try {
    git(['worktree', 'add', '--detach', dir, base]);
    if (existsSync('node_modules')) symlinkSync(path.resolve('node_modules'), path.join(dir, 'node_modules'), 'dir');
    // 검사 파일만 새 판으로 — 코드는 고치기 전 그대로 둔다.
    for (const file of tests) {
        if (commit) {
            const content = execFileSync('git', ['show', `${commit}:${file}`]);
            execFileSync('node', ['-e', 'require("fs").mkdirSync(require("path").dirname(process.argv[1]),{recursive:true});require("fs").writeFileSync(process.argv[1], require("fs").readFileSync(0))', path.join(dir, file)], { input: content });
        } else cpSync(file, path.join(dir, file));
    }

    console.log(`고치기 전 코드(${base.slice(0, 8)})에 새 검사 ${tests.length}개를 얹어 돌립니다.\n`);
    const results = [];
    for (const file of tests) {
        const run = spawnSync(process.execPath, ['--test', file], { cwd: dir, encoding: 'utf8' });
        const failed = (run.stdout.match(/^not ok \d+ - (.+)$/gm) || []).map((l) => l.replace(/^not ok \d+ - /, ''));
        results.push({ file, caught: run.status !== 0, failed });
    }
    for (const r of results) {
        if (r.caught) {
            console.log(`✔ 잡음   ${r.file} — 고치기 전 코드에서 ${r.failed.length || '?'}개 실패`);
            for (const name of r.failed.slice(0, 3)) console.log(`           · ${name}`);
        } else {
            console.log(`✖ 못 잡음 ${r.file} — 고치기 전 코드에서도 통과한다. 이 검사가 무엇을 보는지 다시 확인하세요.`);
            exitCode = 1;
        }
    }
    console.log('\n  (새 파일을 부르는 검사는 "파일이 없어" 실패할 수 있다 — 그것도 잡은 것이지만, 실패 이유가 맞는지 한 번 보세요.)');
    if (others.length) console.log(`  SQL·화면 검사 ${others.length}개는 손으로: ${others.join(', ')}`);
} finally {
    tryGit(['worktree', 'remove', '--force', dir]);
    rmSync(dir, { recursive: true, force: true });
    tryGit(['worktree', 'prune']);
}
process.exit(exitCode);
