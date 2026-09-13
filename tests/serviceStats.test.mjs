import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SERVICE_STAT_ITEMS } from '../src/constants/serviceStats.js';

const read = (file) => readFileSync(file, 'utf8');
// 세는 기준·간격의 현재 원본은 마지막으로 함수를 다시 쓴 장이다. 옛 장을 보면 이미 지난 규칙을 검사하게 된다.
const migration = read('supabase/migrations/20261284_service_stats_live_refresh.sql');
const firstMigration = read('supabase/migrations/20261282_service_stats_snapshot.sql');
const strip = read('src/components/layout/LandingServiceStats.jsx');
const landing = read('src/components/layout/LandingPage.jsx');
const allowlist = JSON.parse(read('ops/rpc-surface-allowlist.json'));

test('비로그인에게 여는 것은 총계뿐이고 표는 닫아 둔다', () => {
    /*
     * 로그인 화면은 **누구나, 봇까지** 여는 화면이다. 여기서 표를 직접 열면 그 표의
     * 모든 열이 공개된다. 함수 하나만 열고 그 함수는 정수 넷만 돌려준다.
     */
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_service_stats_v1\(\) TO anon, authenticated/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_service_stats_v1\(\) FROM PUBLIC/);
    assert.match(firstMigration, /ALTER TABLE public\.service_stats ENABLE ROW LEVEL SECURITY/);
    assert.match(firstMigration, /REVOKE ALL ON TABLE public\.service_stats FROM anon, authenticated/);

    // 돌려주는 열쇠는 넷뿐이다. 이름·학교명이 섞여 나갈 자리가 없다.
    const returned = [...migration.matchAll(/'(teachers|classes|students|posts)',/g)].map((match) => match[1]);
    assert.deepEqual([...new Set(returned)].sort(), ['classes', 'posts', 'students', 'teachers']);
});

test('anon 에 연 이유가 확인할 수 있게 적혀 있다', () => {
    // 이 목록의 값어치는 통째로 "적힌 이유는 믿을 수 있다"에 걸려 있다.
    const entry = (allowlist.anonExecute || []).find((item) => item.name === 'get_service_stats_v1');
    assert.ok(entry, 'get_service_stats_v1 이 anonExecute 목록에 없습니다.');
    assert.ok(entry.reason.includes('LandingServiceStats.jsx'), '부르는 곳을 이름으로 적어야 참·거짓을 가릴 수 있습니다.');
    assert.match(entry.reasonCheckedAt, /^\d{4}-\d{2}-\d{2}$/);
});

test('방문 한 번에 네 표를 세지 않는다', () => {
    /*
     * 로그인 화면은 방문이 많다. 그때그때 count(*) 를 돌리면 조회가 방문 수만큼 늘고,
     * 아무나 늘릴 수 있다. 한 시간에 한 번만 세고 나머지는 적어 둔 값을 읽는다.
     */
    const interval = migration.match(/computed_at < now\(\) - INTERVAL '(\d+) seconds'/);
    assert.ok(interval, '다시 세는 간격을 찾지 못했습니다.');
    // 0초면 방문마다 세는 것과 같아 봇이 조회를 마음대로 늘릴 수 있다.
    assert.ok(Number(interval[1]) >= 30, `간격이 ${interval[1]}초입니다. 30초 이상 두세요.`);
    // 너무 길면 가입·학급 생성이 첫 화면에 한참 반영되지 않는다(2026-09-13 제보).
    assert.ok(Number(interval[1]) <= 300, `간격이 ${interval[1]}초입니다. 5분 이내로 두세요.`);
    // 여럿이 동시에 들이닥쳐도 한 세션만 센다.
    assert.match(migration, /pg_try_advisory_xact_lock/);
});

test('화면 문구와 DB 가 세는 기준이 같다', () => {
    /*
     * 문구가 기준보다 넓으면 거짓말이 된다. 둘을 한꺼번에 본다.
     *
     * 같은 계산이 마이그레이션에 **두 번** 나온다(함수 안, 그리고 처음 한 번 채우는 UPDATE).
     * 한 곳만 보면 다른 한 곳이 조용히 달라진다 — 실제로 이 검사를 일부러 깨뜨려 보다가
     * 한 곳만 고쳤는데 통과해서 알았다. 그래서 **모든 곳**이 같은 기준인지 센다.
     */
    assert.deepEqual(SERVICE_STAT_ITEMS.map((item) => item.key), ['teachers', 'classes', 'students', 'posts']);

    const everyCountOf = (column, table) => {
        const found = [...migration.matchAll(
            new RegExp(`${column}\\s*= \\(SELECT count\\(\\*\\) FROM public\\.${table}([\\s\\S]*?)\\)\\s*,?\\n`, 'g')
        )];
        assert.equal(found.length, 1, `${column} 계산이 한 곳이어야 하는데 ${found.length}곳입니다.`);
        return found.map((match) => match[1]);
    };

    // 승인 취소된 교사는 "함께하는 선생님" 이 아니다.
    everyCountOf('teacher_count', 'profiles').forEach((where) => {
        assert.match(where, /WHERE role = 'TEACHER' AND is_approved AND approval_revoked_at IS NULL/);
    });
    // 지운 학급·학생은 세지 않는다.
    everyCountOf('class_count', 'classes').forEach((where) => assert.match(where, /WHERE deleted_at IS NULL/));
    everyCountOf('student_count', 'students').forEach((where) => assert.match(where, /WHERE deleted_at IS NULL/));
    // "낸 글" 이라고 적었으므로 쓰다 만 초안은 빼야 한다.
    everyCountOf('post_count', 'student_posts').forEach((where) => assert.match(where, /WHERE is_submitted/));
    assert.ok(SERVICE_STAT_ITEMS.find((item) => item.key === 'posts').label.includes('낸 글'));
});

test('숫자를 못 읽어도 로그인 화면은 그대로 뜬다', () => {
    // 현황은 곁들이는 정보다. 이것 때문에 로그인이 막히면 안 된다.
    assert.match(strip, /\.catch\(\(\) => \{\}\)/);
    assert.match(strip, /if \(!stats\) return null;/);
});

test('현황 줄은 로그인 버튼 아래에 둔다', () => {
    /*
     * 숫자가 늦게 도착하면서 위에 끼어들면 로그인 버튼이 아래로 밀려, 누르려던 손이
     * 빗나간다. 들어가는 자리를 검사로 고정한다.
     */
    assert.ok(landing.indexOf('landing-entry') < landing.indexOf('<LandingServiceStats />'),
        '현황 줄이 로그인 버튼보다 위에 있습니다.');
});
