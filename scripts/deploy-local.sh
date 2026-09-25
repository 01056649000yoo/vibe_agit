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

# 만드는 방법은 scripts/build-agit-app.sh 한 곳에만 둔다 — 자동 배포도 같은 것을 부른다.
# 되돌릴 지점도 그 안에서 **빌드 앞에** 남긴다.
bash scripts/build-agit-app.sh

echo "▶ 컨테이너 교체"
# 띄우는 방법은 scripts/run-agit-app.sh 한 곳에만 둔다 — 자동 배포도 같은 것을 부른다.
bash scripts/run-agit-app.sh

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
# ── Edge 함수 동기화 ─────────────────────────────────────────────────────
# Edge 함수는 앱 이미지 안에 없다. `agit-edge-functions` 컨테이너가 맥미니의
# `~/agit-supabase/volumes/functions/` 를 그대로 읽는다. 저장소 파일은 원본이고
# 실제로 도는 것은 그 폴더의 사본이라, **복사하지 않으면 옛 코드가 계속 돈다.**
# 자동 배포(.github/workflows/deploy.yml 의 `Sync edge functions`)와 같은 스크립트를 부른다.
# 함수들이 함께 쓰는 파일을 **먼저** 올린다(AI 모델 이름 등). 자동 배포도 같은 것을 부른다.
bash scripts/sync-edge-shared.sh

# 모든 Edge 함수(폴더째 모든 파일)를 맞추고, 함수마다 빈 요청으로 응답을 확인한다.
# 예전에는 세 함수만 여기 따로 적어 나머지는 손으로 옮겨야 했다(2026-09-25, 자동 배포도 같은 스크립트).
bash scripts/sync-edge-functions.sh

# Anonymous exhibition gateway (two files, also used by Actions).
bash scripts/sync-class-agit-public-read.sh

echo "✓ 배포 완료"
