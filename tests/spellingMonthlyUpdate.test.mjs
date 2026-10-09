import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    GATES, MONTHLY_LIMIT, cleanPiece, evidenceProblem, explanationFor, isCleanPair, mergeEvidence, monthRange
} from '../scripts/spelling-monthly-update.mjs';

test('한 달 업데이트: 지난달(서울)을 모은다 — 1월 1일에 돌면 지난해 12월', () => {
    assert.equal(monthRange(new Date('2026-11-01T05:40:00+09:00'), '', false).runMonth, '2026-10-01');
    const january = monthRange(new Date('2027-01-01T05:40:00+09:00'), '', false);
    assert.deepEqual([january.from, january.to], ['2026-12-01', '2027-01-01']);
    assert.equal(monthRange(new Date(), '2026-10', false).to, '2026-11-01');
    assert.equal(monthRange(new Date(), '', true).runMonth, null);
});

test('어절 조각 정리와 깨끗한 짝만', () => {
    assert.equal(cleanPiece('맛있었다.'), '맛있었다');
    assert.ok(isCleanPair('게속', '계속'));
    assert.ok(isCleanPair('때문 입니다', '때문입니다'));
    assert.ok(!isCleanPair('계속', '계속'));
    assert.ok(!isCleanPair('a', 'b'));
    assert.ok(!isCleanPair('가', '나'), '한 글자는 이름·부스러기일 수 있다');
    assert.ok(!isCleanPair('하나 둘 셋', '하나둘셋'), '3어절 이상은 문장 고치기');
});

test('증거 관문: 2개 학급·3번 이상, 회색 점선 고르기는 받아들인 비율 80% 이상', () => {
    const [item] = mergeEvidence([
        { wrong: '게속', right: '계속', source: 'gray_applied', applied: 3, kept: 0, classes: 2 },
        { wrong: '게속.', right: '계속', source: 'teacher_edit', support: 1, classIds: ['a'] }
    ]);
    assert.equal(item.support, 4);
    assert.equal(evidenceProblem(item), null);
    const [oneClass] = mergeEvidence([{ wrong: '추석때', right: '추석 때', source: 'gray_fixed', support: 9, classes: 1 }]);
    assert.match(evidenceProblem(oneClass), /학급 1곳뿐/);
    const [mostlyKept] = mergeEvidence([{ wrong: '본적', right: '본 적', source: 'gray_applied', applied: 3, kept: 2, classes: 3 }]);
    assert.match(evidenceProblem(mostlyKept), /80%/);
    assert.equal(GATES.minClasses, 2);
    assert.equal(MONTHLY_LIMIT, 50);
});

test('설명은 유료 AI 없이 틀로', () => {
    assert.equal(explanationFor('방학때', '방학 때'), '띄어쓰기를 바르게 하면 ‘방학 때’예요.');
    assert.equal(explanationFor('게속', '계속'), '‘게속’ 대신 ‘계속’라고 써요.');
});

test('맞는 낱말을 잘못 고른 실수·바른 낱말 속 밑줄은 자동으로 넣지 않고 보류한다', async () => {
    const source = await readFile('scripts/spelling-monthly-update.mjs', 'utf8');
    assert.match(source, /틀린 꼴도 맞는 낱말이라 문맥이 필요/);
    assert.match(source, /바른 낱말 속에 들어감/);
    assert.match(source, /source_kind[\s\S]{0,200}'monthly'/);
    assert.doesNotMatch(source, /openai|OPENAI_API_KEY|vibe-ai/i, '유료 AI 를 쓰지 않는다');
    const migration = await readFile('supabase/migrations/20261387_spelling_monthly_update.sql', 'utf8');
    assert.match(migration, /REVOKE ALL ON public\.spelling_monthly_candidates FROM PUBLIC, anon, authenticated/);
    assert.doesNotMatch(migration, /student_id|class_id UUID/, '학생·학급 식별자를 남기지 않는다');
    const plist = await readFile('ops/launchd/com.agit.spelling-monthly-update.plist', 'utf8');
    assert.match(plist, /<key>Day<\/key>\s*<integer>1<\/integer>/);
});

test('자동 게시 SQL 은 공통 자료의 필수 칸(만든 사람·승인자)을 채운다(2026-10-09 시뮬레이션에서 찾음)', async () => {
    const { publishEntrySql } = await import('../scripts/spelling-monthly-update.mjs');
    const sql = publishEntrySql({ wrong: '게속', right: '계속' }, '00000000-0000-0000-0000-000000000001');
    assert.match(sql, /created_by, approved_by, approved_at\)/);
    assert.match(sql, /'monthly', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', now\(\)/);
    assert.match(sql, /'‘게속’ 대신 ‘계속’라고 써요\.'/);
});
