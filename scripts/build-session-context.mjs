#!/usr/bin/env node
/**
 * SESSION_CONTEXT.md 를 만든다.
 *
 *   npm run context:build            새로 만들어 쓴다
 *   npm run context:build -- --check 쓰지 않고 저장된 파일이 생성 결과와 같은지만 본다
 *
 * 무엇을 어떻게 뽑는지는 `scripts/sessionContext.mjs` 머리말에 있다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildSessionContext, MAX_CONTEXT_CHARS, MAX_RULES_CHARS } from './sessionContext.mjs';

const read = (file) => readFileSync(file, 'utf8');
const rules = read('docs/wiki/SESSION_RULES.md');
const openItems = (() => { try { return read('docs/OPEN_ITEMS.md'); } catch { return ''; } })();
const next = buildSessionContext({ rules, roadmap: read('ROADMAP.md'), worklog: read('WORKLOG.md'), openItems });

const problems = [];
if (rules.length > MAX_RULES_CHARS) problems.push(`docs/wiki/SESSION_RULES.md 가 ${rules.length}자입니다(상한 ${MAX_RULES_CHARS}자).`);
if (next.length > MAX_CONTEXT_CHARS) problems.push(`생성된 SESSION_CONTEXT 가 ${next.length}자입니다(상한 ${MAX_CONTEXT_CHARS}자).`);
if (problems.length) {
    for (const problem of problems) console.error(`✖ ${problem}`);
    console.error('  오래 가는 규칙만 남기고, 지난 사정은 WORKLOG·PITFALLS 로 보내세요.');
    process.exit(1);
}

const current = (() => { try { return read('SESSION_CONTEXT.md'); } catch { return ''; } })();

if (process.argv.includes('--check')) {
    if (current === next) {
        console.log(`✔ SESSION_CONTEXT 가 최신입니다(${next.length}자).`);
        process.exit(0);
    }
    console.error('✖ SESSION_CONTEXT.md 가 생성 결과와 다릅니다. `npm run context:build` 를 돌리세요(직접 고치지 않습니다).');
    process.exit(1);
}

if (current === next) {
    console.log(`✔ SESSION_CONTEXT 바뀐 것 없음(${next.length}자).`);
} else {
    writeFileSync('SESSION_CONTEXT.md', next);
    console.log(`✔ SESSION_CONTEXT 를 다시 만들었습니다(${current.length}자 → ${next.length}자).`);
}
