#!/usr/bin/env node
/**
 * ROADMAP 줄이기: `npm run roadmap:archive` (-- --dry-run 이면 무엇을 옮길지만 본다)
 * 기준은 `scripts/roadmapArchive.mjs` 머리말. 옮기기 전후 비어 있지 않은 줄 수가 다르면 아무것도 쓰지 않는다.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildBacklog, mergeArchive, planArchive } from './roadmapArchive.mjs';

const DIR = 'docs/roadmap';
const dryRun = process.argv.includes('--dry-run');

const roadmap = readFileSync('ROADMAP.md', 'utf8');
const { roadmap: next, moves, counts } = planArchive(roadmap);

const readArchives = () => (existsSync(DIR)
    ? Object.fromEntries(readdirSync(DIR).filter((f) => f.endsWith('.md') && f !== 'BACKLOG.md')
        .map((f) => [f, readFileSync(path.join(DIR, f), 'utf8')]))
    : {});
const archives = readArchives();
const merged = { ...archives };
for (const [file, blocks] of Object.entries(moves)) merged[file] = mergeArchive(file, archives[file], blocks);

// 내용 보존 확인: 옮긴 블록의 비어 있지 않은 줄 = 줄어든 ROADMAP 줄(안내문 제외)
const meaningful = (text) => text.split('\n').filter((l) => l.trim() && !l.startsWith('> 지난 `현재 위치`')
    && !l.startsWith('> [docs/roadmap/BACKLOG') && !/^> \d+일보다 오래된 결정은/.test(l)).length;
const movedLines = Object.values(moves).flat().reduce((sum, block) => sum + block.split('\n').filter((l) => l.trim() && !l.startsWith('<!-- ')).length, 0);
if (meaningful(roadmap) - meaningful(next) !== movedLines) {
    console.error(`✖ 줄 수가 맞지 않습니다(ROADMAP ${meaningful(roadmap)} → ${meaningful(next)}, 옮김 ${movedLines}). 아무것도 쓰지 않았습니다.`);
    process.exit(1);
}

const backlog = buildBacklog(merged);
const total = Object.values(counts).reduce((a, b) => a + b, 0);
const before = roadmap.split('\n').length;
const after = next.split('\n').length;

if (total === 0) {
    const current = existsSync(`${DIR}/BACKLOG.md`) ? readFileSync(`${DIR}/BACKLOG.md`, 'utf8') : '';
    if (current !== backlog && Object.keys(archives).length) {
        if (!dryRun) writeFileSync(`${DIR}/BACKLOG.md`, backlog);
        console.log(`${dryRun ? '· (미리보기) ' : '✔ '}BACKLOG 만 다시 만들었습니다.`);
    } else console.log(`✔ 옮길 것 없음 (ROADMAP ${before}줄).`);
    process.exit(0);
}

console.log(`${dryRun ? '· (미리보기) ' : '✔ '}ROADMAP ${before} → ${after}줄. 현재 위치 절 ${counts.currentSections}·머리 항목 ${counts.currentBullets}, `
    + `끝난 Stage ${counts.stages}·Stage 안 절 ${counts.stageSections}, 결정 ${counts.decisions}건 이동.`);
for (const file of Object.keys(moves).sort()) console.log(`    ${DIR}/${file} (+${moves[file].length})`);
if (dryRun) process.exit(0);

mkdirSync(DIR, { recursive: true });
writeFileSync('ROADMAP.md', next);
for (const file of Object.keys(moves)) writeFileSync(path.join(DIR, file), merged[file]);
writeFileSync(`${DIR}/BACKLOG.md`, backlog);
