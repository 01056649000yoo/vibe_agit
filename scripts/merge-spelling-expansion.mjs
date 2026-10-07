/**
 * 선생님이 승인한 기본 자료 늘리기 묶음을 카탈로그에 합친다(2026-10-07).
 *
 *   node scripts/merge-spelling-expansion.mjs --batch 01 [--exclude 키,키] [--dry-run]
 *
 * docs/spelling-expansion/batch-<번호>.json 의 `kept` 를 분류 파일(catalog/*Catalog.js)에 reference(...) 줄로 덧붙인다.
 * `--exclude` 는 선생님이 표본에서 빼라고 한 항목의 key. 합친 뒤 `npm run spelling:check`·`spelling:export` 를 돌린다.
 * 규칙(README): exact 는 틀린 꼴 자체를, context 는 앞뒤 말(text) 안의 틀린 꼴(target)을, phrase 는 공백이 든 어구를 잡는다.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { getElementarySpellingEntries } from '../src/modules/writing/tools/spelling-lookup/elementarySpellingEntries.js';

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

/** 후보 하나를 reference(...) 줄로. 규칙에 맞지 않으면 null(빼고 이유를 알린다). */
export const toReferenceLine = (item, sortOrder, id) => {
    const wrong = String(item.wrong || '').trim();
    const right = String(item.right || '').trim();
    let mode = item.detection_mode;
    if (mode === 'phrase' && !/\s/.test(wrong)) mode = 'exact';
    const options = { searchable: [...new Set([right, wrong])], sourceQuery: right.split(/\s+/)[0] };
    if (mode === 'context') {
        const text = String(item.context_text || '').trim();
        if (!text.includes(wrong)) return null;
        options.detectionPatterns = [{ text, target: wrong, right, lookup: right }];
    }
    const examples = (item.examples || []).map((example) => String(example).trim()).filter(Boolean).slice(0, 4);
    if (examples.length === 0 || examples.some((example) => example.includes(wrong) && !example.includes(right))) return null;
    return `        reference(${sortOrder}, ${JSON.stringify(id)}, ${JSON.stringify(item.subcategoryId)}, ${JSON.stringify(mode)}, "catalog", ${JSON.stringify(`${right} / ${wrong}`)}, ${JSON.stringify(right)}, ${JSON.stringify(String(item.explanation || '').trim())}, ${JSON.stringify(examples)}, ${JSON.stringify(options)}),`;
};

const main = async () => {
    const batch = arg('--batch', '01');
    const exclude = new Set(String(arg('--exclude', '')).split(',').map((key) => key.trim()).filter(Boolean));
    const dryRun = process.argv.includes('--dry-run');
    const data = JSON.parse(await readFile(`docs/spelling-expansion/batch-${batch}.json`, 'utf8'));
    const existing = getElementarySpellingEntries();
    let sortOrder = Math.max(...existing.map((entry) => entry.sortOrder));
    const usedIds = new Set(existing.map((entry) => entry.id));
    const linesByCategory = new Map();
    const skipped = [];
    for (const item of data.kept) {
        if (exclude.has(item.key)) continue;
        let id = String(item.id || item.key).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || item.key;
        while (usedIds.has(id)) id = `${id}-${item.key.slice(0, 4)}`;
        const line = toReferenceLine(item, sortOrder + 1, id);
        if (!line) { skipped.push(`${item.wrong} → ${item.right}`); continue; }
        sortOrder += 1;
        usedIds.add(id);
        linesByCategory.set(item.categoryId, [...(linesByCategory.get(item.categoryId) || []), line]);
    }
    for (const [categoryId, lines] of linesByCategory) {
        const file = `src/modules/writing/tools/spelling-lookup/catalog/${CATALOG_FILES[categoryId]}`;
        const source = await readFile(file, 'utf8');
        const end = source.lastIndexOf(']);');
        if (end < 0) throw new Error(`catalog_end_missing:${file}`);
        const before = source.slice(0, end).replace(/\s*$/, '');
        const joined = `${before.endsWith(',') ? before : `${before},`}\n        // ── 기본 자료 늘리기 묶음 ${batch} (${data.created_at.slice(0, 10)}, AI 초안 + 검증 AI + 표준국어대사전 + 선생님 표본 확인) ──\n${lines.join('\n')}\n`;
        if (!dryRun) await writeFile(file, `${joined}${source.slice(end)}`);
        console.log(`${CATALOG_FILES[categoryId]}: ${lines.length}개`);
    }
    if (skipped.length) console.log(`규칙에 맞지 않아 뺀 것 ${skipped.length}개: ${skipped.join(' · ')}`);
};

if (process.argv[1]?.endsWith('merge-spelling-expansion.mjs')) {
    main().catch((error) => {
        console.error(`합치기 실패 — ${error.message}`);
        process.exitCode = 1;
    });
}
