/**
 * AI 모델과 **그 모델이 받는 매개변수**를 정하는 단 하나의 자리.
 *
 * 왜 매개변수까지 여기 있나 (2026-09-10):
 *   모델 이름만 모아 두면 부족했다. `gpt-4o-mini` → `gpt-5.6-luna` 로 바꿔 보니
 *   **이름만 바꾸면 AI 기능 전체가 죽었다.** 새 모델은 `max_tokens` 를 받지 않고
 *   (`max_completion_tokens` 를 쓴다) `temperature: 0` 도 받지 않는다.
 *   매개변수가 여섯 곳에 흩어져 있어 하나만 놓쳐도 그 기능만 조용히 멈춘다.
 *
 *   그래서 부르는 쪽은 **무엇을 원하는지**만 말하고(긴 답이 필요하다·일관된 답이 필요하다),
 *   **어떻게 표현할지**는 이 파일이 정한다. 다음 모델로 옮길 때도 여기만 고치면 된다.
 *
 * 이 모델에서 실제로 확인한 것 (2026-09-10, 운영 열쇠로 직접 호출):
 *   max_tokens                 ✗ 미지원 → max_completion_tokens
 *   temperature: 0             ✗ 미지원 (기본값 1만 받는다)
 *   reasoning_effort: 'none'   ✅ 지원 — 이 모델이 받는 **가장 낮은 값**
 *   reasoning_effort: 'minimal'✗ 미지원 (다른 모델 이름이라 그대로 넣으면 실패한다)
 *   reasoning_effort: 'low'    ✅ 지원
 *   response_format json_object / json_schema(strict)  ✅ 둘 다 지원
 *
 * 왜 `.js` 인가:
 *   `reviewCore.js` 를 Deno(엣지 함수)와 **Node**(`scripts/run-weekly-spelling-review.mjs`,
 *   되돌림 경로)가 함께 읽는다. Node 는 `.ts` 를 못 읽으므로 공유 파일은 `.js` 여야 한다.
 *
 * 배포 주의:
 *   이 파일은 엣지 함수 폴더 **밖**에 있다. `scripts/sync-edge-shared.sh` 가 두 배포 경로에서
 *   **함수보다 먼저** 올린다. 안 올리면 함수가 import 에서 죽는다(로컬로는 못 잡는다).
 */

export const OPENAI_MODEL = 'gpt-5.6-luna';

/**
 * 이 앱은 초등학생 글쓰기와 교사 피드백에 쓴다. 오래 생각할 일이 아니라 빨리 답할 일이다.
 * 추론을 켜면 응답이 느려지고 추론 토큰만큼 요금이 붙는다. 그래서 가장 낮은 값을 쓴다.
 * `none` 은 이 모델이 **실제로 받는** 최소값이다(`minimal` 은 이 모델에 없다).
 */
const REASONING_EFFORT = 'none';

/**
 * OpenAI 채팅 요청 본문을 만든다.
 *
 * @param {object}   options
 * @param {Array}    options.messages         보낼 메시지
 * @param {number}   options.maxOutputTokens  답의 길이 상한
 * @param {boolean} [options.deterministic]   같은 입력에 같은 답이 필요한가
 *        (맞춤법 검사처럼 아이가 두 번 눌러도 같아야 하는 것)
 * @param {object}  [options.responseFormat]  `{ type: 'json_object' }` 또는 json_schema
 */
export function buildChatRequest({ messages, maxOutputTokens, deterministic = false, responseFormat = null }) {
    /*
     * `deterministic` 은 지금 모델에서 **표현할 방법이 없다.** `gpt-5.6-luna` 는 `temperature: 0` 을
     * 거절한다(기본값 1만 받는다). 뜻만 받아 두고 아무것도 넣지 않는다 — 부르는 쪽은 계속
     * "일관된 답이 필요하다"고 말하면 되고, temperature 0 을 받는 모델로 옮기면 아래 한 줄만
     * 되살리면 모든 자리에 함께 돌아온다.
     */
    const deterministicOptions = deterministic ? {} : {};   // 예: { temperature: 0 }
    return {
        model: OPENAI_MODEL,
        messages,
        max_completion_tokens: maxOutputTokens,
        reasoning_effort: REASONING_EFFORT,
        ...(responseFormat ? { response_format: responseFormat } : {}),
        ...deterministicOptions,
    };
}
