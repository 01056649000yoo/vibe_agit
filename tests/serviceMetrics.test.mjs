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

test('맥미니 상태는 한 줄로 기록하되 외부 메일 판단은 하지 않는다', async () => {
    const [baseMigration, policyMigration, script] = await Promise.all([
        read('supabase/migrations/20261150_service_metrics_and_alerts.sql'),
        read('supabase/migrations/20261152_remove_service_email_notifications.sql'),
        read('scripts/check-service-health.sh')
    ]);

    // 열린 상태는 종류마다 하나뿐이고 5분 점검은 같은 줄의 시각만 갱신한다.
    assert.match(baseMigration, /CREATE UNIQUE INDEX IF NOT EXISTS system_alert_events_open_key_idx[\s\S]*?WHERE status = 'open'/);
    assert.match(policyMigration, /v_event TEXT := 'unchanged'/);
    assert.match(policyMigration, /v_event := 'opened'/);
    assert.match(policyMigration, /v_event := 'resolved'/);
    assert.match(script, /record_system_alert_v1/);

    const functionStart = policyMigration.indexOf('CREATE OR REPLACE FUNCTION public.record_system_alert_v1');
    const functionEnd = policyMigration.indexOf('$$;', functionStart);
    const functionBody = policyMigration.slice(functionStart, functionEnd);
    assert.doesNotMatch(functionBody, /should_notify|notified_at/, '상태 기록 RPC에 메일 판단 흔적이 남았다');
    assert.doesNotMatch(script, /RESEND_API_KEY|api\.resend\.com|ALERT_TO|ALERT_FROM|send_mail|should_notify/);
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

    // 예전에는 전체 합계 하나만 견주어, 줄어든 날은 통째로 비워 두었다. 그런데 배포할 때마다
    // agit-app 을 새로 만들기 때문에 그런 날이 자주 생기고, 줄지 않은 날은 값이 조용히 모자랐다.
    // 이제는 컨테이너마다 견주어 다시 0부터 쌓인 것은 지금 값을 그대로 그날치로 본다.
    // 하루치 계산 자체의 동작은 `serviceMetricsCollector.test.mjs` 가 실제로 돌려 확인한다.
    assert.match(script, /RX_DAY="NULL"/);
    assert.match(script, /prev_rx\[\$1\] = \$2/);
    assert.match(script, /rx >= prev_rx\[name\]\) \? rx - prev_rx\[name\] : rx/);
    assert.ok(
        !/\[ "\$RX_NOW" -ge "\$\{PREV_RX:-0\}" \]/.test(script),
        '전체 합계 하나로만 견주던 옛 판정이 남아 있다',
    );
});
