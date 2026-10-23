// 정답표와 풀이(GPT·제미나이·클로드)를 비교해 틀린 문제·애매하다고 한 문제를 센다.
// 사용: node scripts/quiz-arena-crosscheck/compare-solves.mjs <작업 폴더> <라운드>
import fs from 'node:fs';
const D = process.argv[2], round = process.argv[3];
const list = JSON.parse(fs.readFileSync(`${D}/list-r${round}.json`, 'utf8'));
const idx = { O: 0, X: 1, A: 0, B: 1, '①': 0, '②': 1, '③': 2, '④': 3 };
const parse = (files) => {
  const out = new Map();
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = l.match(/^\s*(q\d{4})\s*=\s*([OXAB①②③④?]?)(\?)?\s*(?:\|\s*(.*))?$/);
      if (!m) continue;
      const [, id, a, q, why] = m;
      out.set(id, { ans: a === '' || a === '?' ? null : idx[a], unsure: Boolean(q) || a === '?' || a === '', why: why ?? '' });
    }
  }
  return out;
};
const gpt = parse([0, 1, 2, 3].map((c) => `${D}/r${round}-gpt${c}.txt`));
const gem = parse([0, 1, 2, 3].map((c) => `${D}/r${round}-gem${c}.txt`));
const cl = parse([`${D}/claude-r${round}.txt`, ...(fs.existsSync(`${D}/claude-r${round}-b.txt`) ? [`${D}/claude-r${round}-b.txt`] : [])]);
const rows = [];
const stat = { total: list.length, gptMissing: 0, gemMissing: 0, allAgree: 0, someWrong: 0, someUnsure: 0, claudeSolved: 0 };
for (const item of list) {
  const r = { id: item.id, set: item.set, no: item.no, key: item.answer, kind: item.kind, gpt: gpt.get(item.id), gem: gem.get(item.id), claude: cl.get(item.id) };
  if (!r.gpt) stat.gptMissing += 1; if (!r.gem) stat.gemMissing += 1; if (r.claude) stat.claudeSolved += 1;
  const solvers = [['GPT', r.gpt], ['제미나이', r.gem], ['클로드', r.claude]].filter(([, v]) => v);
  r.wrong = solvers.filter(([, v]) => v.ans !== null && v.ans !== item.answer).map(([w]) => w);
  r.unsure = solvers.filter(([, v]) => v.unsure).map(([w]) => w);
  if (!r.wrong.length && !r.unsure.length && solvers.length >= 2) stat.allAgree += 1;
  if (r.wrong.length) stat.someWrong += 1;
  if (r.unsure.length) stat.someUnsure += 1;
  rows.push(r);
}
fs.writeFileSync(`${D}/cmp-r${round}.json`, JSON.stringify(rows));
console.log(JSON.stringify(stat));
const by = {}; rows.forEach((r) => { const k = `틀림:${r.wrong.join('+') || '-'}`; by[k] = (by[k] ?? 0) + 1; });
console.log(JSON.stringify(by));
