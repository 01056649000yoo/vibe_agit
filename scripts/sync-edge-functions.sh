#!/usr/bin/env bash
set -euo pipefail
# 모든 Edge 함수를 맥미니 운영 폴더와 맞춘다. 로컬 배포(`scripts/deploy-local.sh`)와
# 자동 배포(`.github/workflows/deploy.yml`)가 **이 스크립트 하나**를 부른다.
#
# 왜 (2026-09-25):
#   예전에는 배포 경로마다 vibe-ai·neis-meal·spelling-weekly-review 세 함수만 따로 복사했다.
#   나머지 여섯(verify-admin-mode·book-search·…)은 손으로 옮겨야 해서, 2026-09-24 보안 수정이
#   저장소에만 있고 운영에는 옛 코드가 돌 뻔했다(docs/security-audits/2026-09-24.md 결정 필요 D).
#   이제 `supabase/functions/` 에 있는 함수는 **폴더째 모든 파일**을 본다 — 새 함수·새 파일도 저절로 따라간다.
#
# 순서: `sync-edge-shared.sh`(함께 쓰는 파일)를 **먼저** 부른 뒤 이 스크립트를 부른다.
# 공개 전시관 함수(class-agit-public-read)는 전용 검증이 있는 `sync-class-agit-public-read.sh` 가 맡는다.
src_root="supabase/functions"
dst_root="$HOME/agit-supabase/volumes/functions"
stamp=$(date +%Y%m%d-%H%M%S)

# 빈 요청(`{}`)에 대한 정상 응답. 로그인 없이 부르면 막는 함수는 401, vibe-ai 는 형식 오류 400.
# 500·000 이면 import 가 깨졌거나 컨테이너가 안 뜬 것이다.
expected_code() {
    case "$1" in
        vibe-ai) echo 400 ;;
        *) echo 401 ;;
    esac
}

changed_functions=""
for fn_dir in "$src_root"/*/; do
    fn=$(basename "$fn_dir")
    case "$fn" in _shared|class-agit-public-read) continue ;; esac
    fn_changed=0
    mkdir -p "$dst_root/$fn"
    for src_file in "$fn_dir"*; do
        [ -f "$src_file" ] || continue
        name=$(basename "$src_file")
        dst_file="$dst_root/$fn/$name"
        if [ -f "$dst_file" ] && cmp -s "$src_file" "$dst_file"; then
            continue
        fi
        # 이 폴더는 git 밖이라 사본이 유일한 복구 수단이다.
        [ -f "$dst_file" ] && cp "$dst_file" "$dst_file.bak-$stamp"
        install -m 0644 "$src_file" "$dst_file"
        fn_changed=1
    done
    if [ "$fn_changed" -eq 1 ]; then
        changed_functions="$changed_functions $fn"
    fi
done

# 배열 대신 문자열로 모은다 — macOS 기본 bash 3.2 는 `set -u` 에서 빈 배열을 unbound 로 본다.
if [ -z "$changed_functions" ]; then
    echo "▶ Edge 함수 모두 그대로 (바뀐 것 없음)"
else
    echo "▶ Edge 함수 교체:$changed_functions"
    # 컨테이너는 한 번만 다시 만든다. 파일 목록(COMPOSE_FILE)은 ~/agit-supabase/.env 가 정한다 —
    # 비밀 값은 docker-compose.agit.yml 의 env_file 로 **만들 때만** 들어가므로 restart 가 아니라 recreate.
    (cd "$HOME/agit-supabase" && docker compose up -d --no-deps --force-recreate functions >/dev/null 2>&1) \
        || docker restart agit-edge-functions >/dev/null
fi

edge_state=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
    edge_state=$(docker inspect -f '{{.State.Status}}' agit-edge-functions 2>/dev/null || echo "없음")
    [ "$edge_state" = "running" ] && break
    sleep 2
done
[ "$edge_state" = "running" ] || { echo "✗ Edge 함수 컨테이너가 뜨지 않았습니다($edge_state)." >&2; exit 1; }

# 바뀐 것만이 아니라 **모든** 함수를 부른다 — 공유 파일이나 새 파일이 빠져 import 가 깨진 함수도 잡는다.
failed=""
for fn_dir in "$src_root"/*/; do
    fn=$(basename "$fn_dir")
    case "$fn" in _shared|class-agit-public-read) continue ;; esac
    want=$(expected_code "$fn")
    code=000
    for _ in 1 2 3 4 5 6; do
        code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
            -X POST "http://127.0.0.1:8100/functions/v1/$fn" \
            -H 'Content-Type: application/json' -d '{}' || true)
        [ "$code" = "$want" ] && break
        sleep 2
    done
    if [ "$code" = "$want" ]; then
        echo "  $fn $code ✓"
    else
        echo "  $fn $code (기대 $want) ✗" >&2
        failed="$failed $fn"
    fi
done
if [ -n "$failed" ]; then
    echo "✗ Edge 함수 응답 확인 실패:$failed — 되돌릴 사본은 각 폴더의 *.bak-$stamp" >&2
    exit 1
fi
echo "▶ Edge 함수 응답 확인 완료"
