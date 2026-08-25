#!/bin/bash
# 서버 지표를 하루 한 줄로 기록한다. 관리자 `서비스 현황` 화면이 이 값을 읽는다.
#
# 왜 하루 한 줄인가:
#   접근 로그를 켜면 정확하지만 디스크를 먹는다. 이 서버는 2026-08-18 에 디스크가 100% 차서
#   도커 데몬이 물리고 앱이 내려간 적이 있다. 알고 싶은 것은 "얼마나 쓰이고 있나" 라는 경향이라
#   하루 한 줄이면 충분하다(1년에 365줄).
#
# 트래픽은 컨테이너가 주고받은 **누적** 바이트의 하루치 증가분이다. 정확한 회선 사용량은 아니다.
#
# 거는 법(맥미니, launchd): 하루 한 번 04:50 쯤. 백업(04:00)·복구 리허설(04:40) 뒤가 좋다.
#   자세한 설치 순서는 docs 또는 WORKLOG 참고.
set -uo pipefail

DOCKER="${DOCKER:-/Applications/Docker.app/Contents/Resources/bin/docker}"
STATE_FILE="${HOME}/.agit-metrics-state"
STATE_TIME_FILE="${STATE_FILE}.timestamp"
DAY="$(date +%F)"
MEASURED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

psql_exec() {
    "$DOCKER" exec -i agit-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A "$@"
}

# --- 디스크 여유(GB) ---
DISK_FREE_GB="$(df -g / 2>/dev/null | awk 'NR==2 {print $4}')"
[ -n "${DISK_FREE_GB:-}" ] || DISK_FREE_GB="NULL"

# --- DB 크기(MB) ---
DB_SIZE_MB="$(psql_exec -c "SELECT round(pg_database_size('postgres')/1024.0/1024.0, 1);" 2>/dev/null | tr -d ' ')"
[ -n "${DB_SIZE_MB:-}" ] || DB_SIZE_MB="NULL"

# --- 컨테이너 수 ---
CONTAINER_TOTAL="$("$DOCKER" ps -q 2>/dev/null | wc -l | tr -d ' ')"
# 건강검진이 없는 컨테이너는 상태가 비어 있다. 그런 것은 "돌고 있으면 정상" 으로 센다.
CONTAINER_HEALTHY="$("$DOCKER" ps --format '{{.Status}}' 2>/dev/null | grep -cv 'unhealthy\|Restarting\|Exited' | tr -d ' ')"
[ -n "${CONTAINER_TOTAL:-}" ] || CONTAINER_TOTAL="NULL"
[ -n "${CONTAINER_HEALTHY:-}" ] || CONTAINER_HEALTHY="NULL"

# --- 트래픽: 컨테이너마다 누적값을 재고, 컨테이너마다 하루치를 낸다 ---
#
# docker stats 는 컨테이너별 누적 NET I/O 를 준다. 배포할 때마다 agit-app 은 지우고 새로 만들기
# 때문에 그 컨테이너의 누적값은 0부터 다시 쌓인다. 예전에는 전체 합계 하나만 비교해서,
# 배포가 있던 날은 값이 조용히 모자라거나 통째로 빠졌다(8/21~23 기록이 그렇게 망가졌다).
# 그래서 컨테이너 이름별로 지난 값을 기억하고, 줄어든 컨테이너는 "다시 0부터 쌓인 것" 으로 보고
# 지금 값을 그대로 그날치에 더한다. 새로 생긴 컨테이너도 같은 규칙이다.
#
# docker stats 가 값을 못 주면(도커가 물렸거나 응답이 없을 때) 0 을 기록하지 않는다.
# 예전에는 0 을 상태 파일에 적어 두어, 다음 날 하루치가 통째로 잘못 들어갔다.
CURRENT_STATS="$("$DOCKER" stats --no-stream --format '{{.Name}} {{.NetIO}}' 2>/dev/null | awk '
function to_bytes(v) {
    unit = v; sub(/^[0-9.]+/, "", unit);
    num = v; sub(/[A-Za-z]+$/, "", num);
    if (unit == "kB" || unit == "KB") return num * 1000;
    if (unit == "MB") return num * 1000000;
    if (unit == "GB") return num * 1000000000;
    if (unit == "TB") return num * 1000000000000;
    return num + 0;
}
NF >= 4 {
    line = $0;
    name = $1;
    sub(/^[^ ]+ /, "", line);
    split(line, parts, " / ");
    printf "%s %.0f %.0f\n", name, to_bytes(parts[1]), to_bytes(parts[2]);
}
')"

UPDATE_STATE=false
TRAFFIC_STARTED_SQL="NULL"
TRAFFIC_COMPLETE="NULL"
if [ -z "${CURRENT_STATS:-}" ]; then
    echo "docker stats 가 값을 주지 않아 트래픽을 건너뜁니다 ($DAY)" >&2
    RX_DAY="NULL"
    TX_DAY="NULL"
