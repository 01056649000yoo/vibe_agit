#!/usr/bin/env node
/**
 * 마감 한 번에: `npm run wrap`
 *
 * 사용자가 `배포`·`마무리`·`확정` 을 말했을 때 WORKLOG 항목을 쓰기 전·후에 돌린다(`동기화` 때는 돌리지 않는다).
 *   1. WORKLOG 초안 출력 — git 이 아는 칸(변경·검사 파일)을 채운 초안. 맨 위에 붙이고 `한 일`·`남은 것` 을 쓴다.
 *   2. 옛 WORKLOG 항목 옮기기           (npm run worklog:rotate)
 *   3. 새 항목 형식 검사                 (npm run worklog:lint)
 *   3-1. ROADMAP 끝난 절 옮기기·BACKLOG  (npm run roadmap:archive)
 *   4. 검사 개수 장부 — 늘었으면 올리고, 줄었으면 멈춘다 (npm run checks:count)
 *   5. SESSION_CONTEXT 다시 만들기       (npm run context:build)
 *   6. 확인표                            (npm run checklist)
 *
 *   npm run wrap -- --model Claude   초안 제목에 모델 이름을 넣는다(없으면 `작업 모델`)
 *   npm run wrap -- --draft          초안만 출력하고 끝낸다
 *
 * 어느 단계가 실패해도 나머지는 돌려 한 번에 다 보여 주고, 끝에 실패가 있으면 1로 끝낸다.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { buildDraft } from './wrapDraft.mjs';

const args = process.argv.slice(2);
const modelAt = args.indexOf('--model');
const model = modelAt >= 0 && args[modelAt + 1] ? args[modelAt + 1] : '작업 모델';

const git = (...a) => {
    try {
        return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return '';
    }
};

const base = process.env.CHECKLIST_BASE || (git('rev-parse', '--verify', '--quiet', 'origin/main') ? 'origin/main' : 'HEAD');
const commits = git('log', '--format=%h%x09%s', `${base}..HEAD`).split('\n').filter(Boolean)
    .map((line) => { const [hash, ...rest] = line.split('\t'); return { hash, subject: rest.join('\t') }; });
const files = [...new Set([
    ...git('diff', '--name-only', base).split('\n'),
    ...git('ls-files', '--others', '--exclude-standard').split('\n')
].filter(Boolean))];

// 날짜는 맥미니 기준(한국 시각)으로 적는다.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

console.log('\n━━ 1. WORKLOG 초안 (맨 위에 붙이고 `한 일`·`남은 것` 을 채우세요) ━━\n');
console.log(buildDraft({ date: today, model, commits, files }));
if (args.includes('--draft')) process.exit(0);

const steps = [
    ['2. 옛 항목 옮기기', ['scripts/worklog.mjs', 'rotate']],
    ['3. 새 항목 형식', ['scripts/worklog.mjs', 'lint']],
    ['3-1. ROADMAP 옮기기', ['scripts/roadmap.mjs']],
    ['4. 검사 개수 장부', ['scripts/check-counts.mjs', '--update']],
    ['5. SESSION_CONTEXT', ['scripts/build-session-context.mjs']],
    ['6. 확인표', ['scripts/checklist.mjs']]
];

const failed = [];
for (const [label, command] of steps) {
    console.log(`\n━━ ${label} ━━`);
    const result = spawnSync(process.execPath, command, { stdio: 'inherit' });
    if (result.status !== 0) failed.push(label);
}

console.log('');
if (failed.length) {
    console.log(`✖ 마감 전에 고칠 것: ${failed.join(', ')}`);
    process.exit(1);
}
console.log('✔ 마감 준비 끝. 확인표가 짚은 검사를 돌리고 커밋하세요.');
