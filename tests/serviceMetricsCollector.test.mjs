import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const script = readFileSync('scripts/record-system-metrics.sh', 'utf8');

/**
 * 하루치 트래픽 계산만 떼어 실제로 돌려 본다.
 *
 * 이 계산이 틀리면 화면에는 그럴듯한 막대가 그려지는데 값이 거짓이다.
 * 2026-08-21~23 기록이 실제로 그렇게 망가졌다(0 바이트 하루, 누적분이 통째로 들어간 하루).
 */
/**
 * 계산식은 **스크립트에서 꺼내 쓴다**. 검사 안에 베껴 두면 스크립트가 바뀌어도 검사는
 * 옛 복사본을 돌려 계속 통과한다(그러면 아무것도 지키지 못하는 검사가 된다).
 */
const extractDayDeltaProgram = (source) => {
    // 형식 확인에도 짧은 awk 가 하나 있다. 하루치 계산은 여러 줄이고 `NR == FNR` 로 시작한다.
    const start = source.indexOf("$(awk '\nNR == FNR");
    const end = source.indexOf("' \"$STATE_FILE\" -", start);
    assert.ok(start > 0 && end > start, '스크립트에서 하루치 계산식을 찾지 못했다');
    return source.slice(start + "$(awk '".length, end);
};

const AWK_PROGRAM = extractDayDeltaProgram(script);

// 임시 파일을 만들지 않고 지난 값은 프로세스 치환으로, 오늘 값은 표준 입력으로 넣는다.
const dayDelta = (previousLines, currentLines) => {
    const out = execFileSync(
        'bash',
        ['-c', 'awk "$AWK_PROGRAM" <(printf \'%s\\n\' "$PREV_LINES") -'],
        {
            input: `${currentLines.join('\n')}\n`,
            encoding: 'utf8',
            env: { ...process.env, AWK_PROGRAM, PREV_LINES: previousLines.join('\n') },
        },
    );
    const [rx, tx] = out.trim().split(/\s+/).map(Number);
    return { rx, tx };
};

test('트래픽 하루치는 컨테이너마다 따로 센다', () => {
    // 평범한 하루: 둘 다 늘기만 한다.
    assert.deepEqual(
        dayDelta(['agit-app 1000 2000', 'kong 500 700'], ['agit-app 1500 2600', 'kong 900 1000']),
        { rx: 900, tx: 900 },
    );

    // 배포한 날: agit-app 을 지우고 새로 만들어 누적값이 0부터 다시 쌓인다.
    // 지금 값이 곧 그날치다. 예전에는 전체 합계만 비교해 이런 날을 통째로 버렸다.
    assert.deepEqual(
        dayDelta(['agit-app 5000000000 6000000000', 'kong 500 700'], ['agit-app 12000 18000', 'kong 900 1000']),
        { rx: 12400, tx: 18300 },
    );

    // 컨테이너가 새로 생긴 날도 같은 규칙이다.
    assert.deepEqual(
        dayDelta(['kong 500 700'], ['kong 900 1000', 'new-app 3000 4000']),
        { rx: 3400, tx: 4300 },
    );

    // 받은 양과 보낸 양은 따로 본다. 한쪽이 줄었다고 다른 쪽까지 버리지 않는다.
    assert.deepEqual(dayDelta(['a 1000 1000'], ['a 400 1500']), { rx: 400, tx: 500 });

    // 사라진 컨테이너는 그날치에 끼지 않는다.
    assert.deepEqual(dayDelta(['a 100 100', 'gone 900 900'], ['a 300 400']), { rx: 200, tx: 300 });
});

test('값을 못 재거나 옛 형식이면 0 을 기록하지 않는다', () => {
    // docker stats 가 빈손이면 그날은 건너뛴다.
    // 예전에는 0 을 상태 파일에 적어 두어, 다음 날 하루치가 통째로 잘못 들어갔다.
    assert.match(script, /if \[ -z "\$\{CURRENT_STATS:-\}" \]; then[\s\S]*?RX_DAY="NULL"[\s\S]*?TX_DAY="NULL"/);
    assert.ok(
        !/printf '%s %s\\n' "\$RX_NOW" "\$TX_NOW" > "\$STATE_FILE"/.test(script),
        '값을 못 잰 날에도 상태 파일을 덮어쓰던 옛 코드가 남아 있다',
    );

    // 컨테이너 이름이 없던 옛 상태 파일을 그대로 견주면 누적분이 통째로 하루치가 된다.
    assert.match(script, /awk 'NR==1 \{print NF; exit\}' "\$STATE_FILE"[\s\S]*?!= "3"/);

    // 상태 파일은 컨테이너별 세 칸으로 적는다.
    assert.match(script, /printf '%s\\n' "\$CURRENT_STATS" > "\$STATE_FILE"/);
    assert.match(script, /\{\{\.Name\}\} \{\{\.NetIO\}\}/);
});

test('기록 RPC에는 정해진 값만 넘긴다', () => {
    // 셸 문자열을 그대로 SQL 에 끼워 넣는 자리라 숫자·NULL 말고는 들어가면 안 된다.
    const call = script.slice(script.indexOf('record_system_daily_metric_v1'));
    assert.match(call, /\$\{RX_DAY\}::bigint/);
    assert.match(call, /\$\{TX_DAY\}::bigint/);
    const assignments = [
        ...script.matchAll(/\b(RX_DAY|TX_DAY)="([^"]*)"/g),
    ].map((match) => ({ name: match[1], value: match[2] }));
    assert.ok(assignments.length > 0, '하루치 값을 정하는 자리를 찾지 못했다');
    for (const { name, value } of assignments) {
        assert.ok(
            value === 'NULL' || /^\$\{?\w+/.test(value),
            `${name} 에 예상 밖의 값이 들어간다: ${value}`,
        );
    }
});
