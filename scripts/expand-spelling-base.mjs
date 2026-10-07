/**
 * 기본 맞춤법 자료 늘리기 — 후보 검증과 모의 실행(2026-10-07, 선생님 결정 ②).
 *
 *   node scripts/expand-spelling-base.mjs --batch 01 [--corpus <학생 글 csv>]
 *
 * 선생님 결정: **초안은 Claude 가 직접 쓰고 GPT(유료 API)는 쓰지 않는다.** 이 스크립트는 초안
 * (docs/spelling-expansion/batch-<번호>.pairs.tsv)을 기계로 검증만 한다. 쓰는 외부 API 는 무료인 표준국어대사전뿐.
 *
 * 기본 자료는 아이들에게 "이게 맞다"고 가르치고 인형뽑기 퀴즈로도 나간다. 후보 하나가 남으려면:
 *   ① 기존 기본 500개·공통 자료와 겹치지 않음, 틀린 꼴 ≠ 바른 꼴
 *   ② 표준국어대사전(낱말·합성어·외래어처럼 표제어 꼴인 것): 바른 꼴은 표제어, 틀린 꼴은 표제어가 아님
 *   ③ 낱말 검출(exact)이면 표준국어대사전 `포함` 검색으로 틀린 꼴을 품은 표제어가 없음 — 있으면 그 낱말 안에 밑줄이 그어진다
 *   ④ 모의 실행: 학생 글에서 틀린 꼴이 걸리는 어절을 모아 사람이 훑을 수 있게 남긴다(오탐 찾기). 바른 꼴 사용 횟수도 센다.
 * 결과: docs/spelling-expansion/batch-<번호>.check.json. 학생 글 문장은 옮기지 않고 걸린 **어절**과 횟수만 남긴다.
 * 비밀 값(사전 열쇠)은 ~/agit-supabase/secrets.agit.env 에서 읽고 어디에도 쓰지 않는다.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { getElementarySpellingEntries } from '../src/modules/writing/tools/spelling-lookup/elementarySpellingEntries.js';
import { normalizeSpellingValue } from '../supabase/functions/spelling-weekly-review/reviewCore.js';

const SECRETS_FILE = process.env.AGIT_SECRETS_FILE || '/Users/seunghyeonmaegmini/agit-supabase/secrets.agit.env';
const DOCKER = '/Applications/Docker.app/Contents/Resources/bin/docker';
// 표준국어대사전으로 표제어를 확인할 수 있는 분류(활용형·구가 아니라 표제어 꼴인 것)
export const DICTIONARY_CHECKED = new Set(['word/general', 'compound/saisiot', 'compound/no-saisiot', 'loanword/loanword']);

const arg = (name, fallback) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : fallback;
};
const readSecret = (contents, name) => {
    const line = contents.split(/\r?\n/).find((item) => item.trim().startsWith(`${name}=`));
    return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : '';
};

export const parsePairs = (tsv) => tsv.split('\n')
    .filter((line) => line.trim() && !line.startsWith('#'))
    .map((line, index) => {
        const [slot, mode, wrong, right, context = ''] = line.split('\t').map((cell) => cell.trim());
        const [categoryId, subcategoryId] = slot.split('/');
        return { no: index + 1, categoryId, subcategoryId, slot, mode, wrong, right, context };
    });

const dictionaryLookup = async (key, query, method) => {
    const url = new URL('https://stdict.korean.go.kr/api/search.do');
    url.searchParams.set('key', key);
    url.searchParams.set('q', query);
    url.searchParams.set('req_type', 'json');
    url.searchParams.set('advanced', 'y');
    url.searchParams.set('method', method);
    url.searchParams.set('num', '20');
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const text = (await (await fetch(url, { signal: AbortSignal.timeout(15000) })).text()).trim();
            if (!text) return { total: 0, words: [], items: [] };
            const json = JSON.parse(text);
            const items = (json.channel?.item || []).map((item) => ({
                word: String(item.word || '').replace(/[-^ ]/g, ''),
                definitions: (Array.isArray(item.sense) ? item.sense : [item.sense]).map((sense) => String(sense?.definition || ''))
            }));
            return { total: Number(json.channel?.total || 0), words: [...new Set(items.map((item) => item.word))], items };
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
        }
    }
    return { total: -1, words: [], items: [] };
};

/*
 * 사전은 비표준 꼴도 표제어로 싣고 뜻풀이에 `→ 바른말.` 로 가리킨다(삼춘 → 삼촌, 인삿말 → 인사말).
 * 그렇게 바른 꼴을 가리키면 "틀린 꼴"로 본다. 그 밖의 뜻이 함께 있으면(삼춘: 봄의 석 달) 사람이 보도록 남긴다.
 */
