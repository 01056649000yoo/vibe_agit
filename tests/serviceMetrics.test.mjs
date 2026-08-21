/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

/*
 * 2026-08-21 신설. 지금까지는 "얼마나 쓰이는지" 를 알려면 표를 직접 조회해야 했고,
 * **장애가 나도 선생님이 알려 주셔야** 알았다(8/18 디스크 포화로 앱이 내려갔을 때도 뒤늦게 알았다).
 */
test('서비스 현황은 RPC 한 번으로 읽고 폴링하지 않는다', async () => {
    const panel = await read('src/components/admin/AdminServicePanel.jsx');

    assert.ok(panel.includes("supabase.rpc('admin_get_service_overview_v1'"));
    // 화면마다 집계 대신 미리 계산된 한 덩어리를 받는다(이 저장소의 성능 계약).
    assert.equal((panel.match(/supabase\.rpc\(/g) || []).length, 1, 'RPC 를 두 번 이상 부른다');
    assert.doesNotMatch(panel, /setInterval|postgres_changes|\.channel\(/, '폴링이나 구독이 들어갔다');
});

test('접속·AI 호출은 원본 표에서 세고 하루 한 줄에 베끼지 않는다', async () => {
    const migration = await read('supabase/migrations/20261150_service_metrics_and_alerts.sql');

    // 두 벌로 두면 값이 어긋난다. 집계는 원본에서 한다.
    assert.match(migration, /FROM public\.ai_request_events/);
    assert.match(migration, /FROM public\.profiles/);
    assert.match(migration, /FROM public\.students/);
    // 하루 한 줄 표에는 "지금 재야만 아는 것" 만 둔다.
    // ⚠️ 파일 전체를 훑으면 아래 RPC 의 ai_calls 에 걸린다. 표 정의 블록만 잘라서 본다.
    const tableStart = migration.indexOf('CREATE TABLE IF NOT EXISTS public.system_daily_metrics');
    assert.ok(tableStart >= 0, '하루 한 줄 표 정의를 찾지 못했다');
    const tableBlock = migration.slice(tableStart, migration.indexOf(');', tableStart));
    for (const copied of ['ai_calls', 'teacher', 'student', 'posts']) {
        assert.ok(!tableBlock.includes(copied), `'${copied}' 를 하루 한 줄 표에 베껴 두면 원본과 어긋난다`);
    }
});

/*
 * 이 기능에서 가장 중요한 계약.
 * 5분마다 도는데 상태가 그대로면 메일을 보내지 않아야 한다. 앱이 30분 죽으면 6통이 오고,
 * 그러면 곧 메일을 안 읽게 되어 알림이 있으나 마나가 된다.
 */
test('알림은 상태가 바뀔 때만 나가고, 그 판단은 DB 가 쥔다', async () => {
    const [migration, script] = await Promise.all([
        read('supabase/migrations/20261150_service_metrics_and_alerts.sql'),
        read('scripts/check-service-health.sh')
    ]);

    // 열린 알림은 종류마다 하나뿐 — 중복 발송의 마지막 방어선.
    assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS system_alert_events_open_key_idx[\s\S]*?WHERE status = 'open'/);
    // 새로 생길 때와 풀릴 때만 true.
    assert.match(migration, /v_should_notify BOOLEAN := FALSE/);
    assert.match(migration, /v_event := 'opened'/);
    assert.match(migration, /v_event := 'resolved'/);

    // 스크립트는 스스로 판단하지 않고 DB 가 준 답을 따른다.
    assert.match(script, /record_system_alert_v1/);
    assert.match(script, /should_notify/);
});

test('알림 메일은 시크릿이나 원문 로그를 담지 않는다', async () => {
    const script = await read('scripts/check-service-health.sh');

    // 열쇠는 파일에서 읽고 값은 코드에 없다.
    assert.match(script, /grep -m1 '\^RESEND_API_KEY='/);
    assert.doesNotMatch(script, /re_[A-Za-z0-9]{10,}/, '메일 열쇠가 코드에 박혀 있다');
    // 받는 주소는 바꿀 수 있게 환경변수로 열어 둔다.
    assert.match(script, /ALERT_TO="\$\{ALERT_TO:-/);
});

test('기록 RPC 는 화면이 아니라 호스트 스크립트만 쓴다', async () => {
    const migration = await read('supabase/migrations/20261150_service_metrics_and_alerts.sql');

    for (const fn of ['record_system_daily_metric_v1', 'record_system_alert_v1']) {
        // REVOKE 줄을 잘라 그 안에 세 대상이 다 있는지 본다(정규식을 만들지 않는다).
        const start = migration.indexOf(`REVOKE ALL ON FUNCTION public.${fn}`);
        assert.ok(start >= 0, `${fn} 의 REVOKE 가 아예 없다`);
        const line = migration.slice(start, migration.indexOf(';', start));
        for (const who of ['PUBLIC', 'anon', 'authenticated']) {
            assert.ok(line.includes(who), `${fn} 이 ${who} 에게 열려 있다`);
        }
    }
    // 오래된 기록은 스스로 버린다. 두면 표가 계속 커진다.
    assert.match(migration, /DELETE FROM public\.system_daily_metrics WHERE metric_day < CURRENT_DATE - 730/);
    assert.match(migration, /DELETE FROM public\.system_alert_events[\s\S]*?INTERVAL '180 days'/);
});

test('지표 기록은 컨테이너 재시작으로 엉뚱한 값이 들어가지 않는다', async () => {
    const script = await read('scripts/record-system-metrics.sh');

    // 누적값이 줄어들면(재시작) 그날 트래픽은 비워 둔다. 큰 음수/양수가 들어가면 경향이 망가진다.
    assert.match(script, /RX_DAY="NULL"/);
    assert.match(script, /\[ "\$RX_NOW" -ge "\$\{PREV_RX:-0\}" \]/);
});