elif [ ! -f "$STATE_FILE" ] || [ "$(awk 'NR==1 {print NF; exit}' "$STATE_FILE" 2>/dev/null)" != "3" ]; then
    # 첫 실행이거나, 컨테이너 이름이 없던 옛 형식이면 견줄 값이 없다.
    # 옛 형식을 그대로 견주면 모든 컨테이너가 새것으로 보여 누적분이 통째로 하루치가 된다.
    echo "지난 기록이 없거나 옛 형식이라 트래픽은 다음 실행부터 기록합니다 ($DAY)" >&2
    RX_DAY="NULL"
    TX_DAY="NULL"
    UPDATE_STATE=true
else
    read -r RX_DAY TX_DAY RESET_COUNT <<EOF
$(awk '
NR == FNR { prev_rx[$1] = $2; prev_tx[$1] = $3; next }
{
    name = $1; rx = $2; tx = $3;
    seen[name] = 1;
    # 지난 값이 없거나(새 컨테이너) 지금 값이 더 작으면(다시 만들어짐) 지금 값이 곧 그날치다.
    if (name in prev_rx && rx < prev_rx[name]) resets += 1;
    if (name in prev_tx && tx < prev_tx[name]) resets += 1;
    day_rx += (name in prev_rx && rx >= prev_rx[name]) ? rx - prev_rx[name] : rx;
    day_tx += (name in prev_tx && tx >= prev_tx[name]) ? tx - prev_tx[name] : tx;
}
END {
    # 지난번에 있던 컨테이너가 사라져도 그 컨테이너의 마지막 누적분을 알 수 없으므로 불완전한 구간이다.
    for (name in prev_rx) if (!(name in seen)) resets += 1;
    printf "%.0f %.0f %d", day_rx, day_tx, resets;
}
' "$STATE_FILE" - <<STATS
$CURRENT_STATS
STATS
)
EOF
    RX_DAY="${RX_DAY:-NULL}"
    TX_DAY="${TX_DAY:-NULL}"
    TRAFFIC_COMPLETE=true
    if [ "${RESET_COUNT:-0}" -gt 0 ] 2>/dev/null; then
        TRAFFIC_COMPLETE=false
    fi

    PREVIOUS_MEASURED_AT=""
    if [ -f "$STATE_TIME_FILE" ]; then
        PREVIOUS_MEASURED_AT="$(tr -d '[:space:]' < "$STATE_TIME_FILE")"
    elif [ -f "$STATE_FILE" ]; then
        # 새 시간 파일을 도입하기 전의 상태 파일은 수정 시각이 직전 측정 시각이다.
        PREVIOUS_EPOCH="$(stat -f '%m' "$STATE_FILE" 2>/dev/null)"
        if [ -n "${PREVIOUS_EPOCH:-}" ]; then
            PREVIOUS_MEASURED_AT="$(date -u -r "$PREVIOUS_EPOCH" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null)"
        fi
    fi
    if [[ "$PREVIOUS_MEASURED_AT" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
        TRAFFIC_STARTED_SQL="'${PREVIOUS_MEASURED_AT}'"
    fi
    UPDATE_STATE=true
fi

# --- 기록 ---
if ! psql_exec -c "SELECT public.record_system_daily_metric_v2(
    '${DAY}'::date,
    ${RX_DAY}::bigint,
    ${TX_DAY}::bigint,
    ${DISK_FREE_GB}::numeric,
    ${DB_SIZE_MB}::numeric,
    ${CONTAINER_TOTAL}::integer,
    ${CONTAINER_HEALTHY}::integer,
    ${TRAFFIC_STARTED_SQL}::timestamptz,
    ${TRAFFIC_COMPLETE}::boolean
);" >/dev/null 2>&1; then
    # DB 마이그레이션보다 이 스크립트가 먼저 배포돼도 기존 일일 기록은 계속 남긴다.
    psql_exec -c "SELECT public.record_system_daily_metric_v1(
        '${DAY}'::date,
        ${RX_DAY}::bigint,
        ${TX_DAY}::bigint,
        ${DISK_FREE_GB}::numeric,
        ${DB_SIZE_MB}::numeric,
        ${CONTAINER_TOTAL}::integer,
        ${CONTAINER_HEALTHY}::integer
    );" >/dev/null || {
        echo "지표 기록 실패 ($DAY)" >&2
        exit 1
    }
fi

# DB 기록이 성공한 뒤에만 다음 비교 기준을 옮긴다. 반대로 하면 DB 실패 날의 트래픽을 영영 잃는다.
if [ "$UPDATE_STATE" = true ]; then
    printf '%s\n' "$CURRENT_STATS" > "$STATE_FILE"
    printf '%s\n' "$MEASURED_AT" > "$STATE_TIME_FILE"
fi

echo "지표 기록 완료 $DAY — 디스크 ${DISK_FREE_GB}GB · DB ${DB_SIZE_MB}MB · 컨테이너 ${CONTAINER_HEALTHY}/${CONTAINER_TOTAL}"