export const classifyWrongHeadword = (items, right) => {
    const target = String(right || '').replace(/[\s-^]/g, '');
    const senses = items.flatMap((item) => item.definitions);
    const pointsToRight = senses.some((definition) => definition.trim().startsWith('→')
        && definition.replace(/[\s-^.→]/g, '').startsWith(target.replace(/다$/, '')));
    const otherMeanings = senses.filter((definition) => !definition.trim().startsWith('→'));
    return { pointsToRight, otherMeanings };
};

/** 학생 글에서 needle 이 든 어절과 횟수(많은 순). 문장은 남기지 않는다. */
export const wordsContaining = (corpus, needle, limit = 12) => {
    const counts = new Map();
    if (!corpus || !needle) return { total: 0, words: [] };
    let total = 0;
    for (let index = corpus.indexOf(needle); index >= 0; index = corpus.indexOf(needle, index + needle.length)) {
        total += 1;
        let start = index;
        let end = index + needle.length;
        while (start > 0 && !/[\s",.!?]/.test(corpus[start - 1]) && index - start < 12) start -= 1;
        while (end < corpus.length && !/[\s",.!?]/.test(corpus[end]) && end - index < 16) end += 1;
        const word = corpus.slice(start, end);
        counts.set(word, (counts.get(word) || 0) + 1);
    }
    return { total, words: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit) };
};

const knownExpressions = () => {
    const known = new Set();
    for (const entry of getElementarySpellingEntries()) {
        for (const value of [entry.question, entry.answer, ...(entry.searchable || [])]) {
            for (const part of String(value || '').split('/')) {
                const key = normalizeSpellingValue(part);
                if (key) known.add(key);
            }
        }
        for (const pattern of entry.detectionPatterns || []) {
            const key = normalizeSpellingValue(pattern.target || pattern.text);
            if (key) known.add(key);
        }
    }
    const rows = spawnSync(DOCKER, ['exec', 'agit-db', 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc',
        "select wrong_expression from spelling_learning_entries where scope='common' and status='approved'"], { encoding: 'utf8' });
    for (const line of String(rows.stdout || '').split('\n')) {
        const key = normalizeSpellingValue(line);
        if (key) known.add(key);
    }
    return known;
};

const main = async () => {
    const batch = arg('--batch', '01');
    const corpusPath = arg('--corpus', '');
    const pairs = parsePairs(await readFile(`docs/spelling-expansion/batch-${batch}.pairs.tsv`, 'utf8'));
    const dictKey = readSecret(await readFile(SECRETS_FILE, 'utf8'), 'STDICT_API_KEY');
    if (!dictKey) throw new Error('dictionary_key_missing');
    const corpus = corpusPath ? await readFile(corpusPath, 'utf8') : '';
    const known = knownExpressions();
    const seen = new Set();
    const results = [];

    for (const pair of pairs) {
        const problems = [];
        const wrongKey = normalizeSpellingValue(pair.wrong);
        // 띄어쓰기만 다른 것(오늘밤/오늘 밤)이 있으므로 공백을 지우지 않은 그대로 견준다.
        if (!wrongKey || pair.wrong === pair.right) problems.push('틀린 꼴과 바른 꼴이 같거나 비었음');
        if (known.has(wrongKey)) problems.push('이미 있는 자료와 겹침');
        if (seen.has(wrongKey)) problems.push('이 묶음 안에서 겹침');
        seen.add(wrongKey);
        if (pair.mode === 'context' && !pair.context.includes(pair.wrong)) problems.push('문맥 어구에 틀린 꼴이 없음');

        const dictionary = {};
        const warnings = [];
        if (DICTIONARY_CHECKED.has(pair.slot) && !/\s/.test(pair.right)) {
            // 사전에는 기본형만 있다 — 줄기(쑥스럽)면 `다` 를 붙여 다시 찾는다.
            let right = await dictionaryLookup(dictKey, pair.right, 'exact');
            if (right.total === 0 && !pair.right.endsWith('다')) right = await dictionaryLookup(dictKey, `${pair.right}다`, 'exact');
            dictionary.right = right.total;
            if (right.total === 0) problems.push('바른 꼴이 표준국어대사전 표제어에 없음');
            let wrong = await dictionaryLookup(dictKey, pair.wrong, 'exact');
            if (wrong.total === 0 && !pair.wrong.endsWith('다')) wrong = await dictionaryLookup(dictKey, `${pair.wrong}다`, 'exact');
            dictionary.wrong = wrong.total;
            if (wrong.total > 0) {
                const { pointsToRight, otherMeanings } = classifyWrongHeadword(wrong.items, pair.right);
                dictionary.wrong_points_to_right = pointsToRight;
                if (!pointsToRight) problems.push(`틀린 꼴이 다른 뜻의 표제어로 있음: ${otherMeanings[0]?.slice(0, 40) || ''}`);
                else if (otherMeanings.length) warnings.push(`드문 다른 뜻: ${otherMeanings.map((m) => m.slice(0, 30)).join(' / ')}`);
            }
        }
        if (pair.mode === 'exact') {
            const inside = await dictionaryLookup(dictKey, pair.wrong, 'include');
            // 틀린 꼴을 **품은 다른** 표제어 — 그 낱말 안에 밑줄이 그어질 수 있다. 학생 글 모의 실행과 함께 사람이 본다.
            const others = inside.words.filter((word) => word !== pair.wrong && !word.startsWith(pair.wrong.replace(/다$/, '')) === false ? word !== pair.wrong : true)
                .filter((word) => word !== pair.wrong && word !== `${pair.wrong}다`);
            dictionary.containing = others.slice(0, 6);
            if (others.length) warnings.push(`품은 표제어: ${others.slice(0, 4).join(', ')}`);
        }
        const simulated = pair.mode === 'context' ? wordsContaining(corpus, pair.context) : wordsContaining(corpus, pair.wrong);
        results.push({
            ...pair,
            status: problems.length ? 'drop' : 'pass',
            problems,
            warnings,
            dictionary,
            simulation: { hits: simulated.total, words: simulated.words, right_uses: wordsContaining(corpus, pair.right, 0).total }
        });
        process.stdout.write(problems.length ? 'x' : '.');
    }
    process.stdout.write('\n');
    await writeFile(`docs/spelling-expansion/batch-${batch}.check.json`, `${JSON.stringify({
        batch, checked_at: new Date().toISOString(), corpus_documents: corpus ? corpus.split('\n').length : 0, results
    }, null, 2)}\n`);
    const pass = results.filter((item) => item.status === 'pass');
    console.log(`후보 ${results.length} · 통과 ${pass.length} · 뺌 ${results.length - pass.length} · 학생 글에서 실제로 걸린 것 ${pass.filter((item) => item.simulation.hits > 0).length}`);
};

if (process.argv[1]?.endsWith('expand-spelling-base.mjs')) {
    main().catch((error) => {
        console.error(`검증 실패 — ${error.message}`);
        process.exitCode = 1;
    });
}
