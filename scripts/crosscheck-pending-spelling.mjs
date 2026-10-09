/**
 * 검토 중 맞춤법 자료(checker/pending, 862개) 교차 점검(2026-10-09, 선생님 결정 — 사람이 하나하나 보는 대신 Claude 가 대조).
 *
 *   node scripts/crosscheck-pending-spelling.mjs [--limit N]
 *
 * 항목마다 다섯 겹으로 본다. 외부로 나가는 것은 무료 표준국어대사전 조회(낱말)뿐이고 학생 글은 나가지 않는다.
 *   ① 표준국어대사전: 바른 기본형이 표제어인가
 *   ② 표준국어대사전: 틀린 기본형이 **다른 뜻의 표제어**인가(→ 맞는 말에 밑줄 위험)
 *   ③ hunspell 한국어 사전(맥미니 안): 예문의 낱말이 모두 사전에 있는가(예문 오타), 틀린 꼴이 그 자체로 맞는 낱말인가
 *   ④ 학생 글 모의 실행: 틀린 꼴을 품은 더 긴 낱말이 사전에 있는 바른 말인가(→ 그 낱말 속 밑줄)
 *   ⑤ 부딪힘: 틀린 꼴이 다른 항목·기본 500개의 바른 꼴이거나 그 속에 들어가는가
 * 판정: 빼기 권장(drop) = ④ 학생 글에서 실제로 바른 낱말 속에 밑줄이 생김 · ⑤ 다른 항목의 바른 꼴과 부딪힘.
 *       확인 필요(check) = ①②③ 사전 결과가 애매함(드문 다른 뜻·사전에 없는 이름 등) — Claude 가 하나씩 판단한다.
 * 결과: docs/spelling-expansion/crosscheck.json — 학생 글 문장은 남기지 않고 걸린 어절과 횟수만.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { PENDING_SPELLING_ENTRIES } from '../src/modules/writing/student-input/checker/pending/pendingSpellingEntries.js';
import { getElementarySpellingEntries } from '../src/modules/writing/student-input/checker/elementarySpellingEntries.js';
import { classifyWrongHeadword, dictionaryLookup } from './expand-spelling-base.mjs';

const SECRETS_FILE = path.join(homedir(), 'agit-supabase/secrets.agit.env');
const HUNSPELL = '/opt/homebrew/bin/hunspell';
const HUNSPELL_DICT = path.join(homedir(), 'agit-kiwi/hunspell-ko/ko-fast');
const DOCKER = '/Applications/Docker.app/Contents/Resources/bin/docker';
const OUT = 'docs/spelling-expansion/crosscheck.json';
const arg = (name, fallback) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : fallback;
};
const TOKEN_SPLIT = /[\s.,!?~…"'“”‘’()[\]{}<>`=:;·/*+_|-]+/u;
const clean = (value) => String(value || '').normalize('NFC').replace(/^-/, '').trim();

const unknownWords = (words) => {
    const unique = [...new Set(words.filter(Boolean))];
    const result = spawnSync(HUNSPELL, ['-d', HUNSPELL_DICT, '-l', '-i', 'utf-8'], { input: `${unique.join('\n')}\n`, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (result.status !== 0 && !result.stdout) throw new Error('hunspell_missing');
    return new Set(result.stdout.split('\n').map((line) => line.trim()).filter(Boolean));
};

const lookupHeadword = async (key, word, cache) => {
    if (!word) return { total: 0, items: [] };
    if (cache.has(word)) return cache.get(word);
    let found = await dictionaryLookup(key, word, 'exact');
    if (found.total === 0 && /\s/.test(word)) found = await dictionaryLookup(key, word.replace(/\s+/g, ''), 'exact');
    if (found.total === 0 && !word.endsWith('다') && /[가-힣]$/.test(word)) {
        const withDa = await dictionaryLookup(key, `${word}다`, 'exact');
        if (withDa.total > 0) found = withDa;
    }
    cache.set(word, found);
    return found;
};

const runPool = async (items, size, worker) => {
    const results = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: size }, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await worker(items[index], index);
        }
    }));
    return results;
};

const main = async () => {
    const secrets = await readFile(SECRETS_FILE, 'utf8');
    const key = secrets.split('\n').find((line) => line.startsWith('STDICT_API_KEY='))?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
    if (!key) throw new Error('dictionary_key_missing');
    const entries = PENDING_SPELLING_ENTRIES.slice(0, Number(arg('--limit', PENDING_SPELLING_ENTRIES.length)));

    // 학생 글(맥미니 안 DB) — 어절만 쓴다
    const corpus = spawnSync(DOCKER, ['exec', '-i', 'agit-db', 'psql', '-U', 'postgres', '-d', 'postgres', '-At'],
        { input: "select coalesce(string_agg(content, E'\\n'), '') from public.student_posts where content is not null;", encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 }).stdout;
    const corpusTokens = new Map();
    for (const token of corpus.normalize('NFC').split(TOKEN_SPLIT)) if (token) corpusTokens.set(token, (corpusTokens.get(token) || 0) + 1);

    // 부딪힘을 볼 바른 꼴 모음
    const base = getElementarySpellingEntries();
    const rightForms = new Map();
    for (const entry of [...base, ...PENDING_SPELLING_ENTRIES]) {
        for (const pattern of entry.detectionPatterns) rightForms.set(clean(pattern.right), entry.id);
        rightForms.set(clean(entry.answer), entry.id);
    }

    // ③·④ 에 쓸 낱말을 한 번에 사전에 묻는다
    const exampleTokens = entries.flatMap((entry) => entry.examples.flatMap((example) => example.normalize('NFC').split(TOKEN_SPLIT)));
    const containing = new Map();
    for (const entry of entries) {
        // 문맥형·구형은 앞뒤 말까지 같아야 밑줄을 긋는다 — 낱말만으로 '바른 낱말 속' 을 보면 엉뚱하게 걸린다.
        const targets = entry.detectionMode === 'exact'
            ? entry.detectionPatterns.map((pattern) => clean(pattern.target || pattern.text)).filter((target) => !/\s/.test(target))
            : [];
        const hits = new Map();
        for (const [token, count] of corpusTokens) {
            if (targets.some((target) => token.includes(target)) && !targets.includes(token)) hits.set(token, count);
        }
        containing.set(entry.id, hits);
    }
    const allTargets = entries.flatMap((entry) => entry.detectionPatterns.map((pattern) => clean(pattern.target || pattern.text)).filter((target) => !/\s/.test(target)));
    const unknown = unknownWords([...exampleTokens, ...allTargets, ...[...containing.values()].flatMap((hits) => [...hits.keys()])]);

    const dictCache = new Map();
    let done = 0;
    const results = await runPool(entries, 4, async (entry) => {
        const problems = []; // 빼기 권장
        const notes = [];    // 확인 필요
        const rightBase = clean(entry.answer);
        const wrongBases = entry.question.split('/').map(clean).filter((value) => value && value !== rightBase);
        const isNameLike = entry.categoryId === 'loanword';

        // ① 바른 기본형
        const right = await lookupHeadword(key, rightBase, dictCache);
        if (right.total === 0) notes.push(isNameLike ? '바른 꼴이 표준국어대사전에 없음(사람·땅 이름일 수 있음)' : '바른 꼴이 표준국어대사전에 없음');
        if (right.total < 0) notes.push('사전 조회 실패');

        // ② 틀린 기본형이 다른 뜻의 표제어인가
        for (const wrongBase of wrongBases) {
            const wrong = await lookupHeadword(key, wrongBase, dictCache);
            if (wrong.total > 0) {
                const { pointsToRight, otherMeanings } = classifyWrongHeadword(wrong.items, rightBase);
                if (!pointsToRight && otherMeanings.length && entry.detectionMode === 'exact') {
                    notes.push(`틀린 꼴 ‘${wrongBase}’이 다른 뜻의 표제어: ${otherMeanings[0].slice(0, 40)}`);
                } else if (otherMeanings.length && !pointsToRight) {
                    notes.push(`틀린 꼴 ‘${wrongBase}’이 표제어(문맥형이라 괜찮을 수 있음)`);
                } else if (pointsToRight && otherMeanings.length) {
                    notes.push(`틀린 꼴 ‘${wrongBase}’에 드문 다른 뜻: ${otherMeanings[0].slice(0, 30)}`);
                }
            }
        }

        // ③ 예문 낱말·틀린 꼴 자체
        const badExampleWords = [...new Set(entry.examples.flatMap((example) => example.normalize('NFC').split(TOKEN_SPLIT)).filter((token) => /[가-힣]/.test(token) && unknown.has(token)))];
        if (badExampleWords.length) notes.push(`예문 낱말이 사전에 없음: ${badExampleWords.slice(0, 4).join(', ')}`);
        for (const pattern of entry.detectionPatterns) {
            const target = clean(pattern.target || pattern.text);
            if (entry.detectionMode === 'exact' && !/\s/.test(target) && target.length >= 2 && !unknown.has(target)) {
                notes.push(`틀린 꼴 ‘${target}’이 hunspell 사전에 있는 낱말`);
            }
            // ⑤ 부딪힘
            const owner = rightForms.get(target);
            if (owner && owner !== entry.id) problems.push(`틀린 꼴 ‘${target}’이 다른 항목(${owner})의 바른 꼴`);
        }

        // ④ 바른 낱말 속 밑줄
        const hits = containing.get(entry.id) || new Map();
        const risky = [...hits].filter(([token]) => /[가-힣]/.test(token) && !unknown.has(token)).sort((a, b) => b[1] - a[1]);
        if (risky.length) problems.push(`바른 낱말 속에 들어감: ${risky.slice(0, 4).map(([token, count]) => `${token}(${count})`).join(', ')}`);

        done += 1;
        if (done % 50 === 0) process.stdout.write(`${done}…`);
        return {
            id: entry.id, label: entry.learningLabel, category: entry.categoryId, mode: entry.detectionMode, level: entry.level,
            verdict: problems.length ? 'drop' : notes.length ? 'check' : 'pass', problems, notes,
            dictionary: { right: right.total }, corpus_hits: [...hits.values()].reduce((sum, count) => sum + count, 0)
        };
    });
    process.stdout.write('\n');
    const counts = results.reduce((acc, item) => ({ ...acc, [item.verdict]: (acc[item.verdict] || 0) + 1 }), {});
    await writeFile(OUT, `${JSON.stringify({ checked_at: new Date().toISOString(), entries: results.length, counts, results }, null, 1)}\n`);
    console.log(`점검 ${results.length}개 · 통과 ${counts.pass || 0} · 확인 필요 ${counts.check || 0} · 빼기 권장 ${counts.drop || 0} → ${OUT}`);
};

main().catch((error) => {
    console.error(`교차 점검 실패 — ${error.message}`);
    process.exitCode = 1;
});
