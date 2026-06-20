// 학생 로그인 코드, 학급 초대 코드 등 사람이 손으로 옮겨 적는 코드용 생성기.
// O/0, I/1, L 처럼 시각적으로 혼동되는 글자는 처음부터 제외한다.
const UNAMBIGUOUS_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const generateUnambiguousCode = (length) => {
    let code = '';
    for (let i = 0; i < length; i++) {
        code += UNAMBIGUOUS_ALPHABET.charAt(Math.floor(Math.random() * UNAMBIGUOUS_ALPHABET.length));
    }
    return code;
};
