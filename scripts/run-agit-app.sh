#!/bin/bash
# 아지트 앱 컨테이너를 띄우는 **단 하나의 자리**.
#
# 왜 파일로 뺐나:
#   전에는 `docker run ...` 이 두 곳에 있었다 — `scripts/deploy-local.sh` 와
#   `.github/workflows/deploy.yml`. 한쪽만 고치면 로컬 배포와 자동 배포가 서로 다른
#   설정으로 뜨는데, 둘 다 "배포 성공"이라고 말하므로 눈으로는 알 수 없다.
#   `tests/deploymentArchitecture.test.mjs` 가 두 곳이 이 스크립트를 부르는지 지킨다.
#
# 굳히기(2026-09-09 보안 점검 P2):
#   샘링크·자비스는 이미 비root·read-only 로 도는데 아지트만 root·쓰기 가능이었다.
#   - `--user 1000:1000`  : root 로 돌지 않는다
#   - `--read-only`       : 파일 시스템을 못 고친다(정적 서빙이라 쓸 일이 없다)
#   - `--cap-drop ALL`    : 커널 권한을 모두 뺀다
#   - `--cap-add NET_BIND_SERVICE`
#         caddy 실행 파일에 `cap_net_bind_service` 가 setcap 으로 박혀 있어서,
#         이 권한이 bounding set 에 없으면 `no-new-privileges` 와 겹쳐
#         **실행 자체가** `exec /usr/bin/caddy: operation not permitted` 로 죽는다.
#         포트 8080 을 쓰므로 권한이 실제로 필요해서가 아니라, 실행을 위해 남긴다.
#   - `--security-opt no-new-privileges` : 안에서 권한을 더 얻지 못한다
#   - `--memory 256m`     : 한 컨테이너가 맥미니 전체를 굶기지 못하게
#   - `--tmpfs /data /config` : read-only 라도 caddy 가 쓸 자리는 있어야 한다(메모리 위)
#
# 컨테이너 안 포트가 80 이 아니라 8080 인 이유:
#   1024 미만 포트는 root 여야 열 수 있다. 비root 로 돌리려고 8080 으로 내렸다.
#   바깥(호스트 Caddy → 127.0.0.1:8300)은 그대로다.
set -euo pipefail

NAME="${1:-agit-app}"
HOST_PORT="${2:-8300}"
IMAGE="${3:-agit-app:prod}"

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" \
  --restart unless-stopped \
  --user 1000:1000 \
  --read-only \
  --cap-drop ALL \
  --cap-add NET_BIND_SERVICE \
  --security-opt no-new-privileges \
  --memory 256m \
  --tmpfs /data:uid=1000,gid=1000 \
  --tmpfs /config:uid=1000,gid=1000 \
  -p "127.0.0.1:${HOST_PORT}:8080" \
  "$IMAGE" >/dev/null
