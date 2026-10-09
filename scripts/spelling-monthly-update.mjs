/**
 * 맞춤법 한 달 자동 업데이트(2026-10-09, 선생님 결정) — 빨간 물결·회색 점선이 놓친 맞춤법을 한 달에 한 번 모아 자동 반영한다.
 *
 *   node scripts/spelling-monthly-update.mjs                 지난달(서울) 자료로 실행하고 텔레그램 요약
 *   node scripts/spelling-monthly-update.mjs --dry-run       게시하지 않고 결과만 보기
 *   node scripts/spelling-monthly-update.mjs --month 2026-10 그 달 자료로(이미 돈 달은 건너뛴다, --force 로 다시)
 *   node scripts/spelling-monthly-update.mjs --all --dry-run 기록 전체로 미리 보기(처음 시험용)
 *
 * 모으는 것(학생·학급 식별자와 글 원문은 남기지 않는다 — 어절 조각·횟수·학급 수만):
 *   ① gray_applied  회색 점선에서 학생이 `이렇게 고치기` 를 고른 것(spelling_gray_feedback)
 *   ② gray_fixed    회색 점선 자리를 학생(다시 쓰기)·선생님이 나중에 제안대로 고친 것(spelling_shadow_suggestions)
 *   ③ teacher_edit  선생님이 직접 고쳐 줬는데 빨간 물결·회색 점선 모두 놓친 것(student_post_teacher_edits, 채점표와 같은 방식)
 *
 * 자동 게시 관문(모두 지나야 공통 자료 = 빨간 물결이 된다, source_kind='monthly'):
 *   · 한글 2~15자·2어절 이하, 틀린 꼴 ≠ 바른 꼴, 이미 있는 자료(기본·검토 중·공통)·지금 검사기가 이미 긋는 것 아님
 *   · 증거: 2개 학급 이상, 그리고 ①은 3번 이상 고르고 받아들인 비율 80% 이상 / ②·③은 3번 이상
 *   · 사전(hunspell): 바른 꼴은 모두 사전에 있는 말. 틀린 꼴이 그 자체로 맞는 낱말이면(질렸다→질렀다) 문맥이 필요해 보류
 *   · 표준국어대사전(무료 API, 낱말만 보냄): 틀린 꼴이 **다른 뜻의 표제어**면 보류(2026-10-09 — 862개 교차 점검과 같은 방식)
 *   · 학생 글 전체 모의 실행: 틀린 꼴을 품은 어절 가운데 **사전에 있는 바른 말**(그 안에 밑줄이 그어질 곳)이 0
 *     (선생님이 고친 뒤 글에 같은 실수가 남는 것은 보지 않는다 — 선생님이 한 글의 실수를 다 고치지는 않는다)
 *   · 한 달에 50개까지(증거 많은 순)
 * 관문을 못 지난 것은 보류(held)로 남기고 까닭을 적는다 — 관리자가 보고 손으로 넣는다.
 * 자동 게시한 것은 관리자 화면에서 하나씩 끄거나, 한 달 치를 한꺼번에 끌 수 있다(spelling_monthly_candidates.entry_id).
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { checkSpelling } from '../src/modules/writing/student-input/checker/spellingEngine.js';
import { findElementarySpellingIssues, getElementarySpellingEntries } from '../src/modules/writing/student-input/checker/elementarySpellingEntries.js';
import { PENDING_SPELLING_ENTRIES } from '../src/modules/writing/student-input/checker/pending/pendingSpellingEntries.js';
import { normalizeSpellingValue } from '../supabase/functions/spelling-weekly-review/reviewCore.js';
import { scoreDocuments } from './spelling-scorecard.mjs';
import { classifyWrongHeadword, dictionaryLookup } from './expand-spelling-base.mjs';
import { sendTelegram } from './lib/telegram.mjs';

const DOCKER = '/Applications/Docker.app/Contents/Resources/bin/docker';
const HUNSPELL = '/opt/homebrew/bin/hunspell';
const HUNSPELL_DICT = path.join(homedir(), 'agit-kiwi/hunspell-ko/ko-fast');
const STATUS = path.join(homedir(), 'backups/auto/spelling-monthly-status.txt');
export const MONTHLY_LIMIT = 50;
export const GATES = Object.freeze({ minClasses: 2, minSupport: 3, minAppliedRate: 0.8 });

const has = (flag) => process.argv.includes(flag);
const arg = (name, fallback) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : fallback;
};
const psql = (sql) => {
    const result = spawnSync(DOCKER, ['exec', '-i', 'agit-db', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'],
        { input: sql, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`database_failed:${String(result.stderr).split('\n')[0]}`);
    return result.stdout.trim();
};
const psqlJson = (sql) => JSON.parse(psql(sql) || '[]');
const status = (text) => {
    try { mkdirSync(path.dirname(STATUS), { recursive: true }); appendFileSync(STATUS, `${text}\n`); } catch { /* 상태 파일은 없어도 된다 */ }
};

