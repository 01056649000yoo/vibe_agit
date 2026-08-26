#!/bin/bash
# 아지트 앱을 맥미니 컨테이너에 직접 배포한다(CI 없이).
#
# ⚠️ **파이프로 감싸지 않는다.** `docker build ... | tail -1` 처럼 쓰면 파이프의 종료 코드가
#    `tail` 것이라 **빌드가 실패해도 성공으로 보인다.** 2026-08-19에 실제로 그렇게 되어,
#    빌드가 테스트 단계에서 깨졌는데도 옛 이미지로 컨테이너만 재시작되고
#    "배포 완료"로 보고했다. 이미지 안에서 아키텍처·보안·배포 검사가 돌기 때문에
#    빌드 실패는 곧 검사 실패다 — 절대 삼키면 안 된다.
set -euo pipefail

cd "$(dirname "$0")/.."

bash scripts/preflight-disk.sh 10
npm run check:title-levels

ANON=$(grep '^ANON_KEY=' "$HOME/agit-supabase/.env" | cut -d= -f2)
GOOGLE_CLIENT_ID=$(grep -m1 '^GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=' "$HOME/agit-supabase/secrets.agit.env" | cut -d= -f2-)
test -n "$ANON" || { echo "anon key not found" >&2; exit 1; }
test -n "$GOOGLE_CLIENT_ID" || { echo "Google client ID not found" >&2; exit 1; }

echo "▶ 이미지 빌드 (아키텍처·보안·배포 검사가 이 안에서 돈다)"
docker build \
  --build-arg VITE_SUPABASE_URL=https://api.xn--vz0ba242ncqcba79xhwx.site \
  --build-arg VITE_SUPABASE_ANON_KEY="$ANON" \
  --build-arg VITE_GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
  -t agit-app:prod .

# 되돌릴 지점을 날짜 태그로 남긴다. `prod` 는 계속 덮어써지므로 그것만으로는 못 되돌린다.
docker tag agit-app:prod "agit-app:$(date +%Y%m%d)"

echo "▶ 컨테이너 교체"
docker rm -f agit-app >/dev/null 2>&1 || true
docker run -d --name agit-app --restart unless-stopped -p 127.0.0.1:8300:80 agit-app:prod >/dev/null

sleep 5
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 http://127.0.0.1:8300/)
echo "▶ 앱 응답 $STATUS"
[ "$STATUS" = "200" ] || { echo "✗ 앱이 200을 주지 않습니다." >&2; exit 1; }

# 실제로 새 코드가 올라갔는지 본다. 컨테이너만 재시작되고 옛 번들이 남는 일을 잡는다.
LOCAL=$(ls dist/assets | grep '^App-.*\.js$' | head -1)
SERVED=$(docker exec agit-app sh -c "ls /srv/assets | grep '^App-.*\.js$' | head -1")
if [ "$LOCAL" = "$SERVED" ]; then
    echo "▶ 번들 확인 $SERVED ✓"
else
    echo "⚠ 번들이 로컬 빌드와 다릅니다 (로컬 $LOCAL / 서빙 $SERVED)" >&2
    echo "  npm run build 를 먼저 돌려 로컬 dist 를 맞춘 뒤 다시 확인하세요." >&2
fi
# ── AI Edge Function 동기화 ────────────────────────────────────────────────
# `vibe-ai` 는 앱 이미지 안에 없다. `agit-edge-functions` 컨테이너가 맥미니의
# `~/agit-supabase/volumes/functions/` 를 그대로 읽는다. 저장소 파일은 원본이고
# 실제로 도는 것은 그 폴더의 사본이라, **복사하지 않으면 옛 코드가 계속 돈다.**
# CI(.github/workflows/deploy.yml 의 `Sync AI edge function`)는 이미 이 일을 한다.
# 로컬 배포에도 같은 단계를 둬서 두 경로가 어긋나지 않게 한다(2026-08-20).
FN_SRC="supabase/functions/vibe-ai/index.ts"
FN_DST="$HOME/agit-supabase/volumes/functions/vibe-ai/index.ts"
if [ ! -f "$FN_DST" ]; then
    echo "⚠ Edge Function 대상 파일이 없습니다: $FN_DST" >&2
