#!/usr/bin/env bash
set -euo pipefail
# Edge 함수들이 함께 쓰는 파일을 올린다. 각 함수보다 **먼저** 돌아야 한다.
#
# 왜 따로 있나 (2026-09-10):
#   AI 모델 이름을 `supabase/functions/_shared/model.js` 한 곳으로 모았다. 이 파일은 각 함수
#   폴더 **밖**에 있어서, 함수만 올리고 이걸 빠뜨리면 함수가 import 에서 죽는다.
#   로컬에는 파일이 있어 로컬 검사로는 절대 못 잡는 종류의 사고다.
#
#   그래서 두 배포 경로(`scripts/deploy-local.sh`·`.github/workflows/deploy.yml`)가
#   **같은 스크립트 하나**를 부른다. 한쪽만 고쳐 어긋나는 일을 막는다.
shared_src="supabase/functions/_shared"
shared_dst="$HOME/agit-supabase/volumes/functions/_shared"

changed=0
mkdir -p "$shared_dst"
for shared_file in "$shared_src"/*.js; do
    [ -f "$shared_file" ] || continue
    shared_name=$(basename "$shared_file")
    if [ -f "$shared_dst/$shared_name" ] && cmp -s "$shared_file" "$shared_dst/$shared_name"; then
        continue
    fi
    # 이 폴더는 git 밖이라 사본이 유일한 복구 수단이다.
    [ -f "$shared_dst/$shared_name" ] && cp "$shared_dst/$shared_name" "$shared_dst/$shared_name.bak-$(date +%Y%m%d-%H%M%S)"
    install -m 0644 "$shared_file" "$shared_dst/$shared_name"
    echo "_shared/$shared_name 교체"
    changed=1
done

if [ "$changed" -eq 0 ]; then
    echo "_shared already current"
    exit 0
fi

(cd "$HOME/agit-supabase" && docker compose up -d --no-deps --force-recreate functions)

# 공유 파일이 실제로 읽히는지 확인한다. import 가 깨지면 함수는 400/401 이 아니라 500 을 준다.
for shared_attempt in 1 2 3 4 5 6; do
    shared_status=$(curl --max-time 5 -s -o /dev/null -w '%{http_code}' \
        -X POST http://127.0.0.1:8100/functions/v1/vibe-ai -H 'Content-Type: application/json' -d '{}' || true)
    if [ "$shared_status" = "400" ]; then
        echo "_shared 반영 확인 (vibe-ai 400)"
        exit 0
    fi
    sleep 2
done
echo "_shared 반영 뒤 vibe-ai 가 400 을 주지 않습니다: HTTP ${shared_status:-?}" >&2
exit 1
