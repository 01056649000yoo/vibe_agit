/**
 * 맞춤법 '살펴볼 곳'(회색 점선) 1단계 — 보이지 않게 기록만(2026-10-08, 선생님 결정: 1~2주 모아 보고 넓힌다).
 *
 *   node scripts/spelling-shadow.mjs              밤 작업: 지난 실행 뒤 바뀐 제출 글
 *   node scripts/spelling-shadow.mjs --days 14    지난 14일치를 한꺼번에(기준선 만들기)
 *   node scripts/spelling-shadow.mjs --all        지금 있는 모든 글(제출 전 글 포함)
 *   node scripts/spelling-shadow.mjs --report [--days 14]   모인 것 요약
 *
 * 제출된 글을 Kiwi(맥미니 안, services/spelling-analyzer/analyze.py)로 분석해 회색 줄이 생겼을 자리를 적는다.
 *  - overlaps_red: 그 자리에 이미 빨간 줄(빠른 규칙·기본 자료·공통 자료)이 그어지는지 — 겹치면 회색은 안 보이게 할 것
 *  - outcome: 첫 제출본의 자리를 아이(다시 쓰기)·선생님(직접 고치기)이 나중에 고쳤는지
 * 학생 화면은 그대로다. 학생 글은 맥미니 밖으로 나가지 않는다. 60일 지난 기록은 지운다.
 */
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findElementarySpellingIssues } from '../src/modules/writing/student-input/checker/elementarySpellingEntries.js';
import { checkSpelling } from '../src/modules/writing/student-input/checker/spellingEngine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCKER = '/Applications/Docker.app/Contents/Resources/bin/docker';
const PYTHON = path.join(homedir(), 'agit-kiwi/venv/bin/python');
const ANALYZER = path.join(ROOT, 'services/spelling-analyzer/analyze.py');
const STATUS = path.join(homedir(), 'backups/auto/spelling-shadow-status.txt');
const KEEP_DAYS = 60;
// 회색 줄로 먼저 보여 줄 갈래(2026-10-08 선생님 결정: 잘 맞는 갈래만) — 그 밖의 띄어쓰기는 기록만
export const SHOWN_CATEGORIES = Object.freeze(['particle_attach', 'modifier_noun', 'typo']);

/**
 * 2단계에서 보였을지 — 고른 갈래 + 거르기 통과 + 교차 확인(2026-10-08, 전체 글 표본 채점으로 정함).
 *  · 꾸미는 말+명사: hunspell 이 반대하면 뺀다(검은색·저녁때·먹을게처럼 한 낱말·어미인 것). 단 '본 적·한 척·할 뻔·한 체'는
 *    사전이 본적(本籍) 같은 다른 낱말로 착각하므로 그대로 둔다.
 *  · 토씨 붙이기: 두 도구가 반대해도 Kiwi 가 대개 맞아(같다 고→같다고) 교차 확인을 쓰지 않는다.
 *  · 받침 오타: 사전이 스스로 내놓은 고칠 말에 Kiwi 제안이 있을 때만(약 92% 맞음, 나머지는 절반이 엉뚱).
 */
export const isShown = (item, filterReason) => {
    if (!SHOWN_CATEGORIES.includes(item.category) || filterReason) return false;
    if (item.category === 'typo') return item.hunspell === true;
    if (item.category === 'modifier_noun' && item.hunspell === false) return /^[^\s]+\s(적|척|뻔|체)/.test(item.suggestion);
    return true;
};

const arg = (name, fallback) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : fallback;
};
const psql = (sql) => {
    const result = spawnSync(DOCKER, ['exec', '-i', 'agit-db', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input: sql, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`database_failed: ${String(result.stderr).split('\n').find((l) => /ERROR/.test(l)) || ''}`.slice(0, 200));
    return result.stdout.trim();
};
const status = (line) => {
    try { mkdirSync(path.dirname(STATUS), { recursive: true }); appendFileSync(STATUS, `${line}\n`); } catch { /* 기록 실패는 결과를 바꾸지 않는다 */ }
};

/** JS 문자열 위치(UTF-16) → 코드 포인트 위치. 파이썬 분석기는 코드 포인트로 센다. */
export const toCodePointIndex = (text) => {
    const map = new Array(text.length + 1);
    let cp = 0;
    for (let i = 0; i < text.length; i += 1) {
        map[i] = cp;
        const code = text.charCodeAt(i);
        if (code < 0xd800 || code > 0xdbff) cp += 1;
    }
    map[text.length] = cp;
    return map;
};

/** 빨간 줄 자리(코드 포인트 [start, end)) — 앱과 같은 세 검사. */
export const redSpans = (text, commonEntries) => {
    const map = toCodePointIndex(text);
    // 학생 입력기와 같은 엔진 — 학생에게 실제로 보이는 빨간 줄
    return checkSpelling(text, { elementaryDetector: findElementarySpellingIssues, entries: commonEntries, limit: 200 })
        .map((issue) => [map[issue.start], map[issue.end]]);
};

/** 첫 제출본에서 찾은 자리를 나중 글(다시 쓴 글·선생님이 고친 글)이 어떻게 했는지. */
export const outcomeOf = (suggestion, finalText) => {
    if (!finalText) return 'unknown';
    const keptOriginal = finalText.includes(suggestion.original);
    if (keptOriginal) return 'kept';
    return finalText.includes(suggestion.suggestion) ? 'fixed_as_suggested' : 'fixed_otherwise';
};

const runAnalyzer = (jobs) => new Promise((resolve, reject) => {
    const child = spawn(PYTHON, ['-I', ANALYZER], { stdio: ['pipe', 'pipe', 'inherit'] });
    const results = new Map();
    let buffer = '';
    child.stdout.on('data', (chunk) => {
        buffer += chunk;
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, index);
            buffer = buffer.slice(index + 1);
            if (!line.trim()) continue;
            const parsed = JSON.parse(line);
            if (parsed.id !== null) results.set(parsed.id, parsed.suggestions || []);
        }
    });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(results) : reject(new Error(`analyzer_exit_${code}`))));
    for (const job of jobs) child.stdin.write(`${JSON.stringify({ id: job.id, text: job.text })}\n`);
    child.stdin.end();
});

