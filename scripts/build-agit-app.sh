#!/bin/bash
# 아지트 앱 이미지를 만드는 **단 하나의 자리**. (짝: scripts/run-agit-app.sh)
#
# 왜 파일로 뺐나:
#   `docker build ...` 가 `scripts/deploy-local.sh` 와 `.github/workflows/deploy.yml` 두 곳에
#   똑같이 복사돼 있었다. build-arg 를 한쪽에만 더하면 로컬과 자동 배포가 서로 다른 번들을
#   굽는데, 둘 다 "배포 성공"이라 눈으로는 알 수 없다.
#
# 되돌릴 지점을 **빌드 앞에서** 남기는 이유 (2026-09-09에 실제로 겪은 일):
#   전에는 빌드가 끝난 뒤 `docker tag agit-app:prod agit-app:$(date)` 를 했다. 주석에는
#   "되돌릴 지점"이라고 적혀 있었지만 그 시점의 `prod` 는 **방금 만든 새 이미지**다.
#   즉 되돌릴 표가 아니라 새 이미지에 날짜만 하나 더 붙인 것이었고, 자동 배포에는 그마저 없었다.
#   되돌리려면 **덮어쓰기 전의** 이미지를 가리켜야 한다.
set -euo pipefail

cd "$(dirname "$0")/.."

# 1) 지금 `prod` 가 가리키는 이미지를 되돌릴 지점으로 남긴다. 첫 빌드면 없으므로 건너뛴다.
if docker image inspect agit-app:prod >/dev/null 2>&1; then
    ROLLBACK_TAG="agit-app:rollback-$(date +%Y%m%d-%H%M%S)"
    docker tag agit-app:prod "$ROLLBACK_TAG"
    echo "▶ 되돌릴 지점 $ROLLBACK_TAG"
    # 되돌림 태그가 무한정 쌓이지 않게 최근 5개만 남긴다.
    docker images agit-app --format '{{.Tag}}' \
        | grep '^rollback-' | sort -r | tail -n +6 \
        | while read -r old; do docker rmi "agit-app:$old" >/dev/null 2>&1 || true; done
else
    echo "▶ 첫 빌드 — 되돌릴 지점 없음"
fi

# 2) 공개 설정 값을 읽는다(비밀이 아니라 브라우저 번들에 들어가는 공개 값이다).
ANON=$(grep '^ANON_KEY=' "$HOME/agit-supabase/.env" | cut -d= -f2)
GOOGLE_CLIENT_ID=$(grep -m1 '^GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=' "$HOME/agit-supabase/secrets.agit.env" | cut -d= -f2-)
test -n "$ANON" || { echo "anon key not found" >&2; exit 1; }
test -n "$GOOGLE_CLIENT_ID" || { echo "Google client ID not found" >&2; exit 1; }

# 3) 이미지 안에서 아키텍처·보안·배포 검사가 돈다. 파이프로 감싸면 실패를 삼키므로 그대로 둔다.
echo "▶ 이미지 빌드 (아키텍처·보안·배포 검사가 이 안에서 돈다)"
docker build \
  --build-arg VITE_SUPABASE_URL=https://api.xn--vz0ba242ncqcba79xhwx.site \
  --build-arg VITE_SUPABASE_ANON_KEY="$ANON" \
  --build-arg VITE_GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
  -t agit-app:prod .
