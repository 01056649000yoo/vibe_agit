/**
 * 댓글을 **글자 내용**으로 살피는 단 하나의 자리(2026-10-21).
 *
 * 왜 만들었나:
 *   예전 검사는 느낌표·물음표·물결 같은 **기호까지 글자로 세어** 반복을 찾았다. 그래서
 *   `정말 재밌어요!!!!!!` 처럼 감정을 담은 댓글이 "같은 말을 반복했다"며 막혔다.
 *   기호와 이모티콘, 웃음·울음 자모(ㅋㅎㅠㅜ)를 걷어 낸 **실제 낱말**만 보고 판단한다.
 *
 * 서버(`vibe-ai`)와 브라우저(`usePostInteractions`)가 이 파일을 함께 쓴다. 두 곳에서 따로 적으면
 * 한쪽만 고쳐져 화면과 서버의 판정이 어긋난다. `scripts/sync-edge-shared.sh` 가 이 파일도 함께 올린다.
 * 반환은 **이유 코드**뿐이다 — 아이에게 보이는 말은 부르는 쪽이 정한다.
 */

/** 글 같지 않은 글(자판을 두드린 것)을 가린다. `ㅁ어라너리머리마ㅓㄹ어` 같은 것. 글쓰기 검사와 같은 기준. */
export function looksLikeGibberish(text) {
    const hangul = text.match(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g) ?? [];
    if (hangul.length < 20) return false;

    const loneJamo = text.match(/[ㄱ-ㅎㅏ-ㅣ]/g) ?? [];
    if (loneJamo.length / hangul.length >= 0.15) return true;

    const longestRun = (text.match(/[가-힣ㄱ-ㅎㅏ-ㅣ]+/g) ?? [])
        .reduce((longest, chunk) => Math.max(longest, chunk.length), 0);
    return longestRun >= 25;
}

/** 웃음·울음 자모(ㅋㅋ, ㅎㅎ, ㅠㅠ, ㅜㅜ, ㅡㅡ)는 감정 표현이라 글자 수나 반복에서 뺀다. */
const withoutLaughter = (text) => text.replace(/[ㅋㅎㅠㅜㅡ]+/g, ' ');

/** 낱말(한글 음절·영문·숫자)만 이은 글. 기호·이모티콘·공백·홀로 선 자모는 모두 뺀다. */
export const commentWords = (text) => (withoutLaughter(String(text ?? '')).match(/[가-힣A-Za-z0-9]/g) ?? []).join('');

/**
 * 댓글이 글로서 문제 있으면 이유 코드를, 괜찮으면 null.
 *   'short'      공백을 빼고 8자 미만(기호 포함 — 예전 기준 그대로)
 *   'long'       200자 초과
 *   'no_words'   낱말이 하나도 없음(`!!!!!!!!`, `????`, `ㅋㅋㅋㅋㅋ`, 이모티콘만)
 *   'repeat'     같은 낱말·글자 반복(기호가 아니라 **낱말**이 반복될 때만)
 *   'gibberish'  자판을 두드린 글
 */
export function commentTextIssue(text, { lowEffort = new Set() } = {}) {
    const trimmed = String(text ?? '').trim();
    const compact = trimmed.replace(/\s+/g, '');
    if (compact.length < 8) return 'short';
    if (trimmed.length > 200) return 'long';
    if (lowEffort.has(compact.toLowerCase())) return 'short';

    const words = commentWords(trimmed);
    if (words.length < 3) return 'no_words';
    if (/^(.)\1{5,}$/u.test(words) || /(.{1,8})\1{3,}/u.test(words)) return 'repeat';
    if (looksLikeGibberish(withoutLaughter(trimmed))) return 'gibberish';
    return null;
}
