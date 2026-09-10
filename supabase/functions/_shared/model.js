/**
 * AI 모델 이름을 정하는 **단 하나의 자리**.
 *
 * 왜 모았나 (2026-09-10):
 *   `gpt-4o-mini` 가 세 곳에 따로 박혀 있었다 — `vibe-ai/index.ts` 두 자리(댓글 안전 검사·나머지
 *   전부)와 `spelling-weekly-review/reviewCore.js`. 모델을 바꾸려면 세 곳을 다 찾아 고쳐야 했고,
 *   한 곳을 놓치면 **오류 없이** 그 기능만 옛 모델을 계속 썼다. 아무도 모른다.
 *
 * 바꾸는 법:
 *   아래 한 줄만 고치고 배포한다. 세 기능이 함께 바뀐다.
 *   `tests/aiModelSingleSource.test.mjs` 가 새 문자열이 다시 박히는 것을 막는다.
 *
 * 왜 `.js` 인가:
 *   `reviewCore.js` 는 Deno(엣지 함수)와 **Node**(`scripts/run-weekly-spelling-review.mjs`,
 *   되돌림 경로) 양쪽이 읽는다. Node 는 `.ts` 를 못 읽으므로 공유 파일은 `.js` 여야 한다.
 *
 * 배포 주의:
 *   이 파일은 **엣지 함수 폴더 밖**에 있다. `scripts/deploy-local.sh` 와
 *   `.github/workflows/deploy.yml` 이 둘 다 `_shared/model.js` 를 함께 올려야 한다.
 *   안 올리면 함수가 import 에서 죽는다(로컬에는 파일이 있어 로컬 검사로는 못 잡는다).
 *   `tests/deploymentArchitecture.test.mjs` 가 두 경로를 함께 지킨다.
 */

export const OPENAI_MODEL = 'gpt-4o-mini';
