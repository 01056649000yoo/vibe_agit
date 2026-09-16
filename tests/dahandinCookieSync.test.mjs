import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoster, looksLikeCode, computeCookieDeltaPoints } from '../src/lib/dahandinRoster.js';

/*
 * 다했니 연동의 순수 로직 검사.
 * 핵심: ① 붙여넣기가 다양한 형식을 자동 인식한다, ② 쿠키는 누적값이라 증가분만 지급한다.
 */

test('붙여넣기 — 탭·쉼표·공백 구분을 모두 인식한다', () => {
    const text = [
        '김민수\tABC123',
        '이영희, DEF456',
        '박철수    GHI789'
    ].join('\n');
    const { rows } = parseRoster(text);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], { name: '김민수', code: 'ABC123' });
    assert.deepEqual(rows[1], { name: '이영희', code: 'DEF456' });
    assert.deepEqual(rows[2], { name: '박철수', code: 'GHI789' });
});

test('붙여넣기 — 코드가 앞에 와도 코드 모양으로 가려낸다', () => {
    const { rows } = parseRoster('6CHMT29NR\t김단우');
    assert.deepEqual(rows[0], { name: '김단우', code: '6CHMT29NR' });
});

test('붙여넣기 — 빈 줄은 건너뛰고, 코드 없는 줄은 오류로 모은다', () => {
    const { rows, errors } = parseRoster('김민수 ABC123\n\n이상한줄\n');
    assert.equal(rows.length, 1);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].line, 3);
});

test('붙여넣기 — 같은 코드가 두 줄이면 첫 줄만 남긴다', () => {
    const { rows } = parseRoster('김민수 ABC123\n다른이름 ABC123');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, '김민수');
});

test('looksLikeCode — 한글 이름은 코드가 아니다', () => {
    assert.equal(looksLikeCode('김단우'), false);
    assert.equal(looksLikeCode('6CHMT29NR'), true);
    assert.equal(looksLikeCode('12345'), false); // 숫자만은 코드로 보지 않는다(글자 포함 필요)
    assert.equal(looksLikeCode('ab'), false);     // 너무 짧다
});

test('delta 지급 — 늘어난 쿠키만큼만 준다', () => {
    // 28쿠키인데 지난번 20까지 반영 → 8쿠키 증가 × 10P = 80P
    assert.equal(computeCookieDeltaPoints(28, 20, 10), 80);
});

test('delta 지급 — 쿠키가 줄거나 그대로면 0 (환불·차감 없음)', () => {
    assert.equal(computeCookieDeltaPoints(20, 28, 10), 0); // 다했니에서 쿠키를 썼어도 포인트를 뺏지 않는다
    assert.equal(computeCookieDeltaPoints(28, 28, 10), 0); // 변화 없음
});

test('delta 지급 — 첫 정산(기준선 0)은 누적 전량을 준다', () => {
    assert.equal(computeCookieDeltaPoints(28, 0, 10), 280);
});

test('delta 지급 — 잘못된 값은 0으로 안전하게 처리한다', () => {
    assert.equal(computeCookieDeltaPoints(NaN, 0, 10), 0);
    assert.equal(computeCookieDeltaPoints(10, 0, -5), 0);
});
