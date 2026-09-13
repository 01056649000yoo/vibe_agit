import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(file, 'utf8');
const client = read('src/utils/schoolApi.js');
const field = read('src/components/common/SchoolSearchField.jsx');
const fn = read('supabase/functions/neis-meal/index.ts');

const number = (source, pattern, label) => {
    const found = source.match(pattern);
    assert.ok(found, `${label} 을 찾지 못했습니다.`);
    return Number(found[1].replace(/_/g, ''));
};

test('화면이 보내는 간격이 서버가 막는 간격보다 넉넉히 길다', () => {
    /*
     * 2026-09-13 제보: 가입 화면에서 학교를 검색하면
     * "Edge Function returned a non-2xx status code" 가 떴다.
     *
     * 원인은 두 숫자가 어긋난 것이었다 — 화면은 350ms 마다 보내는데 서버는 500ms 안에
     * 두 번 오면 429 로 막는다. 학교 이름을 치다 잠깐 멈출 때마다 걸렸다.
     * 두 숫자는 다른 파일에 살아서 한쪽만 고쳐도 아무 검사도 울지 않았다. 여기서 함께 본다.
     */
    const clientMs = number(client, /SCHOOL_SEARCH_DEBOUNCE_MS = (\d+)/, '화면 대기 시간');
    const serverMs = number(fn, /SEARCH_MIN_INTERVAL_MS = ([\d_]+)/, '서버 최소 간격');
    assert.ok(clientMs > serverMs,
        `화면 대기 ${clientMs}ms 가 서버 간격 ${serverMs}ms 보다 짧거나 같습니다. 치는 도중 429 가 납니다.`);
    // 아슬아슬하면 브라우저·네트워크가 조금만 흔들려도 다시 걸린다.
    assert.ok(clientMs - serverMs >= 100,
        `여유가 ${clientMs - serverMs}ms 뿐입니다. 100ms 이상 두세요.`);
});

test('대기 시간은 한 곳에서만 정한다', () => {
    // 화면이 자기 숫자를 따로 적으면 서버 간격과 다시 어긋난다.
    assert.ok(field.includes('SCHOOL_SEARCH_DEBOUNCE_MS'), '화면이 공용 상수를 쓰지 않습니다.');
    assert.ok(!/setTimeout\([^,]+,\s*\d+\s*\)/.test(field), '화면에 대기 시간을 숫자로 적어 두었습니다.');
});

test('서버가 적어 보낸 이유를 그대로 보여 준다', () => {
    /*
     * supabase-js 는 2xx 가 아니면 어떤 이유든 같은 한 문장만 준다. 서버는 정작
     * "학교 검색은 천천히 이용해 주세요" 처럼 사람이 읽을 말을 적어 보내는데 묻혔다.
     */
    assert.match(client, /error\?\.context\?\.json\?\.\(\)/);
    assert.match(client, /readFunctionError\(error\)/);
});

test('너무 빨리 보낸 것뿐이면 한 번 조용히 다시 묻는다', () => {
    // 429 는 선생님 잘못이 아니다. 오류로 보여 줄 것이 아니라 잠시 뒤 다시 물으면 된다.
    assert.match(client, /const isTooManyRequests = \(error\) => error\?\.context\?\.status === 429;/);
    assert.match(client, /if \(error && isTooManyRequests\(error\)\) \{/);
});
