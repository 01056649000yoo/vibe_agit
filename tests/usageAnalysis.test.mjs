import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const script = readFileSync('scripts/analyze-usage.mjs', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

test('사용자 분석은 읽기만 한다', () => {
    /*
     * 운영 DB 를 그대로 본다. 분석하다 한 줄 고치면 되돌릴 수가 없다 —
     * 쓰는 문장이 섞이면 부르기 전에 막는다. DB 의 쓰기는 마이그레이션으로만 한다.
     */
    assert.match(script, /\(insert\|update\|delete\|drop\|alter\|truncate\|grant\|revoke\|create\)/);
    assert.match(script, /이 도구는 읽기만 합니다/);
    // 실제 질의문에 쓰는 문장이 없어야 한다.
    const statements = script.match(/SELECT[\s\S]*?`/g) || [];
    assert.ok(statements.length > 0, '질의문을 하나도 못 찾았습니다 — 검사가 헛돕니다.');
    statements.forEach((sql) => assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/));
});

test('사람을 식별하는 값은 내보내지 않는다', () => {
    /*
     * 결과를 그대로 붙여도 개인정보가 새지 않아야 한다. 이름·메일·학교·글 내용은 고르지 않는다.
     * 메일은 **가입 깔때기에서 사람을 세는 데만** 쓰고(학생 계정과 가르기 위해) 값을 내보내지 않는다.
     */
    const forbidden = [/SELECT[^`]*\bp\.name\b/i, /SELECT[^`]*\bt\.name\b/i, /SELECT[^`]*\bschool_name\b/i,
        /SELECT[^`]*\bcontent\b/i, /SELECT[^`]*\bu\.email\b(?![^`]*IS NULL)/i];
    forbidden.forEach((pattern) => assert.doesNotMatch(script, pattern, `${pattern} 가 결과에 나옵니다.`));
    assert.match(script, /사람을 식별하는 값은 나오지 않습니다/);
});

test('한 번에 부르는 명령으로 묶여 있다', () => {
    // 물어볼 때마다 SQL 을 새로 짜면 기준이 달라져 지난번 수와 견줄 수가 없다.
    assert.equal(packageJson.scripts['analyze:usage'], 'node scripts/analyze-usage.mjs');
    ['한눈에', '가입 깔때기', '동행 모드'].forEach((title) => assert.ok(script.includes(title), `${title} 항목이 없습니다.`));
});

test('한 항목이 실패해도 나머지는 나온다', () => {
    // 표 하나가 바뀌어 질의가 깨졌다고 분석 전체가 멎으면, 급할 때 아무것도 못 본다.
    assert.match(script, /catch \(error\) \{\s*report\.push\(`- \(이 항목을 읽지 못했습니다/);
});
