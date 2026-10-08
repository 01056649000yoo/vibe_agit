/**
 * 맞춤법 검사기 채점표(2026-10-08) — 선생님이 학생 글을 직접 고쳐 준 기록(student_post_teacher_edits)을 정답지로 쓴다.
 *
 *   node scripts/spelling-scorecard.mjs [--out <스크래치 파일>]
 *
 * ① 고치기 전·후 글을 글자 단위로 견줘 고친 자리를 찾고, 그중 **맞춤법·띄어쓰기 수정**만 남긴다
 *    (짧고, 고치기 전·후가 비슷한 것 — 문장을 새로 쓴 것은 뺀다).
 * ② 고치기 전 글에 지금 검사기(빠른 규칙 + 기본 자료 + 공통 자료)를 돌려 밑줄을 얻는다.
 * ③ 잡아낸 비율 = 선생님 수정 중 밑줄과 겹친 것 / 선생님 수정
 *    맞힌 비율   = 밑줄 중 선생님 수정과 겹친 것 / 밑줄 (선생님이 모든 틀린 곳을 고치지는 않으므로 실제보다 낮게 나온다)
 * 학생 글은 맥미니 밖으로 보내지 않는다. 저장소에는 숫자만 남기고, 놓친 예시는 --out(스크래치)에만 쓴다.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { findSpellingIssues } from '../src/modules/writing/tools/spelling-lookup/spellingDetectionRules.js';
import { findElementarySpellingIssues } from '../src/modules/writing/tools/spelling-lookup/elementarySpellingEntries.js';
import { findClassSpellingIssues } from '../src/modules/writing/spelling-learning/detection.js';

const DOCKER = '/Applications/Docker.app/Contents/Resources/bin/docker';
const arg = (name, fallback) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : fallback;
};
const psqlJson = (sql) => {
    const result = spawnSync(DOCKER, ['exec', '-i', 'agit-db', 'psql', '-U', 'postgres', '-d', 'postgres', '-At'], { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (result.status !== 0) throw new Error('database_read_failed');
    return JSON.parse(result.stdout.trim() || '[]');
};

/** 두 글의 바뀐 자리(고치기 전 글 기준 [시작, 끝), 고친 뒤 글자). 글자 단위 최장 공통 부분열. */
export const diffEdits = (before, after) => {
    const a = [...before], b = [...after];
    if (a.length * b.length > 25_000_000) return null;
    const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i -= 1) {
        for (let j = b.length - 1; j >= 0; j -= 1) {
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const edits = [];
    let i = 0, j = 0, open = null;
    const close = () => { if (open) { edits.push(open); open = null; } };
    while (i < a.length || j < b.length) {
        if (i < a.length && j < b.length && a[i] === b[j]) { close(); i += 1; j += 1; continue; }
        if (!open) open = { start: i, end: i, inserted: '' };
        if (j < b.length && (i >= a.length || dp[i][j + 1] >= dp[i + 1][j])) { open.inserted += b[j]; j += 1; }
        else { i += 1; open.end = i; }
    }
    close();
    // 글자 위치(코드 포인트) → 문자열 위치로
    const offsets = [];
    let pos = 0;
    for (const ch of a) { offsets.push(pos); pos += ch.length; }
    offsets.push(pos);
    return edits.map((edit) => ({ start: offsets[edit.start], end: offsets[edit.end], inserted: edit.inserted }));
};

/** 고친 자리를 어절(띄어쓰기 단위)까지 넓혀 "틀린 어절 → 고친 어절" 로 만든다. */
const widen = (text, start, end) => {
    let s = start, e = end;
    while (s > 0 && !/\s/.test(text[s - 1])) s -= 1;
    while (e < text.length && !/\s/.test(text[e])) e += 1;
    return [s, e];
};

/** 맞춤법·띄어쓰기 수정인지 — 짧고 고치기 전·후가 비슷해야 한다(내용을 새로 쓴 것은 뺀다). */
export const isSpellingEdit = (wrong, right) => {
    const strip = (value) => value.replace(/[\s.,!?'"“”‘’()·~:;*/-]/g, '');
    const w = strip(wrong), r = strip(right);
    if (!w || !r || w.length > 15 || r.length > 15) return false;
    // 문장 부호만 바꾼 것은 뺀다(맞춤법 검사기가 볼 일이 아님)
    if (w === r) return wrong.replace(/[^\S]|[^가-힣\s]/g, '') !== right.replace(/[^\S]|[^가-힣\s]/g, '') || /\s/.test(wrong) !== /\s/.test(right) || wrong.split(/\s+/).length !== right.split(/\s+/).length;
    const lev = (x, y) => {
        const d = Array.from({ length: x.length + 1 }, (_, k) => [k]);
        for (let q = 1; q <= y.length; q += 1) d[0][q] = q;
        for (let p = 1; p <= x.length; p += 1) for (let q = 1; q <= y.length; q += 1) d[p][q] = Math.min(d[p - 1][q] + 1, d[p][q - 1] + 1, d[p - 1][q - 1] + (x[p - 1] === y[q - 1] ? 0 : 1));
        return d[x.length][y.length];
    };
    // 글자 몇 개만 바뀐 것(맞춤법). 낱말을 통째로 바꾼 것(분노의→주황색)은 뺀다.
    const distance = lev(w, r);
    return distance <= (Math.max(w.length, r.length) <= 3 ? 1 : 2) && distance < Math.max(w.length, r.length);
};

export const scoreDocuments = (docs, commonEntries) => {
    let edits = 0, caught = 0, issues = 0, hitIssues = 0;
    const missed = [], falseAlarms = [];
    for (const doc of docs) {
        const before = String(doc.base_content || ''), after = String(doc.edited_content || '');
        if (!before || !after || before === after) continue;
        const raw = diffEdits(before, after);
        if (!raw) continue;
        const spans = [];
        for (const edit of raw) {
            const [s, e] = widen(before, edit.start, Math.max(edit.end, edit.start));
            const wrong = before.slice(s, e);
            // 고친 뒤 어절: 같은 자리 앞뒤 어절 + 넣은 글자
            const right = (before.slice(s, edit.start) + edit.inserted + before.slice(edit.end, e)).trim();
            if (!isSpellingEdit(wrong.trim(), right)) continue;
            if (spans.some((span) => span.s === s)) continue;
            spans.push({ s, e, wrong: wrong.trim(), right });
        }
        const found = [
            ...findSpellingIssues(before, 200),
            ...findElementarySpellingIssues(before, 200),
            ...findClassSpellingIssues(before, commonEntries, 200)
        ];
        for (const span of spans) {
            edits += 1;
            if (found.some((issue) => issue.start < span.e && issue.end > span.s)) caught += 1;
            else missed.push(`${span.wrong} → ${span.right}`);
        }
        for (const issue of found) {
            issues += 1;
            if (spans.some((span) => issue.start < span.e && issue.end > span.s)) hitIssues += 1;
            else falseAlarms.push(`${issue.text}→${issue.right}`);
        }
    }
    return { edits, caught, issues, hitIssues, missed, falseAlarms };
};

const main = () => {
    const docs = psqlJson("select coalesce(json_agg(json_build_object('base_content', base_content, 'edited_content', edited_content)), '[]') from student_post_teacher_edits;");
    const common = psqlJson("select coalesce(json_agg(json_build_object('id', id, 'wrong_expression', wrong_expression, 'correct_expression', correct_expression, 'label', label)), '[]') from spelling_learning_entries where scope='common' and status='approved';");
    const score = scoreDocuments(docs, common);
    const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '-');
    console.log(`선생님 교정 ${docs.length}회차 · 맞춤법·띄어쓰기 수정 ${score.edits}곳`);
    console.log(`잡아낸 비율 ${pct(score.caught, score.edits)} (${score.caught}/${score.edits}) · 맞힌 비율 ${pct(score.hitIssues, score.issues)} (${score.hitIssues}/${score.issues})`);
    const out = arg('--out', '');
    if (out) {
        const count = (list) => [...list.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map())].sort((x, y) => y[1] - x[1]);
        writeFileSync(out, JSON.stringify({ ...score, missed: count(score.missed), falseAlarms: count(score.falseAlarms) }, null, 1));
    }
};

if (process.argv[1]?.endsWith('spelling-scorecard.mjs')) main();
