/**
 * 교사가 쓴 피드백 규칙을 AI가 다듬어 주는 기능.
 *
 * "맞춤법만 봐줘"처럼 짧게 적으면 지적할 게 없을 때 모델이 학생 글을 그대로
 * 되돌려주는 등의 문제가 생긴다. 교사의 의도는 유지한 채, 빠지기 쉬운 지침
 * (오류가 없을 때의 처리, 본문 재출력 금지, 말투·형식)만 보강한다.
 */
import { callAI } from '../lib/openai';

const REFINE_INSTRUCTION = `너는 초등 교사의 AI 피드백 규칙을 다듬어 주는 도우미야.
아래 [교사의 규칙]을 읽고, **의도는 그대로 두면서** 실제로 잘 동작하도록 보완해서 다시 써 줘.

[반드시 포함할 보완 사항]
1. 지적할 내용이 없을 때 어떻게 답할지 명시 (예: 고칠 곳이 없으면 잘했다고 짧게 알려주기)
2. 학생이 쓴 글의 본문을 그대로 다시 출력하지 말 것
3. 초등학생에게 맞는 다정한 말투
4. 마크다운 기호(#, *, - 등) 대신 이모지와 줄바꿈 사용
5. 교사가 요청하지 않은 항목은 임의로 추가하지 말 것 (요청 범위를 넓히지 않기)

[출력 규칙]
- 완성된 규칙 문장만 출력해. 설명·머리말·따옴표·코드블록은 절대 붙이지 마.

[교사의 규칙]
`;

/**
 * @param {string} draft 교사가 작성한 규칙 원문
 * @returns {Promise<string>} 다듬어진 규칙
 */
export async function refinePromptWithAI(draft) {
    const text = String(draft || '').trim();
    if (!text) throw new Error('다듬을 내용이 비어 있습니다.');

    const result = await callAI(`${REFINE_INSTRUCTION}${text}`, { type: 'AI_FEEDBACK' });
    const cleaned = String(result || '')
        .replace(/^```[a-z]*\n?/i, '')
        .replace(/```$/, '')
        .trim();

    if (!cleaned) throw new Error('AI가 빈 응답을 보냈습니다.');
    return cleaned;
}
