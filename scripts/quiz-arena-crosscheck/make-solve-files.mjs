// 아직 풀지 않은 기본 세트 문제만 가려, 정답표 없는 풀이 파일(4개)을 만든다.
// 사용: node scripts/quiz-arena-crosscheck/make-solve-files.mjs <작업 폴더> <라운드>
// 작업 폴더는 저장소 밖(예: 스크래치패드)을 쓴다 — 풀이 결과·통과 기록이 쌓인다. README.md 참고.
import fs from 'node:fs';
const ROOT = new URL('../../', import.meta.url).pathname;
const D = process.argv[2], round = process.argv[3];
const file = JSON.parse(fs.readFileSync(`${ROOT}public/quiz-arena/official-sets-v1.json`, 'utf8'));
const donePath = `${D}/done.json`;
const done = new Set(fs.existsSync(donePath) ? JSON.parse(fs.readFileSync(donePath, 'utf8')) : []);
const keyOf = (q) => `${q.kind}|${q.text}|${(q.choices ?? []).join('/')}|${q.answer}`;
const list = [];
for (const set of file.sets) set.questions.forEach((q, i) => { if (!done.has(keyOf(q))) list.push({ id: `q${String(list.length + 1).padStart(4, '0')}`, set: set.id, no: i + 1, key: keyOf(q), q }); });
fs.writeFileSync(`${D}/list-r${round}.json`, JSON.stringify(list.map(({ id, set, no, key, q }) => ({ id, set, no, key, answer: q.answer, kind: q.kind }))));
const label = (kind, i) => (kind === 'ox' ? ['O', 'X'][i] : kind === 'c2' ? ['A', 'B'][i] : ['①', '②', '③', '④'][i]);
const lines = list.map(({ id, q }) => q.kind === 'ox' ? `${id}|O/X|${q.text}` : `${id}|${q.kind === 'c2' ? '2지선다' : '4지선다'}|${q.text}|${q.choices.map((c, i) => `${label(q.kind, i)} ${c}`).join('  ')}`);
const head = `[지시] 파일 시스템을 열지 말고 아래 내용만 보고 답하세요.
초등학교 3~6학년 어휘·맞춤법 퀴즈를 직접 풀어 주세요. 정답표는 없습니다. 각 줄은 \`번호|형식|문제|보기\` 입니다.
- O/X: 문장(또는 낱말-뜻 짝)이 맞으면 O, 틀리면 X. 맞춤법 문장은 한글 맞춤법·표준어 규정(국립국어원) 기준으로 바르게 쓰였으면 O.
- 2지선다: A 또는 B. 4지선다: ①~④ 중 하나(‘맞춤법이 틀린 것은?’은 틀린 것을 고르세요).
답은 한 줄에 \`번호=답\` 형식(예: q0001=B, q0002=①, q0003=O)으로, 모든 번호에 대해 적으세요.
정답이 둘 이상으로 읽히거나 문제·보기가 애매하거나 오류가 있으면 \`번호=?|이유\` 로 쓰고(이유는 한 줄), 그래도 고른다면 \`번호=B?|이유\` 처럼 답 뒤에 ?를 붙이세요.

`;
const per = Math.ceil(list.length / 4);
for (let c = 0; c < 4; c += 1) fs.writeFileSync(`${D}/r${round}-part${c}.txt`, head + lines.slice(c * per, (c + 1) * per).join('\n'));
console.log(`라운드 ${round}: 문제 ${list.length}개 → 4파일`, [0, 1, 2, 3].map((c) => fs.statSync(`${D}/r${round}-part${c}.txt`).size).join(','));
