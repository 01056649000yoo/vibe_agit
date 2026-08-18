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
echo "✓ 배포 완료"
