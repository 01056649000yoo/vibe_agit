/**
 * 기본 맞춤법 자료 늘리기 묶음을 카탈로그에 합친다(2026-10-07~08).
 *
 *   node scripts/merge-spelling-expansion.mjs --batch 01,02 [--exclude 틀린꼴,틀린꼴] [--dry-run]
 *
 * 묶음 하나는 세 파일로 이뤄진다(docs/spelling-expansion/):
 *   batch-NN.check.json     기계 점검 결과(scripts/expand-spelling-base.mjs)
 *   batch-NN.decisions.json 모의 실행을 보고 사람이 뺀 것과 까닭
 *   batch-NN.content*.json|tsv  Claude 가 직접 쓴 아이용 설명·예문(GPT 쓰지 않음)
 * 남은 것을 분류 파일(catalog/*Catalog.js)에 reference(...) 줄로 덧붙인다.
 * **선생님 승인 뒤에만** 실제로 합친다. 모의 실행 때는 합친 뒤 검사하고 git 으로 되돌린다.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getElementarySpellingEntries } from '../src/modules/writing/tools/spelling-lookup/elementarySpellingEntries.js';

const DIR = 'docs/spelling-expansion';
const CATALOG_FILES = Object.freeze({
    grammar: 'grammarCatalog.js',
    conjugation: 'conjugationCatalog.js',
    meaning: 'meaningCatalog.js',
    word: 'wordCatalog.js',
    compound: 'compoundCatalog.js',
    loanword: 'loanwordCatalog.js'
});
const arg = (name, fallback) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : fallback;
};

// 같은 꼴이 되풀이되는 갈래의 설명 틀(content.tsv 의 설명 칸이 한 글자 기호일 때)
const TEMPLATES = Object.freeze({
    P: (answer) => `지난 일을 말할 때는 받침에 ‘ㅆ’을 써서 ‘${answer}’예요.`,
    L: (answer) => `외래어 표기법에 따라 ‘${answer}’라고 써요.`,
    S: (answer) => `두 낱말이 합쳐지며 뒷소리가 세게 나거나 ‘ㄴ’ 소리가 덧나서 사이시옷을 넣어 ‘${answer}’라고 써요.`,
    N: (answer) => `뒤 글자가 된소리·거센소리이거나 한자어끼리 합친 말이라 사이시옷을 쓰지 않아서 ‘${answer}’예요.`
});

/** 묶음 하나에서 합칠 것들 — 점검 통과 + 사람이 빼지 않음 + 설명 있음. */
export const loadBatch = async (batch) => {
    const check = JSON.parse(await readFile(`${DIR}/batch-${batch}.check.json`, 'utf8'));
    const decisions = JSON.parse(await readFile(`${DIR}/batch-${batch}.decisions.json`, 'utf8'));
    const content = {};
    for (const file of (await readdir(DIR)).filter((name) => name.startsWith(`batch-${batch}.content`)).sort()) {
        const text = await readFile(`${DIR}/${file}`, 'utf8');
        if (file.endsWith('.json')) Object.assign(content, JSON.parse(text));
        else {
            for (const line of text.split('\n').filter((row) => row && !row.startsWith('#'))) {
                const [wrong, label, answer, explanation, ...examples] = line.split('|');
                content[wrong] = {
                    label, answer,
                    explanation: Reflect.get(TEMPLATES, explanation)?.(answer) || explanation,
                    examples
                };
            }
        }
    }
    const items = [];
    const problems = [];
    for (const result of check.results) {
        if (result.status !== 'pass' || Reflect.get(decisions.drop || {}, result.wrong)) continue;
        const text = Reflect.get(content, result.wrong);
        if (!text) { problems.push(`${result.wrong}: 설명 없음`); continue; }
        items.push({ batch, ...result, ...text });
    }
    return { items, problems, decisions };
};

/** 후보 하나를 reference(...) 줄로. */
export const toReferenceLine = (item, sortOrder, id) => {
    const mode = item.mode === 'phrase' && !/\s/.test(item.wrong) ? 'exact' : item.mode;
    const text = mode === 'context' ? item.context : item.wrong;
    const options = {
        searchable: [...new Set([item.answer, item.wrong, ...String(item.label).split('/').map((part) => part.trim())])].filter(Boolean),
        sourceQuery: String(item.answer).replace(/^-/, '').split(/\s+/)[0],
        detectionPatterns: [{ text, target: item.wrong, right: item.right, lookup: String(item.answer).replace(/^-/, '') }]
    };
    return `        reference(${sortOrder}, ${JSON.stringify(id)}, ${JSON.stringify(item.subcategoryId)}, ${JSON.stringify(mode)}, "catalog", ${JSON.stringify(item.label)}, ${JSON.stringify(item.answer)}, ${JSON.stringify(item.explanation)}, ${JSON.stringify(item.examples)}, ${JSON.stringify(options)}),`;
};

export const mergeBatches = async (batches, { exclude = new Set(), dryRun = false } = {}) => {
    const existing = getElementarySpellingEntries();
    let sortOrder = Math.max(...existing.map((entry) => entry.sortOrder));
    const linesByCategory = new Map();
    const all = [];
    const seenWrong = new Set();
    for (const batch of batches) {
        const { items, problems } = await loadBatch(batch);
        if (problems.length) throw new Error(`묶음 ${batch}: ${problems.join(', ')}`);
        for (const item of items) {
            // 묶음끼리 같은 틀린 꼴이 있으면 먼저 나온 것만(묶음 안 겹침은 점검 단계가 이미 뺀다).
            if (exclude.has(item.wrong) || seenWrong.has(item.wrong)) continue;
            seenWrong.add(item.wrong);
            sortOrder += 1;
            const id = `x-${createHash('sha256').update(item.wrong).digest('hex').slice(0, 10)}`;
            linesByCategory.set(item.categoryId, [...(linesByCategory.get(item.categoryId) || []), toReferenceLine(item, sortOrder, id)]);
            all.push({ ...item, id });
        }
    }
    for (const [categoryId, lines] of linesByCategory) {
        const file = `src/modules/writing/tools/spelling-lookup/catalog/${Reflect.get(CATALOG_FILES, categoryId)}`;
        const source = await readFile(file, 'utf8');
        // 파일 끝은 `    ]\n);` 꼴이다 — 마지막 `]` 앞에 덧붙인다.
        const match = source.match(/\n\s*\]\s*\)\s*;\s*$/);
        const end = match ? match.index : -1;
        if (end < 0) throw new Error(`catalog_end_missing:${file}`);
        const before = source.slice(0, end).replace(/\s*$/, '');
        const joined = `${before.endsWith(',') ? before : `${before},`}\n        // ── 기본 자료 늘리기 ${batches.join('·')}(Claude 초안 + 표준국어대사전 + 학생 글 모의 실행 + 선생님 확인) ──\n${lines.join('\n')}\n`;
        if (!dryRun) await writeFile(file, `${joined}${source.slice(end)}`);
    }
    return all;
};

if (process.argv[1]?.endsWith('merge-spelling-expansion.mjs')) {
    const batches = String(arg('--batch', '01')).split(',').map((value) => value.trim()).filter(Boolean);
    const exclude = new Set(String(arg('--exclude', '')).split(',').map((value) => value.trim()).filter(Boolean));
    mergeBatches(batches, { exclude, dryRun: process.argv.includes('--dry-run') })
        .then((all) => console.log(`합칠 항목 ${all.length}개${process.argv.includes('--dry-run') ? '(미리 보기, 파일은 그대로)' : ''}`))
        .catch((error) => { console.error(`합치기 실패 — ${error.message}`); process.exitCode = 1; });
}
