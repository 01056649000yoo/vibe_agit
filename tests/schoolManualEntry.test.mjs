import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const field = readFileSync('src/components/common/SchoolSearchField.jsx', 'utf8');
const setup = readFileSync('src/components/teacher/TeacherProfileSetup.jsx', 'utf8');
const mealChange = readFileSync('src/modules/tool/meal-board/SchoolChangeModal.jsx', 'utf8');
const analyzer = readFileSync('scripts/analyze-usage.mjs', 'utf8');
// schoolApi 는 브라우저 모듈(supabase)을 끌어와 여기서 못 부른다 — 규칙이 적힌 자리를 본다.
const schoolApi = readFileSync('src/utils/schoolApi.js', 'utf8');

test('학교를 못 찾아도 가입을 끝낼 수 있다', () => {
    /*
     * 2026-09-14 분석: 최근 30일에 계정을 만든 655명 중 143명이 가입 단계를 넘지 못했다.
     * 학교는 필수인데 **목록에서 고르는 길 하나뿐**이라, 나이스에 이름이 조금 다르거나
     * 새로 생긴 학교면 가입 자체가 끝나지 않는다.
     */
    assert.match(field, /allowManualEntry = false/);
    assert.match(field, /그대로 쓰기/);
    assert.match(field, /choose\(\{ schoolName: String\(value\)\.trim\(\), manual: true \}\)/);
    assert.match(setup, /allowManualEntry/);
});

test('직접 적은 학교는 확인된 학교와 구별해 저장한다', () => {
    /*
     * 이름만 받은 학교에 `school_verified_at` 을 찍으면, 나중에 "확인된 학교" 를 세는 모든
     * 곳이 틀린다. 코드가 있을 때만 찍는다 — 그 값이 곧 이 길을 얼마나 쓰는지의 답이다.
     */
    assert.match(schoolApi, /school_code: school\?\.schoolCode \|\| null/);
    assert.match(schoolApi, /school_verified_at: school\?\.schoolCode \? new Date\(\)\.toISOString\(\) : null/);
    // 화면에서도 직접 적었다고 말해 준다 — 모르고 지나가면 급식이 안 될 때 원인을 못 찾는다.
    assert.match(field, /직접 적은 학교 이름으로 저장됩니다/);
});

test('학교 코드가 있어야 되는 기능에는 이 길을 열지 않는다', () => {
    // 급식은 나이스 코드로 부른다. 거기서 이름만 받으면 "왜 급식이 안 나오죠" 로 돌아온다.
    assert.ok(!mealChange.includes('allowManualEntry'), '급식 학교 바꾸기에 직접 입력이 열려 있습니다.');
});

test('얼마나 쓰이는지 분석에서 센다', () => {
    // 많으면 검색이 문제고, 없으면 막힌 원인은 다른 데 있다. 세지 않으면 다음 판단을 못 한다.
    assert.match(analyzer, /이름을 직접 적은 교사/);
    // 확인 도장이 없는 사람 = 직접 적은 사람이다. 주차별로 본다 —
    // 통째로 세면 규칙이 바뀐 때를 넘어 섞여 지금과 무관한 수가 나온다.
    assert.match(analyzer, /school_verified_at IS NULL\) manual/);
    assert.match(analyzer, /date_trunc\('week', created_at\)/);
});
