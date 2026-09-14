import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

/*
 * 2026-09-14 제보: 전시 공개 주소를 카카오톡으로 보내면 모바일에서
 * "공유가 끝났거나 지금 볼 수 없는 전시입니다" 로 떴다. 문자로 보내면 멀쩡했다.
 *
 * 원인: 카카오톡 안드로이드에서 크롬으로 넘길 때 쓰는 `intent://` 주소가 `#` 뒷부분을 담지 못하는데,
 * 전시 열쇠가 바로 거기 있었다. 종료된 게 아니라 **열쇠를 잃은 것**이었다.
 *
 * 글로만 검사하면 조건이 뒤집혀도 통과하므로, 스크립트를 **실제로 돌려서** 어디로 갔는지 본다.
 */
const SHARE_TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

const KAKAO_ANDROID = 'mozilla/5.0 (linux; android 14) applewebkit/537.36 chrome/126 mobile safari/537.36 kakaotalk/10.5.0';
const KAKAO_IOS = 'mozilla/5.0 (iphone; cpu iphone os 17_5 like mac os x) applewebkit/605.1.15 kakaotalk/10.5.0';
const PLAIN_ANDROID = 'mozilla/5.0 (linux; android 14) applewebkit/537.36 chrome/126 mobile safari/537.36';

const script = await readFile('public/kakao-browser.js', 'utf8');

/** 스크립트를 가짜 브라우저에서 돌리고, 주소를 옮겼는지·알림을 띄웠는지 돌려준다. */
const run = ({ userAgent, pathname, hash = '', search = '' }) => {
    const result = { movedTo: null, alerted: null };
    const location = {
        host: 'xn--vz0ba242ncqcba79xhwx.site',
        pathname,
        search,
        hash,
        get href() { return `https://${this.host}${pathname}${search}${hash}`; },
        set href(value) { result.movedTo = value; },
    };
    const context = {
        navigator: { userAgent },
        location,
        window: { alert: (message) => { result.alerted = message; } },
    };
    vm.createContext(context);
    vm.runInContext(script, context);
    return result;
};

test('전시 공개 주소는 카카오톡에서도 열쇠를 잃지 않는다', () => {
    const shared = run({ userAgent: KAKAO_ANDROID, pathname: '/exhibition', hash: `#${SHARE_TOKEN}` });

    assert.equal(shared.movedTo, null, '전시 주소를 바깥 브라우저로 넘기면 열쇠가 사라진다');
    assert.equal(shared.alerted, null, '공개 전시는 로그인을 쓰지 않으므로 안내창도 띄우지 않는다');

    // 아이폰에서도 엉뚱한 로그인 안내가 뜨면 안 된다.
    const iphone = run({ userAgent: KAKAO_IOS, pathname: '/exhibition', hash: `#${SHARE_TOKEN}` });
    assert.equal(iphone.alerted, null, '전시 주소에서 구글 로그인 안내가 뜬다');
    assert.equal(iphone.movedTo, null);

    /*
     * 열쇠 없이 전시 주소만 열린 경우(주소가 잘려 왔거나 손으로 친 경우)도 마찬가지다.
     * 전시관은 로그인을 쓰지 않으므로 "구글 로그인이 필요합니다" 는 틀린 안내이고,
     * 안드로이드에서 크롬으로 넘겨도 얻을 것이 없다.
     */
    const bareIphone = run({ userAgent: KAKAO_IOS, pathname: '/exhibition' });
    assert.equal(bareIphone.alerted, null, '전시관은 로그인을 쓰지 않는데 로그인 안내가 뜬다');
    const bareAndroid = run({ userAgent: KAKAO_ANDROID, pathname: '/exhibition' });
    assert.equal(bareAndroid.movedTo, null, '로그인을 쓰지 않는 전시관을 바깥 브라우저로 넘기고 있다');
});

test('`#` 뒤에 내용이 있으면 어떤 주소든 넘기지 않는다', () => {
    // 넘기는 순간 사라지는 값이므로, 앞으로 생길 주소도 자동으로 보호된다.
    const withHash = run({ userAgent: KAKAO_ANDROID, pathname: '/', hash: '#access_token=abc' });
    assert.equal(withHash.movedTo, null, '`#` 내용을 잃으면서 넘기고 있다');

    // `#` 만 있고 내용이 없으면 잃을 것이 없다.
    const emptyHash = run({ userAgent: KAKAO_ANDROID, pathname: '/', hash: '#' });
    assert.match(String(emptyHash.movedTo), /^intent:\/\//);
});

test('로그인이 필요한 보통 화면은 지금처럼 바깥 브라우저로 넘긴다', () => {
    const android = run({ userAgent: KAKAO_ANDROID, pathname: '/', search: '?tool=class-board' });
    assert.match(String(android.movedTo), /^intent:\/\/xn--vz0ba242ncqcba79xhwx\.site\/\?tool=class-board#Intent;/);
    assert.match(String(android.movedTo), /package=com\.android\.chrome/);

    const iphone = run({ userAgent: KAKAO_IOS, pathname: '/' });
    assert.match(String(iphone.alerted), /외부 브라우저/);
    assert.equal(iphone.movedTo, null, 'iOS 는 안내만 하고 주소를 옮기지 않는다');
});

test('카카오톡이 아니면 아무 일도 하지 않는다', () => {
    const plain = run({ userAgent: PLAIN_ANDROID, pathname: '/' });
    assert.equal(plain.movedTo, null);
    assert.equal(plain.alerted, null);

    // 문자로 받아 기본 브라우저로 연 경우 — 실제로 잘 열리던 경로다.
    const sms = run({ userAgent: PLAIN_ANDROID, pathname: '/exhibition', hash: `#${SHARE_TOKEN}` });
    assert.equal(sms.movedTo, null);
});

test('전시 주소의 열쇠는 `#` 뒤에 있다 — 이 전제가 깨지면 위 검사가 헛돈다', async () => {
    const [publicApi, entry] = await Promise.all([
        readFile('src/modules/class-agit/public/publicApi.js', 'utf8'),
        readFile('src/modules/class-agit/public/PublicEntry.jsx', 'utf8'),
    ]);
    assert.match(publicApi, /\$\{origin\}\/exhibition#\$\{token\}/);
    assert.match(entry, /window\.location\.hash\.slice\(1\)/);
});
