import { supabase } from '../../../../lib/supabaseClient';

/**
 * AI 맞춤법 검사 — 글 한 편에 한 번.
 *
 * 본문을 보내지 않고 **글 id 만** 보낸다. 서버(Edge Function)가 DB 에서 본인 글을 직접 읽고,
 * 사용 표시를 먼저 선점한 뒤 AI 를 부른다. 그래서 새로고침으로 다시 쓸 수 없다.
 */
export const aiSpellCheckApi = {
    async request({ postId, studentId }) {
        if (!supabase) throw new Error('AI 연결을 준비하고 있어요.');
        if (!postId || !studentId) throw new Error('검사할 글을 찾지 못했어요.');

        const { data, error } = await supabase.functions.invoke('vibe-ai', {
            body: { type: 'SPELL_CHECK', postId, studentId }
        });
        if (error) {
            const message = await readInvokeError(error);
            throw new Error(message);
        }

        const items = Array.isArray(data?.result?.items) ? data.result.items : [];
        return {
            // 글 같지 않아 되돌려보낸 경우다. 이때는 한 번뿐인 기회를 **쓰지 않는다**.
            notWriting: data?.notWriting === true,
            reason: String(data?.reason || ''),
            alreadyUsed: data?.alreadyUsed === true,
            checkedAt: data?.result?.checkedAt || data?.usedAt || null,
            items: items.map((item) => ({
                wrong: String(item?.wrong || ''),
                right: String(item?.right || ''),
                why: String(item?.why || '')
            })).filter((item) => item.wrong && item.right)
        };
    }
};

/** Edge Function 오류는 본문에 담겨 오므로 꺼내서 학생이 읽을 문장으로 만든다. */
async function readInvokeError(error) {
    try {
        const body = await error?.context?.json?.();
        if (body?.error) return String(body.error);
    } catch {
        // 본문이 없으면 기본 문구를 쓴다.
    }
    return error?.message || '맞춤법 검사를 하지 못했어요. 잠시 뒤에 다시 해 주세요.';
}