elif cmp -s "$FN_SRC" "$FN_DST"; then
    echo "▶ Edge Function 그대로 (바뀐 것 없음)"
else
    echo "▶ Edge Function 교체"
    # 되돌릴 지점을 남긴다. 이 폴더는 git 밖이라 사본이 유일한 복구 수단이다.
    cp "$FN_DST" "$FN_DST.bak-$(date +%Y%m%d-%H%M%S)"
    install -m 0644 "$FN_SRC" "$FN_DST"
    (cd "$HOME/agit-supabase" && docker compose up -d --no-deps --force-recreate functions >/dev/null 2>&1) \
        || docker restart agit-edge-functions >/dev/null

    sleep 4
    EDGE_STATE=$(docker inspect -f '{{.State.Status}}' agit-edge-functions 2>/dev/null || echo "없음")
    [ "$EDGE_STATE" = "running" ] || { echo "✗ Edge Function 컨테이너가 뜨지 않았습니다($EDGE_STATE)." >&2; exit 1; }

    # 빈 요청은 400 이어야 정상이다(형식 오류로 막히는 지점까지 코드가 돈다는 뜻).
    EDGE_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
        -X POST http://127.0.0.1:8100/functions/v1/vibe-ai \
        -H 'Content-Type: application/json' -d '{}')
    echo "▶ Edge Function 응답 $EDGE_CODE"
    [ "$EDGE_CODE" = "400" ] || { echo "✗ Edge Function 이 400 을 주지 않습니다." >&2; exit 1; }
fi

# ── 나이스 급식 Edge Function 동기화 ─────────────────────────────────────
NEIS_FN_SRC="supabase/functions/neis-meal/index.ts"
NEIS_FN_DIR="$HOME/agit-supabase/volumes/functions/neis-meal"
NEIS_FN_DST="$NEIS_FN_DIR/index.ts"
if [ -f "$NEIS_FN_DST" ] && cmp -s "$NEIS_FN_SRC" "$NEIS_FN_DST"; then
    echo "▶ 나이스 급식 Edge Function 그대로 (바뀐 것 없음)"
else
    echo "▶ 나이스 급식 Edge Function 교체"
    mkdir -p "$NEIS_FN_DIR"
    if [ -f "$NEIS_FN_DST" ]; then
        cp "$NEIS_FN_DST" "$NEIS_FN_DST.bak-$(date +%Y%m%d-%H%M%S)"
    fi
    install -m 0644 "$NEIS_FN_SRC" "$NEIS_FN_DST"
    (cd "$HOME/agit-supabase" && docker compose up -d --no-deps --force-recreate functions >/dev/null 2>&1) \
        || docker restart agit-edge-functions >/dev/null

    sleep 4
    NEIS_EDGE_STATE=$(docker inspect -f '{{.State.Status}}' agit-edge-functions 2>/dev/null || echo "없음")
    [ "$NEIS_EDGE_STATE" = "running" ] || { echo "✗ Edge Function 컨테이너가 뜨지 않았습니다($NEIS_EDGE_STATE)." >&2; exit 1; }
    NEIS_EDGE_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
        -X POST http://127.0.0.1:8100/functions/v1/neis-meal \
        -H 'Content-Type: application/json' -d '{}')
    echo "▶ 나이스 급식 Edge Function 응답 $NEIS_EDGE_CODE"
    [ "$NEIS_EDGE_CODE" = "401" ] || { echo "✗ 나이스 급식 Edge Function 이 401 을 주지 않습니다." >&2; exit 1; }
fi

echo "✓ 배포 완료"