/** 어절 조각을 같은 꼴로 맞춘다(끝 문장 부호·겹 공백 정리). */
export const cleanPiece = (value) => String(value || '').normalize('NFC')
    .replace(/[.,!?~…"'“”‘’()]+$/u, '').replace(/^[.,!?~…"'“”‘’()]+/u, '').replace(/\s+/g, ' ').trim();

/** 한글 2~15자·2어절 이하·서로 다른 짝인지. */
export const isCleanPair = (wrong, right) => (
    wrong !== right
    && /^[가-힣]+( [가-힣]+)?$/.test(wrong) && /^[가-힣]+( [가-힣]+)?$/.test(right)
    && wrong.replace(/ /g, '').length >= 2 && wrong.length <= 15 && right.length <= 15
);

const spacingOnly = (wrong, right) => wrong.replace(/ /g, '') === right.replace(/ /g, '');

/** 아이에게 보일 한 줄 설명(유료 AI 없이 틀로). */
export const explanationFor = (wrong, right) => (spacingOnly(wrong, right)
    ? `띄어쓰기를 바르게 하면 ‘${right}’예요.`
    : `‘${wrong}’ 대신 ‘${right}’라고 써요.`);

/** 사전에 없는 낱말들(hunspell -l). 사전이 없으면 null — 그러면 이번 달은 사전 관문을 지날 수 없어 모두 보류된다. */
const unknownWords = (words) => {
    const unique = [...new Set(words.filter(Boolean))];
    if (!unique.length) return new Set();
    const result = spawnSync(HUNSPELL, ['-d', HUNSPELL_DICT, '-l', '-i', 'utf-8'], { input: `${unique.join('\n')}\n`, encoding: 'utf8' });
    if (result.status !== 0 && !result.stdout) return null;
    return new Set(result.stdout.split('\n').map((line) => line.trim()).filter(Boolean));
};

/** 증거들을 틀린 꼴→바른 꼴 짝으로 모은다. */
export const mergeEvidence = (rows) => {
    const byKey = new Map();
    for (const row of rows) {
        const wrong = cleanPiece(row.wrong), right = cleanPiece(row.right);
        if (!isCleanPair(wrong, right)) continue;
        const key = `${wrong}\u0001${right}`;
        const item = byKey.get(key) || { wrong, right, sources: new Set(), support: 0, applied: 0, kept: 0, classSet: new Set(), classCount: 0 };
        item.sources.add(row.source);
        if (row.source === 'gray_applied') { item.applied += row.applied || 0; item.kept += row.kept || 0; }
        else item.support += row.support || 0;
        for (const id of row.classIds || []) item.classSet.add(id);
        item.classCount = Math.max(item.classCount, item.classSet.size, row.classes || 0);
        byKey.set(key, item);
    }
    return [...byKey.values()].map((item) => ({ ...item, support: item.support + item.applied }));
};

/** 증거 관문 — 통과하면 null, 아니면 까닭. */
export const evidenceProblem = (item) => {
    if (item.classCount < GATES.minClasses) return `학급 ${item.classCount}곳뿐(2곳 이상 필요)`;
    const appliedOk = item.applied >= GATES.minSupport && item.applied / Math.max(1, item.applied + item.kept) >= GATES.minAppliedRate;
    const otherOk = item.support - item.applied >= GATES.minSupport;
    if (!appliedOk && !otherOk) return `증거 ${item.support}번(3번 이상·받아들인 비율 80% 이상 필요)`;
    return null;
};

/** 모을 달 — 처음 값은 지난달(서울). */
export const monthRange = (now = new Date(), monthArg = arg('--month', ''), all = has('--all')) => {
    if (all) return { runMonth: null, from: '1970-01-01', to: '2999-01-01', label: '기록 전체' };
    const seoul = new Date(now.getTime() + 9 * 3600000);
    let year = seoul.getUTCFullYear();
    let month = seoul.getUTCMonth();          // 0부터 — 그대로 쓰면 '지난달'(1부터 센 값)
    if (monthArg) [year, month] = monthArg.split('-').map(Number);
    else if (month === 0) { year -= 1; month = 12; }
    const pad = (value) => String(value).padStart(2, '0');
    const from = `${year}-${pad(month)}-01`;
    const to = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
    return { runMonth: from, from, to, label: `${year}년 ${month}월` };
};

const collect = ({ from, to }) => {
    const range = (column) => `${column} >= ('${from}'::date)::timestamp AT TIME ZONE 'Asia/Seoul' AND ${column} < ('${to}'::date)::timestamp AT TIME ZONE 'Asia/Seoul'`;
    const grayApplied = psqlJson(`select coalesce(json_agg(r), '[]') from (
        select original as wrong, suggestion as right, 'gray_applied' as source,
               count(*) filter (where choice = 'applied') as applied, count(*) filter (where choice = 'kept') as kept,
               count(distinct class_id) as classes
        from public.spelling_gray_feedback where ${range('created_at')} group by 1, 2) r;`);
    const grayFixed = psqlJson(`select coalesce(json_agg(r), '[]') from (
        select original as wrong, suggestion as right, 'gray_fixed' as source,
               count(distinct post_id) as support, count(distinct class_id) as classes
        from public.spelling_shadow_suggestions
        where shown and outcome = 'fixed_as_suggested' and ${range('analyzed_at')} group by 1, 2) r;`);
    const common = psqlJson(`select coalesce(json_agg(json_build_object('id', id, 'wrong_expression', wrong_expression, 'correct_expression', correct_expression, 'label', label)), '[]')
        from public.spelling_learning_entries where scope = 'common' and status = 'approved';`);
    const edits = psqlJson(`select coalesce(json_agg(json_build_object('base_content', e.base_content, 'edited_content', e.edited_content, 'class_id', p.class_id)), '[]')
        from public.student_post_teacher_edits e join public.student_posts p on p.id = e.post_id where ${range('e.created_at')};`);
    // 선생님 교정: 문서마다 채점해 놓친 것을 학급과 함께 센다(학급 ID 는 셈에만 쓰고 남기지 않는다)
    const teacherRows = new Map();
    for (const doc of edits) {
        for (const line of scoreDocuments([doc], common).missed) {
            const [wrong, right] = line.split(' → ');
            const key = `${cleanPiece(wrong)}\u0001${cleanPiece(right)}`;
            const row = teacherRows.get(key) || { wrong, right, source: 'teacher_edit', support: 0, classIds: new Set() };
            row.support += 1;
            row.classIds.add(doc.class_id);
            teacherRows.set(key, row);
        }
    }
    const teacher = [...teacherRows.values()].map((row) => ({ ...row, classIds: [...row.classIds] }));
    const summary = psqlJson(`select coalesce(json_agg(r), '[]') from (
        select category, count(*) filter (where choice = 'applied') as applied, count(*) filter (where choice = 'kept') as kept
        from public.spelling_gray_feedback where ${range('created_at')} group by 1 order by 1) r;`);
    return { rows: [...grayApplied, ...grayFixed, ...teacher], common, summary, editDocs: edits.length };
};

/** 이미 아는 표현(기본 500·검토 중·공통). */
const knownKeys = (common) => {
    const keys = new Set();
    const add = (value) => { const key = normalizeSpellingValue(value); if (key) keys.add(key); };
    for (const entry of [...getElementarySpellingEntries(), ...PENDING_SPELLING_ENTRIES]) {
        for (const pattern of entry.detectionPatterns || []) add(pattern.target || pattern.text);
    }
    for (const entry of common) add(entry.wrong_expression);
    return keys;
};

/** 학생 글 전체 모의 실행 — 후보마다 틀린 꼴을 품은 어절(띄어쓰기 단위로 넓힌 조각)을 모은다. */
const containingSpans = (candidates) => {
    const posts = psql(`select coalesce(string_agg(replace(replace(content, E'\\n', ' '), E'\\r', ' '), E'\\n'), '') from public.student_posts where content is not null;`);
    const spans = new Map();
    for (const item of candidates) {
        const found = new Set();
        let at = posts.indexOf(item.wrong);
        for (let guard = 0; at >= 0 && guard < 2000; guard += 1) {
            let s = at, e = at + item.wrong.length;
            while (s > 0 && !/\s/.test(posts[s - 1])) s -= 1;
            while (e < posts.length && !/\s/.test(posts[e])) e += 1;
            found.add(cleanPiece(posts.slice(s, e)));
            at = posts.indexOf(item.wrong, at + 1);
        }
        // 문장 부호에서도 끊는다(아이들은 마침표 뒤를 자주 붙여 쓴다). 틀린 꼴의 조각을 품은 낱말만 남긴다.
        const pieces = item.wrong.split(' ');
        const tokens = [...found].flatMap((span) => span.split(/[\s.,!?~…"'“”‘’()[\]:;·/-]+/u))
            .filter((token) => token && pieces.some((piece) => token.includes(piece)) && !pieces.includes(token));
        spans.set(item, [...new Set(tokens)]);
    }
    return spans;
};

/** 표준국어대사전 열쇠(없으면 null — 그러면 사전 관문을 지날 수 없어 보류된다). 값은 어디에도 쓰지 않는다. */
const readDictionaryKey = () => {
    try {
        const line = readFileSync(path.join(homedir(), 'agit-supabase/secrets.agit.env'), 'utf8').split('\n').find((row) => row.startsWith('STDICT_API_KEY='));
        return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : null;
    } catch {
        return null;
    }
};

/**
 * 사전 관문 — 통과하면 null, 아니면 보류 까닭. 띄어쓰기만 다른 짝은 낱말이 같아 보지 않는다.
 * 틀린 꼴이 표제어라도 뜻풀이가 바른 꼴을 가리키면(→ 계속) 비표준 꼴로 실린 것이라 통과.
 */
export const dictionaryProblem = async (item, key, lookup = dictionaryLookup) => {
    if (spacingOnly(item.wrong, item.right) || /\s/.test(item.wrong)) return null;
    if (!key) return '표준국어대사전 열쇠가 없어 확인 못 함';
    const wrong = await lookup(key, item.wrong, 'exact');
    if (wrong.total < 0) return '표준국어대사전 조회 실패';
    if (wrong.total > 0) {
        const { pointsToRight, otherMeanings } = classifyWrongHeadword(wrong.items, item.right);
        if (!pointsToRight && otherMeanings.length) return `표준국어대사전에 다른 뜻 낱말로 있음: ${otherMeanings[0].slice(0, 30)}`;
    }
    return null;
};

const sqlText = (value) => `'${String(value).replace(/'/g, "''")}'`;

/** 공통 자료(빨간 물결) 한 줄을 넣는 SQL — 시뮬레이션 검사가 같은 함수로 실제 넣기를 되돌림 시험한다. */
export const publishEntrySql = (item, adminId) => `insert into public.spelling_learning_entries(scope, status, wrong_expression, correct_expression, label, explanation, examples, source_kind, created_by, approved_by, approved_at)
    values ('common', 'approved', ${sqlText(item.wrong)}, ${sqlText(item.right)}, ${sqlText(`${item.wrong} / ${item.right}`.slice(0, 40))},
            ${sqlText(explanationFor(item.wrong, item.right))}, '[]'::jsonb, 'monthly', ${sqlText(adminId)}, ${sqlText(adminId)}, now())
    returning id;`;

const main = async () => {
    const dryRun = has('--dry-run');
    const range = monthRange();
    if (range.runMonth && !dryRun && !has('--force')) {
        const done = psql(`select count(*) from public.spelling_monthly_runs where run_month = '${range.runMonth}' and finished_at is not null;`);
        if (Number(done) > 0) { console.log(`${range.label} 은 이미 돌았습니다(--force 로 다시).`); return; }
    }
    const { rows, common, summary, editDocs } = collect(range);
    const known = knownKeys(common);
    const merged = mergeEvidence(rows)
        .filter((item) => !known.has(normalizeSpellingValue(item.wrong)))
        // 지금 검사기가 이미 긋는 것은 빼고 센다(빨간 물결이 이미 잡는다)
        .filter((item) => !checkSpelling(item.wrong, { elementaryDetector: findElementarySpellingIssues, entries: common }).length)
        .sort((a, b) => b.support - a.support || a.wrong.localeCompare(b.wrong, 'ko'));

    const pieces = merged.flatMap((item) => [...item.wrong.split(' '), ...item.right.split(' ')]);
    const unknown = unknownWords(pieces);
    const strong = merged.filter((item) => !evidenceProblem(item));
    const spans = containingSpans(strong);
    // 틀린 꼴을 품은 어절이 사전에 있는 바른 말이면 그 안에 밑줄이 그어진다 — 어절 조각을 한 번에 사전에 묻는다.
    const spanUnknown = unknownWords([...spans.values()].flat());
    const decided = merged.map((item) => {
        let reason = evidenceProblem(item);
        if (!reason && !unknown) reason = '사전(hunspell)이 없어 확인 못 함';
        if (!reason && item.right.split(' ').some((word) => unknown.has(word))) reason = '바른 꼴이 사전에 없음';
        if (!reason && !spacingOnly(item.wrong, item.right) && item.wrong.split(' ').every((word) => !unknown.has(word))) {
            reason = '틀린 꼴도 맞는 낱말이라 문맥이 필요(관리자가 문맥 자료로)';
        }
        if (!reason) {
            // 틀린 꼴을 품은 더 긴 낱말이 사전에 있는 바른 말이면 그 안에 밑줄이 그어진다(예: 될수도 ⊂ ?)
            const risky = (spans.get(item) || []).filter((token) => spanUnknown && !spanUnknown.has(token));
            if (risky.length) reason = `바른 낱말 속에 들어감: ${risky.slice(0, 3).join(', ')}`;
        }
        return { ...item, status: reason ? 'held' : 'published', reason };
    });
    // 사전 관문(무료 API) — 다른 관문을 지난 것만 묻는다(많아야 수십 번)
    const dictKey = readDictionaryKey();
    for (const item of decided.filter((entry) => entry.status === 'published')) {
        const problem = await dictionaryProblem(item, dictKey);
        if (problem) { item.status = 'held'; item.reason = problem; }
    }
    let published = decided.filter((item) => item.status === 'published');
    for (const item of published.slice(MONTHLY_LIMIT)) { item.status = 'held'; item.reason = `한 달 상한 ${MONTHLY_LIMIT}개 초과`; }
    published = published.slice(0, MONTHLY_LIMIT);
    const held = decided.filter((item) => item.status === 'held');

    const summaryText = summary.map((row) => {
        const total = Number(row.applied) + Number(row.kept);
        return `${row.category} ${total ? Math.round((Number(row.applied) / total) * 100) : 0}%(${row.applied}/${total})`;
    }).join(' · ') || '기록 없음';
    console.log(`${range.label} · 후보 ${decided.length} · 게시 ${published.length} · 보류 ${held.length} · 선생님 교정 ${editDocs}회차`);
    console.log(`회색 점선 받아들인 비율: ${summaryText}`);
    for (const item of published.slice(0, 20)) console.log(`  + ${item.wrong} → ${item.right} (${[...item.sources].join(',')} ${item.support}번 · ${item.classCount}학급)`);
    for (const item of held.slice(0, 20)) console.log(`  · 보류 ${item.wrong} → ${item.right} — ${item.reason}`);
    if (dryRun || !range.runMonth) return;

    // 공통 자료는 만든 사람이 꼭 있어야 한다(created_by NOT NULL) — 관리자 이름으로 넣고 승인자도 관리자로 남긴다.
    // (2026-10-09 시뮬레이션에서 찾음: 이 값 없이 넣으면 첫 실행에서 게시가 하나도 안 되고 실패했다)
    const adminId = psql(`select id from public.profiles where role = 'ADMIN' order by created_at limit 1;`).split('\n')[0];
    if (!adminId) throw new Error('admin_profile_missing');
    const runId = psql(`insert into public.spelling_monthly_runs(run_month) values ('${range.runMonth}')
        on conflict (run_month) do update set started_at = now(), finished_at = null returning id;`).split('\n')[0];
    for (const item of decided) {
        let entryId = 'NULL';
        if (item.status === 'published') {
            entryId = psql(publishEntrySql(item, adminId)).split('\n')[0];
            entryId = sqlText(entryId);
        }
        psql(`insert into public.spelling_monthly_candidates(run_month, wrong_expression, correct_expression, sources, support, classes, status, reason, entry_id)
            values ('${range.runMonth}', ${sqlText(item.wrong)}, ${sqlText(item.right)}, ${sqlText(`{${[...item.sources].join(',')}}`)}, ${item.support}, ${item.classCount},
                    '${item.status}', ${item.reason ? sqlText(item.reason.slice(0, 200)) : 'NULL'}, ${entryId})
            on conflict (run_month, wrong_expression, correct_expression) do update set status = excluded.status, reason = excluded.reason, entry_id = coalesce(excluded.entry_id, spelling_monthly_candidates.entry_id);`);
    }
    psql(`update public.spelling_monthly_runs set finished_at = now(), candidates = ${decided.length}, published = ${published.length}, held = ${held.length},
        summary = ${sqlText(JSON.stringify({ gray: summary, edit_docs: editDocs }))}::jsonb where id = ${runId};
        delete from public.spelling_monthly_candidates where created_at < now() - interval '1 year';`);
    const at = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
    status(`OK ${at} month=${range.runMonth} published=${published.length} held=${held.length}`);
    sendTelegram([
        `🗓️ 맞춤법 한 달 업데이트 (${range.label})`,
        `빨간 물결에 새로 더함 ${published.length}개 · 보류 ${held.length}개`,
        ...published.slice(0, 10).map((item) => `+ ${item.wrong} → ${item.right}`),
        held.length ? `보류 예: ${held.slice(0, 5).map((item) => `${item.wrong}→${item.right}`).join(', ')}` : '',
        `회색 점선 받아들인 비율: ${summaryText}`,
        '되돌리기: 관리자 › 맞춤법 승격 › 전체 공통 자료에서 🗓️ 한 달 자동 표시를 적용 중지 · 한꺼번에: docs/SPELLING_MONTHLY_UPDATE.md'
    ].filter(Boolean).join('\n'));
};

if (process.argv[1]?.endsWith('spelling-monthly-update.mjs')) {
    main().catch((error) => {
        const at = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
        status(`FAILED ${at} ${error.message}`);
        console.error(`한 달 업데이트 실패 — ${error.message}`);
        if (!has('--dry-run')) sendTelegram(`⚠️ 맞춤법 한 달 업데이트 실패 (${at})\n${error.message}`);
        process.exitCode = 1;
    });
}
