#!/usr/bin/env node
/**
 * 검사 개수 장부 명령.
 *
 *   npm run checks:count                         장부와 견준다(줄었으면 실패)
 *   npm run checks:count -- --update             늘어난 만큼 장부를 올린다(줄었으면 거절)
 *   npm run checks:count -- --update --reason "까닭"   일부러 줄였을 때 — 까닭과 함께 내린다
 *
 * 세는 법은 `scripts/checkCounts.mjs` 머리말에 있다.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { compareCounts, countChecks } from './checkCounts.mjs';

export const LEDGER = 'ops/check-counts.json';

export const readSources = (root = '.') => {
    const list = (dir, pattern) => (existsSync(path.join(root, dir))
        ? readdirSync(path.join(root, dir)).filter((f) => pattern.test(f)).sort().map((f) => `${dir}/${f}`)
        : []);
    const read = (files) => Object.fromEntries(files.map((f) => [f, readFileSync(path.join(root, f), 'utf8')]));
    return {
        unit: read(list('tests', /\.test\.mjs$/)),
        smoke: list('tests/sql', /\.smoke\.sql$/),
        // 배포 관문(도커)은 .dockerignore 로 e2e/ 를 빼고 돈다. 없는 폴더는 "0개" 가 아니라 "못 셈"(null)이다.
        e2e: existsSync(path.join(root, 'e2e')) ? read(list('e2e', /\.spec\.(c?js|mjs|ts)$/)) : null
    };
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMain) {
    const args = process.argv.slice(2);
    const update = args.includes('--update');
    const reasonAt = args.indexOf('--reason');
    const reason = reasonAt >= 0 ? (args[reasonAt + 1] || '').trim() : '';

    const current = countChecks(readSources());
    const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : null;

    if (!ledger) {
        writeFileSync(LEDGER, `${JSON.stringify({ counts: current, lastChange: '장부 시작' }, null, 2)}\n`);
        console.log(`✔ 장부를 새로 만들었습니다: ${LEDGER}`);
        process.exit(0);
    }

    const { drops, rises } = compareCounts(ledger.counts, current);
    for (const d of drops) console.log(`✖ ${d.label}: ${d.before} → ${d.now}`);
    for (const r of rises) console.log(`· ${r.label}: ${r.before} → ${r.now}`);

    if (!update) {
        if (drops.length) {
            console.log('\n  검사가 줄었습니다. 실수라면 되살리고, 일부러 줄였다면');
            console.log('  `npm run checks:count -- --update --reason "까닭"` 으로 장부를 내리세요.');
            process.exit(1);
        }
        console.log(rises.length ? '✔ 줄어든 검사 없음(늘어난 것은 마감 때 장부에 올라갑니다).' : '✔ 검사 개수가 장부와 같습니다.');
        process.exit(0);
    }

    if (drops.length && !reason) {
        console.log('\n✖ 줄어든 검사가 있어 장부를 올리지 않았습니다. `--reason "까닭"` 을 붙이세요.');
        process.exit(1);
    }
    if (!drops.length && !rises.length) {
        console.log('✔ 장부 그대로.');
        process.exit(0);
    }
    const lastChange = drops.length
        ? `줄임: ${reason} (${drops.map((d) => `${d.label} ${d.before}→${d.now}`).join(', ')})`
        : `늘림: ${rises.map((r) => `${r.label} ${r.before}→${r.now}`).join(', ')}`;
    // 못 센 항목은 장부 값을 그대로 둔다.
    const counts = Object.fromEntries(Object.entries(current).map(([key, value]) => [key, value ?? ledger.counts[key]]));
    writeFileSync(LEDGER, `${JSON.stringify({ counts, lastChange }, null, 2)}\n`);
    console.log(`✔ 장부를 고쳤습니다 — ${lastChange}`);
}
