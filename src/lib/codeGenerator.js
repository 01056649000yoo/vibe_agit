// 학생 로그인 코드, 학급 초대 코드 등 사람이 손으로 옮겨 적는 코드용 생성기.
// O/0, I/1, L 처럼 시각적으로 혼동되는 글자는 처음부터 제외한다.
// 로그인 코드는 비밀번호 구실을 하므로 예측 가능한 Math.random 대신 암호학적 난수를 쓴다
// (KISA 보안기능: 적절하지 않은 난수 값 사용, 2026-09-24 보안 점검).
const UNAMBIGUOUS_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// 256 을 글자 수로 나눈 나머지만큼은 버려야 글자마다 뽑힐 확률이 같다(모듈로 치우침 방지).
const UNBIASED_LIMIT = 256 - (256 % UNAMBIGUOUS_ALPHABET.length);

export const generateUnambiguousCode = (length) => {
    let code = '';
    const bytes = new Uint8Array(length * 2);
    while (code.length < length) {
        globalThis.crypto.getRandomValues(bytes);
        for (const byte of bytes) {
            if (byte >= UNBIASED_LIMIT) continue;
            code += UNAMBIGUOUS_ALPHABET.charAt(byte % UNAMBIGUOUS_ALPHABET.length);
            if (code.length === length) break;
        }
    }
    return code;
};
