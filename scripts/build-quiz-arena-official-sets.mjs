#!/usr/bin/env node
/**
 * 퀴즈 아레나 기본(공식) 문제 세트를 만들어 `public/quiz-arena/official-sets-v1.json` 으로 내보낸다(2026-10-23).
 *
 *   node scripts/build-quiz-arena-official-sets.mjs          # 만들어 쓰기
 *   node scripts/build-quiz-arena-official-sets.mjs --check  # 쓰지 않고 지금 파일과 같은지만 본다(다르면 종료 코드 1)
 *
 * 입력: 학년별 어휘(`public/data/gradeN_vocab.json`), 맞춤법 문제 재료(인형뽑기와 같은 풀), 맞춤법 항목 학년 표
 * (`scripts/quiz-arena-spelling-grade.json`, 두 모델 분류의 합의), 검토에서 뺀 자료(`scripts/quiz-arena-official-exclusions.json`).
 * 같은 입력이면 같은 파일이 나온다(난수는 고정 씨앗).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { buildOfficialSets, stripMeta } from '../src/modules/game/quiz-arena/officialSets.js';
import { buildSpellingQuizPool, spellingSourcesFromCatalog } from '../supabase/functions/spelling-claw/spellingQuizBuilder.js';

const OUT = 'public/quiz-arena/official-sets-v1.json';
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

export const buildOfficialFile = () => {
    const vocabByGrade = Object.fromEntries([3, 4, 5, 6].map((grade) => [grade, read(`public/data/grade${grade}_vocab.json`)]));
    const pool = buildSpellingQuizPool(spellingSourcesFromCatalog(read('public/spelling/elementary-lookup-v1.json'), read('public/spelling/elementary-detection-v1.json')));
    const lookupEntries = read('public/spelling/elementary-lookup-v1.json').lookupEntries;
    const grades = read('scripts/quiz-arena-spelling-grade.json');
    const exclusions = existsSync('scripts/quiz-arena-official-exclusions.json') ? read('scripts/quiz-arena-official-exclusions.json') : {};
    const sets = buildOfficialSets({ vocabByGrade, spellingPool: pool, lookupEntries, grades, exclusions });
    // 서버로 보낼 때 필요 없는 검토용 표식(meta)은 파일에도 두지 않는다
    const clean = sets.map((set) => ({ ...set, questions: set.questions.map(stripMeta) }));
    return `${JSON.stringify({ version: 1, sets: clean }, null, 1)}\n`;
};

if (process.argv[1]?.endsWith('build-quiz-arena-official-sets.mjs')) {
    const body = buildOfficialFile();
    if (process.argv.includes('--check')) {
        const same = existsSync(OUT) && readFileSync(OUT, 'utf8') === body;
        console.log(same ? '✔ 기본 문제 세트 파일이 최신입니다.' : '✖ 기본 문제 세트 파일이 다릅니다. `node scripts/build-quiz-arena-official-sets.mjs` 로 다시 만드세요.');
        process.exit(same ? 0 : 1);
    }
    writeFileSync(OUT, body);
    const sets = JSON.parse(body).sets;
    console.log(`${sets.length}세트·${sets.reduce((n, s) => n + s.questions.length, 0)}문제 → ${OUT}`);
}