const runShadow = async () => {
    const days = Number(arg('--days', '0'));
    const all = process.argv.includes('--all');
    const since = all ? "'-infinity'::timestamptz" : days > 0
        ? `now() - interval '${Math.min(Math.max(days, 1), 60)} days'`
        : "coalesce((select max(source_until) from public.spelling_shadow_runs), now() - interval '1 day')";
    // psql 은 RETURNING 값 뒤에 'INSERT 0 1' 을 한 줄 더 찍는다 — 첫 줄만 쓴다.
    const runId = Number.parseInt(psql(`insert into public.spelling_shadow_runs(note) values ('${all ? 'all posts' : days > 0 ? `backfill ${days}d` : 'nightly'}') returning id;`).split('\n')[0], 10);
    if (!Number.isInteger(runId)) throw new Error('run_id_missing');
    const posts = JSON.parse(psql(`select coalesce(json_agg(json_build_object('id', id, 'class_id', class_id, 'content', content, 'original', original_content, 'teacher', teacher_edited_content)), '[]')
        from public.student_posts where (is_submitted or ${all ? 'true' : 'false'}) and updated_at > ${since} and updated_at <= now() and char_length(coalesce(content, '')) > 0;`) || '[]');
    const common = JSON.parse(psql("select coalesce(json_agg(json_build_object('id', id, 'wrong_expression', wrong_expression, 'correct_expression', correct_expression, 'label', label)), '[]') from public.spelling_learning_entries where scope='common' and status='approved';") || '[]');

    const jobs = [];
    for (const post of posts) {
        jobs.push({ id: `${post.id}|final`, text: post.content, post });
        if (post.original && post.original !== post.content) jobs.push({ id: `${post.id}|original`, text: post.original, post });
    }
    const results = await runAnalyzer(jobs);
    const rows = [];
    for (const job of jobs) {
        const version = job.id.split('|')[1];
        const reds = redSpans(job.text, common);
        const later = job.post.teacher || (version === 'original' ? job.post.content : null);
        for (const item of results.get(job.id) || []) {
            if (item.original.length > 60 || item.suggestion.length > 60) continue;
            const overlapsRed = reds.some(([s, e]) => s < item.end && e > item.start);
            const filterReason = overlapsRed ? 'red_overlap' : item.filter_reason || null;
            rows.push({
                post_id: job.post.id, class_id: job.post.class_id, text_version: version, kind: item.kind,
                original: item.original, suggestion: item.suggestion,
                category: item.category || 'other_spacing', filter_reason: filterReason,
                // 2단계에서 보였을지: 고른 갈래 + 거르기 통과 + 빨간 줄과 안 겹침 + 교차 확인
                shown: isShown(item, filterReason),
                overlaps_red: overlapsRed,
                agree_hunspell: item.hunspell ?? null, agree_mecab: item.mecab ?? null,
                outcome: version === 'original' || job.post.teacher ? outcomeOf(item, later) : 'unknown'
            });
        }
    }
    // 한 글에 같은 낱말이 여러 번 나오면 같은 줄이 겹친다 — 하나만 남긴다(빨간 줄과 하나라도 겹치면 겹침으로).
    const unique = new Map();
    for (const row of rows) {
        const key = [row.post_id, row.text_version, row.kind, row.original, row.suggestion].join('\u0001');
        const prev = unique.get(key);
        unique.set(key, prev ? { ...prev, overlaps_red: prev.overlaps_red || row.overlaps_red, shown: prev.shown && row.shown, filter_reason: prev.filter_reason || row.filter_reason } : row);
    }
    const deduped = [...unique.values()];
    let saved = 0;
    for (let offset = 0; offset < deduped.length; offset += 2000) {
        const chunk = Buffer.from(JSON.stringify(deduped.slice(offset, offset + 2000)), 'utf8').toString('base64');
        saved += Number(psql(`with ins as (insert into public.spelling_shadow_suggestions(post_id, class_id, text_version, kind, original, suggestion, overlaps_red, outcome, category, shown, filter_reason, agree_hunspell, agree_mecab)
            select r.post_id, r.class_id, r.text_version, r.kind, r.original, r.suggestion, r.overlaps_red, r.outcome, r.category, r.shown, r.filter_reason, r.agree_hunspell, r.agree_mecab
            from json_to_recordset(convert_from(decode('${chunk}', 'base64'), 'UTF8')::json) as r(post_id uuid, class_id uuid, text_version text, kind text, original text, suggestion text, overlaps_red boolean, outcome text, category text, shown boolean, filter_reason text, agree_hunspell boolean, agree_mecab boolean)
            where exists (select 1 from public.student_posts p where p.id = r.post_id)
            on conflict (post_id, text_version, kind, original, suggestion) do update set overlaps_red = excluded.overlaps_red, outcome = excluded.outcome,
                category = excluded.category, shown = excluded.shown, filter_reason = excluded.filter_reason,
                agree_hunspell = excluded.agree_hunspell, agree_mecab = excluded.agree_mecab, analyzed_at = now()
            returning 1) select count(*) from ins;`) || 0);
    }
    psql(`delete from public.spelling_shadow_suggestions where analyzed_at < now() - interval '${KEEP_DAYS} days';
        update public.spelling_shadow_runs set finished_at = now(), posts_analyzed = ${posts.length}, suggestions_saved = ${saved}, source_until = now() where id = ${runId};`);
    const at = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
    status(`OK ${at} posts=${posts.length} saved=${saved}`);
    console.log(`글 ${posts.length}편 분석 · 살펴볼 곳 ${saved}개 기록`);
};

