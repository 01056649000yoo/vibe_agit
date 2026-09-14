import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const field = readFileSync('src/components/common/SchoolSearchField.jsx', 'utf8');
const setup = readFileSync('src/components/teacher/TeacherProfileSetup.jsx', 'utf8');
const analyzer = readFileSync('scripts/analyze-usage.mjs', 'utf8');
// schoolApi 는 브라우저 모듈(supabase)을 끌어와 여기서 못 부른다 — 규칙이 적힌 자리를 본다.
const schoolApi = readFileSync('src/utils/schoolApi.js', 'utf8');

test('학교는 목록에서 고른 것만 저장한다', () => {
    /*
     * 2026-09-14 결정: 이름과 학교는 정확해야 한다. 문제가 생겼을 때 누구인지 알 수 있어야 한다.
     *
     * 같은 날 "못 찾으면 직접 적기" 를 잠깐 열었다가 되돌렸다. 확인해 보니 검색은 나이스에서
     * 100곳을 받아 초등학교만 거른 뒤 20곳까지 보여 주고 정확히 같은 이름을 맨 앞에 올린다 —
     * **정상적인 초등학교는 거의 다 나온다.** 직접 적게 하면 얻는 것보다 잃는 것이 크다.
     */
    assert.ok(!field.includes('allowManualEntry'), '직접 입력 통로가 아직 남아 있습니다.');
    assert.ok(!field.includes('그대로 쓰기'), '직접 입력 단추가 아직 남아 있습니다.');
    assert.ok(!setup.includes('allowManualEntry'), '가입 화면에 직접 입력이 열려 있습니다.');
    // 학교 코드까지 있어야 통과한다. 이름만 채워진 값으로는 넘어가지 못한다.
    assert.match(setup, /!selectedSchool\?\.schoolCode/);
});

test('확인된 학교에만 확인 도장을 찍는다', () => {
    // 코드가 없는데 도장을 찍으면 "확인된 학교" 를 세는 모든 곳이 틀린다.
    assert.match(schoolApi, /school_verified_at: school\?\.schoolCode \? new Date\(\)\.toISOString\(\) : null/);
});

test('이름은 모양이라도 본다', () => {
    /*
     * 이름은 확인할 길이 없으니 최소한만 막는다 — 한 글자이거나 숫자가 섞인 것은
     * 실수이거나 아무렇게나 적은 것이다.
     */
    assert.match(setup, /cleanName\.length < 2 \|\| \/\[0-9\]\/u\.test\(cleanName\)/);
    assert.match(setup, /p_full_name: cleanName/);
    assert.match(setup, /name: cleanName/);
});

test('학교 확인 비율을 분석에서 본다', () => {
    // 확인되지 않은 학교가 새로 생기면 어딘가 구멍이 난 것이다.
    assert.match(analyzer, /school_verified_at IS NULL\) manual/);
    assert.match(analyzer, /date_trunc\('week', created_at\)/);
});
