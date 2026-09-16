// 다했니 연동의 순수 로직(붙여넣기 파싱·delta 계산). 화면·네트워크와 분리해 테스트한다.
//
// 붙여넣기 파싱:
//   교사가 엑셀/표에서 "이름  코드" 를 복사해 붙여넣으면 바로 인식한다. 구분자는 탭·쉼표·
//   여러 칸 공백을 모두 허용한다. 이름과 코드의 순서가 바뀌어도(코드가 앞) 코드 모양으로 가려낸다.
//   다했니 학생 코드는 영문/숫자 조합(예: 6CHMT29NR)이라 이 규칙으로 이름과 구분할 수 있다.

/** 다했니 코드로 볼 수 있는 토큰인가(영숫자 4자 이상, 한글 없음). */
export function looksLikeCode(token) {
    return /^[A-Za-z0-9]{4,}$/.test(token) && /[A-Za-z]/.test(token);
}

/**
 * 붙여넣은 텍스트를 {name, code} 목록으로 만든다.
 * @returns {{ rows: Array<{name:string, code:string}>, errors: Array<{line:number, text:string}> }}
 */
export function parseRoster(text) {
    const rows = [];
    const errors = [];
    const seenCodes = new Set();
    const lines = String(text ?? '').split(/\r?\n/);

    lines.forEach((raw, index) => {
        const line = raw.trim();
        if (!line) return;
        // 탭·쉼표·2칸 이상 공백을 구분자로. (이름 안의 한 칸 공백은 살린다.)
        let tokens = line.split(/\t+|,+|\s{2,}/).map((t) => t.trim()).filter(Boolean);
        if (tokens.length < 2) tokens = line.split(/\s+/).map((t) => t.trim()).filter(Boolean);
        if (tokens.length < 2) {
            errors.push({ line: index + 1, text: raw });
            return;
        }

        // 코드 모양 토큰을 찾아 코드로, 나머지를 이름으로.
        let codeIdx = tokens.findIndex(looksLikeCode);
        if (codeIdx === -1) codeIdx = tokens.length - 1; // 못 찾으면 마지막을 코드로 가정
        // eslint-disable-next-line security/detect-object-injection -- codeIdx 는 findIndex 가 준 숫자 인덱스
        const code = tokens[codeIdx];
        const name = tokens.filter((_, i) => i !== codeIdx).join(' ').trim();

        if (!name || !code || !looksLikeCode(code)) {
            errors.push({ line: index + 1, text: raw });
            return;
        }
        if (seenCodes.has(code)) return; // 같은 코드 중복 줄은 첫 줄만
        seenCodes.add(code);
        rows.push({ name, code });
    });

    return { rows, errors };
}

/**
 * 이번 정산에서 지급할 포인트를 계산한다. 쿠키는 누적값이므로 증가분만 준다.
 * @returns {number} 지급 포인트(0 이상)
 */
export function computeCookieDeltaPoints(currentCookie, lastCookie, pointsPerCookie) {
    const cur = Number(currentCookie);
    const last = Number(lastCookie);
    const rate = Number(pointsPerCookie);
    if (!Number.isFinite(cur) || !Number.isFinite(last) || !Number.isFinite(rate)) return 0;
    const delta = Math.max(0, cur - last);
    return delta * Math.max(0, rate);
}