const report = () => {
    const days = Math.min(Math.max(Number(arg('--days', '14')), 1), 60);
    const where = `analyzed_at > now() - interval '${days} days'`;
    const rows = psql(`select kind, count(*), count(*) filter (where overlaps_red),
        count(*) filter (where text_version='original'), count(*) filter (where text_version='original' and outcome='fixed_as_suggested'),
        count(*) filter (where text_version='original' and outcome='fixed_otherwise'), count(*) filter (where text_version='original' and outcome='kept')
        from public.spelling_shadow_suggestions where ${where} group by 1 order by 1;`);
    const perPost = psql(`select round(avg(c), 1), max(c) from (select post_id, count(*) c from public.spelling_shadow_suggestions where ${where} and text_version='final' and not overlaps_red group by 1) t;`);
    const posts = psql(`select count(distinct post_id) from public.spelling_shadow_suggestions where ${where};`);
    console.log(`최근 ${days}일 · 살펴볼 곳이 생긴 글 ${posts}편 · 글 한 편에 (빨간 줄과 안 겹치는) 회색 줄 평균·최대 ${perPost.replace('|', ' / ')}`);
    console.log('갈래 | 모두 | 빨간 줄과 겹침 | 첫 제출본에서 찾은 것 → 제안대로 고침 / 다르게 고침 / 그대로 둠');
    for (const line of rows.split('\n').filter(Boolean)) {
        const [kind, total, red, orig, asSuggested, otherwise, kept] = line.split('|').map((v, i) => (i ? Number(v) : v));
        const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '-');
        console.log(`${kind} | ${total} | ${red}(${pct(red, total)}) | ${orig} → ${asSuggested}(${pct(asSuggested, orig)}) / ${otherwise}(${pct(otherwise, orig)}) / ${kept}(${pct(kept, orig)})`);
    }
    const top = (filter, label) => {
        const list = psql(`select original || ' → ' || suggestion || ' (' || count(*) || ')' from public.spelling_shadow_suggestions where ${where} and ${filter}
            group by original, suggestion order by count(*) desc limit 25;`);
        console.log(`\n${label}\n${list.split('\n').filter(Boolean).join(' | ')}`);
    };
    top("text_version='original' and outcome='fixed_as_suggested' and not overlaps_red", '아이·선생님이 제안대로 고친 것(빨간 줄 없음) — 기본 자료로 올릴 후보');
    top("text_version='original' and outcome='kept' and not overlaps_red", '고치지 않고 둔 것 — 회색 줄이 틀렸을 수 있는 자리(낱말·고유명사 확인)');
};

if (process.argv[1]?.endsWith('spelling-shadow.mjs')) {
    (process.argv.includes('--report') ? Promise.resolve(report()) : runShadow()).catch((error) => {
        const at = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
        if (!process.argv.includes('--report')) status(`FAILED ${at} ${String(error.message).replace(/\s+/g, ' ').slice(0, 80)}`);
        console.error(`회색 줄 기록 실패 — ${error.message}`);
        process.exitCode = 1;
    });
}
