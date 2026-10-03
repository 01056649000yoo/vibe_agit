# Node 실행환경 규칙 (2026-10-03)

> 설정: [`ops/node-runtime/policy.json`](../ops/node-runtime/policy.json) · 판단 계산: [`scripts/lib/nodeRuntimePolicy.mjs`](../scripts/lib/nodeRuntimePolicy.mjs)
> 주간 루틴: [`scripts/node-runtime-update.mjs`](../scripts/node-runtime-update.mjs)(LaunchAgent `com.agit.node-runtime-update`, **일요일 05:10**)
> 결과: `~/backups/auto/node-runtime-status.txt` 한 줄 · 문제는 관리자 `서비스 현황` 의 **`Node 실행환경 확인 필요`**(`node_runtime`)

## 왜 생겼나

- 2026-10-03 Docker 이미지 점검에서 openssl·curl 이 오래돼 있었다 — `node:20-alpine`·`caddy:2-alpine` 같은 떠 있는 태그를
  맥미니에 남은 옛 사본으로 계속 빌드했기 때문이다. Node 20 은 2026-04-30 에 지원이 끝나 이미지 갱신도 멈춰 있었다.
- 같은 날 오픈클로가 2026.9.7 부터 Node 24.16+ 를 요구해, 맥미니(Node 22)에서 9/23 부터 매일 업데이트가 실패하고
  있었다. 손으로 업데이트하다 게이트웨이가 멈췄다.

## 어디서 어떤 Node 를 쓰나

| 쓰는 곳 | Node | 어떻게 깔렸나 |
|---|---|---|
| 맥미니 기본 `node`(이 저장소 검사·스크립트·연구소/쌤링크 개발, LaunchAgent 스크립트) | **22** | brew `node@22`(링크됨) |
| 오픈클로 게이트웨이·업데이트 | **24** | brew `node@24`(링크 안 함, `/opt/homebrew/opt/node@24` 경로로만) |
| 아지트 앱 이미지 빌드 단계 · 연구소 이미지 | 22 | `node:22-alpine` |
| 쌤링크 이미지 | 22 | `node:22-alpine` |
| GitHub 자동 배포의 검사 | 22 | `actions/setup-node`(연구소 `node-version: 22`) |

## 규칙

1. **같은 큰 버전(22·24) 안의 패치·작은 버전은 자동으로 올린다.** 단 nodejs.org 의 **LTS 판**이고 **나온 지 7일**이 지난 것만.
2. **올린 즉시 확인한다.** node@24 → 오픈클로 게이트웨이를 다시 띄워 응답(200)을, node@22 → 기본 `node` 버전과 짧은 검사를.
3. **확인이 실패하면 되돌리고 묶는다.** node@24 는 바로 전 판 node 로 게이트웨이를 다시 띄우고, 둘 다 `brew pin` 으로 더 오르지 않게
   한 뒤 `node_runtime` 경고를 연다. 사람이 원인을 보고 `brew unpin node@24` 로 풀어야 다시 자동으로 오른다.
   되돌릴 판이 남아 있게 루틴은 `HOMEBREW_NO_INSTALL_CLEANUP=1` 로 올린다.
4. **큰 버전(22→24, 24→26)은 절대 자동으로 바꾸지 않는다.** 쓰는 큰 버전의 지원 종료가 **90일 안**으로 들어오면 경고만 연다
   (Node 22 는 2027-04-30 종료 → 2027-01-30 무렵 경고). 옮길 때는 사람이 한다 — 아래 `큰 버전 옮기기`.
5. **도커 베이스 이미지(`node:22-alpine`·`caddy:2-alpine`)를 매주 새로 받아 둔다.** 다음 빌드부터 보안 패치가 들어간다.
   Dockerfile 은 큰 버전까지만 적는다(`node:22-alpine`). 연구소 실행 단계는 `apk upgrade` 로 알파인 패치를 한 번 더 받는다.
6. **앱이 요구하는 Node 를 못 맞추면 설치를 시도하지 않는다.** 오픈클로 업데이트는 새 판의 `engines.node` 를 먼저 보고,
   못 맞추면 `NEEDS_NODE` 로 남기고 경고를 연다(매일 "설치 실패" 로 쌓이지 않게).

## 큰 버전 옮기기 (사람이 할 때)

1. 새 큰 버전이 **Active LTS** 인지 본다(홀수·Current 판은 쓰지 않는다 — 예: 2026-10 기준 26 은 아직 LTS 전).
2. 맥미니: `brew install node@NN` → 쓰는 곳 하나씩(오픈클로처럼 따로 쓰는 곳이면 그 경로만) 옮긴다. `policy.json` 의 해당 줄 `major`·공식 이름을 바꾼다.
3. 이미지: Dockerfile `FROM node:NN-alpine` · CI `node-version` 을 바꾸고, **푸시 전에 테스트 태그로 빌드해 같은 환경으로 띄워 본다**
   (2026-10-03 연구소 Node 22 전환 때 한 방법: `/lab` 307·로그인 200·sharp 로드 확인).
4. 검사 주석의 `node:NN-alpine` 같은 글자도 맞춘다.

## 오픈클로 업데이트(매일 05:50, `scripts/openclaw-autoupdate.sh`)

- `PATH` 앞에 `/opt/homebrew/opt/node@24/bin` — npm 설치·doctor 가 Node 24 로 돈다. 게이트웨이 plist 의 node 자리도 이 경로다.
- ⚠️ 오픈클로 앱 안의 `업데이트` 단추는 쓰지 않는다. 2026-10-03 에 마지막 재시작 단계에서 실패하며 게이트웨이를 내린 채 끝났다.
- ⚠️ plist 의 배열 칸은 `plutil -replace` 로 바꾸지 않는다 — 바꾸지 않고 **끼워 넣는다**. 지우고(`-remove`) 넣는다(`-insert`).
