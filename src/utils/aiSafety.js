import { callAI } from '../lib/openai';

/**
 * AI를 사용하여 텍스트의 적절성을 분석합니다. ✨
 */
export const checkContentSafety = async (content) => {
    if (!content || content.trim().length < 2) return { is_appropriate: true, reason: '' };

    const prompt = `
너는 대한민국 초등학교의 1급 정교사이며, 학생들의 생활지도를 담당하는 다정하지만 엄격한 선생님이야. 
학생들이 사용하는 학급 커뮤니티에 다음 문장이 올라오려고 해. 교육적으로 적절한지 아주 엄격하게 판단해줘.

학생의 문장: "${content}"

[생활지도 및 판단 기준]
1. 직접적인 욕설, 비속어, 은어, 줄임말 욕설이 포함되어 있는가?
2. 특정 대상을 외모, 성격, 성적, 집안 형편 등으로 비하하거나 조롱하는가? (예: "너 진짜 못생겼다", "공부도 못하면서", "돼지야")
3. 은근히 따돌리거나 소외시키려는 의도가 있는가? (예: "너랑은 안 놀아", "우리끼리만 하자", "너 왜 그래?")
4. 상대방을 무시하거나 비꼬는 말투인가? (예: "수준 낮네", "그거밖에 못해?")
5. 공격적이거나 위협적인 표현, 공포심을 유발하는 표현인가?
6. 내용이 전혀 없거나, 의미 없는 문자열(예: "asdfgh", "ㄱㄴㄷㄹ", "ㅋㅋㅋㅋㅋ"만 도배 등)을 무성의하게 작성했는가?

[응답 규칙]
1. 애매한 경우나 의미 없는 낙서성 글은 '부적절함(is_appropriate: false)'으로 판단하여 미리 방지해.
2. 부적절할 경우, "선생님은 우리 OO이(가) 친구들과 더 의미 있는 대화를 나눴으면 좋겠어. 정성이 담긴 예쁜 글을 기다릴게."와 같이 학생의 이름을 부르는 듯한 친절한 말투로 훈육 메시지를 작성해줘.
3. 반드시 아래 JSON 형식으로만 답해줘.

{
  "is_appropriate": boolean,
  "reason": "부적절할 경우 보여줄 2~3문장의 다정한 훈육 메시지"
}
`;

    try {
        // [수정] 이제 서버(Edge Function)에서 SAFETY_CHECK 타입을 감지하여 프롬프트를 강제합니다.
        // 클라이언트에서는 분석할 내용만 content에 담아 보냅니다.
        const responseText = await callAI({ content, type: 'SAFETY_CHECK' });

        // JSON 부분만 추출 (서버 응답이 텍스트 형태일 경우 대비)
        const jsonMatch = responseText.match(/\{.*\}/s);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return { is_appropriate: true, reason: '' };
    } catch (err) {
        console.error('AI Safety Check Error:', err);
        // 오류 발생 시에는 시스템 중단 방지를 위해 통과시키되, 1단계 로컬 필터가 있으므로 안전합니다.
        return { is_appropriate: true, reason: '' };
    }
};
