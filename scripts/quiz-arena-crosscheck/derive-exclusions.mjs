// 풀이에서 어긋난·애매하다고 한 문제에서 제외 자료·혼동 쌍·나쁜 표기를 뽑아 제외 목록(scripts/quiz-arena-official-exclusions.json)에 더하고,
// 통과한 문제는 작업 폴더의 done.json 에 적는다. 같은 라운드에 두 번 돌리지 않는다(제외 목록이 바뀌어 번호가 어긋난다).
// 사용: node scripts/quiz-arena-crosscheck/derive-exclusions.mjs <작업 폴더> <라운드>
import fs from 'node:fs';
import { buildSpellingQuizPool, spellingSourcesFromCatalog } from '../../supabase/functions/spelling-claw/spellingQuizBuilder.js';
import { buildOfficialSets } from '../../src/modules/game/quiz-arena/officialSets.js';
const D = process.argv[2], round = process.argv[3], R = new URL('../../', import.meta.url).pathname;
const rj = (p) => JSON.parse(fs.readFileSync(R + p, 'utf8'));
const vocabByGrade = Object.fromEntries([3, 4, 5, 6].map((g) => [g, rj(`public/data/grade${g}_vocab.json`)]));
const pool = buildSpellingQuizPool(spellingSourcesFromCatalog(rj('public/spelling/elementary-lookup-v1.json'), rj('public/spelling/elementary-detection-v1.json')));
const lookupEntries = rj('public/spelling/elementary-lookup-v1.json').lookupEntries;
const exclPath = `${R}scripts/quiz-arena-official-exclusions.json`;
const excl = rj('scripts/quiz-arena-official-exclusions.json');
excl.confusable ??= []; excl.badForms ??= [];
const sets = buildOfficialSets({ vocabByGrade, spellingPool: pool, lookupEntries, grades: rj('scripts/quiz-arena-spelling-grade.json'), exclusions: excl });
const byId = new Map(sets.map((s) => [s.id, s]));
const fileSets = new Map(rj('public/quiz-arena/official-sets-v1.json').sets.map((s) => [s.id, s]));
const rows = JSON.parse(fs.readFileSync(`${D}/cmp-r${round}.json`, 'utf8'));
const solved = new Map(JSON.parse(fs.readFileSync(`${D}/list-r${round}.json`, 'utf8')).map((item) => [item.id, item.key]));
const keyOf = (q) => `${q.kind}|${q.text}|${(q.choices ?? []).join('/')}|${q.answer}`;
const donePath = `${D}/done.json`;
const done = new Set(fs.existsSync(donePath) ? JSON.parse(fs.readFileSync(donePath, 'utf8')) : []);
const circled = { '①': 0, '②': 1, '③': 2, '④': 3 };
const add = { vocab: new Set(excl.vocab), spelling: new Set(excl.spelling), confusable: new Set(excl.confusable.map((p) => p.join('|'))), badForms: new Set(excl.badForms) };
let bad = 0, pass = 0;
// 풀이한 뒤 세트가 다시 만들어져도 맞도록 번호(세트·순서)가 아니라 **문제 내용(key)** 으로 지금 세트의 문제를 찾는다
const byKey = new Map();
for (const set of sets) set.questions.forEach((question) => byKey.set(keyOf(question), { set, question }));
for (const r of rows) {
  const solvedKey = solved.get(r.id);
  const found = byKey.get(solvedKey);
  if (!found) { if (!r.wrong.length && !r.unsure.length) done.add(solvedKey); continue; } // 지금 세트에 없는 문제도 통과 기록은 남긴다(다시 나오면 재사용)
  const { set, question: q } = found;
  const flagged = r.wrong.length || r.unsure.length;
  if (!flagged) { done.add(solved.get(r.id)); pass += 1; continue; }
  bad += 1;
  const reasons = [r.gpt, r.gem, r.claude].filter(Boolean).map((v) => v.why || '').join(' ');
  const labels = q.kind === 'c4' ? q.choices : q.kind === 'c2' ? q.choices : [];
  const mentioned = new Set();
  for (const m of reasons.matchAll(/[①②③④]/g)) { const i = circled[m[0]]; if (labels[i] !== undefined && i !== q.answer) mentioned.add(labels[i]); }
  for (const c of labels) if (c !== labels[q.answer] && reasons.includes(c)) mentioned.add(c);
  const meta = q.meta;
  if (set.kind === 'vocab') {
    add.vocab.add(`g${set.grade}:${meta.word}`);
    if (q.kind !== 'ox') mentioned.forEach((m) => add.confusable.add([meta.word, m].sort().join('|')));
  } else {
    add.spelling.add(meta.entry);
    if (q.kind === 'c4') mentioned.forEach((m) => add.badForms.add(m));
  }
}
excl.vocab = [...add.vocab].sort(); excl.spelling = [...add.spelling].sort();
excl.confusable = [...add.confusable].sort().map((p) => p.split('|')); excl.badForms = [...add.badForms].sort();
fs.writeFileSync(exclPath, JSON.stringify(excl, null, 1));
fs.writeFileSync(donePath, JSON.stringify([...done]));
console.log(`통과 ${pass} · 지적 ${bad} → 제외 어휘 ${excl.vocab.length}, 맞춤법 ${excl.spelling.length}, 혼동 쌍 ${excl.confusable.length}, 나쁜 표기 ${excl.badForms.length}`);
