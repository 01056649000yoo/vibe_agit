import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    SAMLINK_ORIGIN,
    captureSamlinkConnectRequest,
    isApprovedTeacherProfile,
    isSamlinkTicketRequest,
    samlinkConnectReturnUrl,
    takeSamlinkConnectRequest
} from '../src/modules/tool/samlink/samlinkConnect.js';

// 쌤링크 ↔ 아지트 선생님 계정 연결(2026-10-05). 아지트는 1분짜리 연결표만 넘기고 로그인 토큰은 넘기지 않는다.

const fakeWindow = (href) => {
    const store = new Map();
    const win = {
        location: { href },
        history: { state: null, replaceState: (_state, _title, next) => { win.location.href = new URL(next, href).href; } },
        sessionStorage: {
            getItem: (key) => (store.has(key) ? store.get(key) : null),
            setItem: (key, value) => store.set(key, String(value)),
            removeItem: (key) => store.delete(key)
        }
    };
    return win;
};

test('iframe 연결표 요청은 쌤링크 출처와 그 iframe 창에서 온 것만 받는다', () => {
    const frame = {};
    const ok = { origin: SAMLINK_ORIGIN, source: frame, data: { type: 'samlink:request-ticket' } };
    assert.equal(SAMLINK_ORIGIN, 'https://xn--9y2br3k43n.kr');
    assert.equal(isSamlinkTicketRequest(ok, frame), true);
    assert.equal(isSamlinkTicketRequest({ ...ok, origin: 'https://evil.example' }, frame), false);
    assert.equal(isSamlinkTicketRequest({ ...ok, source: {} }, frame), false);
    assert.equal(isSamlinkTicketRequest({ ...ok, data: { type: 'other' } }, frame), false);
    assert.equal(isSamlinkTicketRequest(ok, null), false);
});

test('쌤링크.kr 에서 온 연결 요청은 주소에서 지우고 로그인 뒤 한 번만 꺼낸다', () => {
    const win = fakeWindow('https://xn--vz0ba242ncqcba79xhwx.site/?samlink-connect=1&x=2#h');
    assert.equal(captureSamlinkConnectRequest(win), true);
    assert.equal(win.location.href, 'https://xn--vz0ba242ncqcba79xhwx.site/?x=2#h');
    assert.equal(takeSamlinkConnectRequest(win), true);
    assert.equal(takeSamlinkConnectRequest(win), false);
    assert.equal(captureSamlinkConnectRequest(fakeWindow('https://xn--vz0ba242ncqcba79xhwx.site/')), false);
});

test('연결표는 # 뒤로만 돌려보내고, 승인된 선생님만 연결을 시작한다', () => {
    assert.equal(samlinkConnectReturnUrl('ab12'), 'https://xn--9y2br3k43n.kr/connect#ticket=ab12');
    assert.equal(isApprovedTeacherProfile({ role: 'TEACHER', is_approved: true }), true);
    assert.equal(isApprovedTeacherProfile({ role: 'ADMIN' }), true);
    assert.equal(isApprovedTeacherProfile({ role: 'TEACHER', is_approved: false }), false);
    assert.equal(isApprovedTeacherProfile({ role: 'TEACHER', is_approved: true, approval_revoked_at: '2026-10-01' }), false);
    assert.equal(isApprovedTeacherProfile({ role: 'STUDENT' }), false);
});

test('아지트는 로그인 토큰이 아니라 연결표 RPC 만 쓰고, DB 는 학생·익명에게 연결표를 주지 않는다', async () => {
    const entry = await readFile('src/modules/tool/samlink/TeacherEntry.jsx', 'utf8');
    const helper = await readFile('src/modules/tool/samlink/samlinkConnect.js', 'utf8');
    const app = await readFile('src/App.jsx', 'utf8');
    for (const source of [entry, helper, app]) {
        assert.doesNotMatch(source, /access_token|getSession\(\)[\s\S]{0,80}postMessage/, '로그인 토큰을 쌤링크로 넘기면 안 됨');
    }
    assert.match(entry, /isSamlinkTicketRequest\(event, frameWindow\)/);
    assert.match(entry, /postMessage\(\{ type: 'samlink:ticket', ticket \}, SAMLINK_ORIGIN\)/);
    assert.match(app, /takeSamlinkConnectRequest\(\)/);

    const sql = await readFile('supabase/migrations/20261368_samlink_account_connect.sql', 'utf8');
    assert.match(sql, /auth_user_role\(\) NOT IN \('TEACHER', 'ADMIN'\)/);
    assert.match(sql, /INTERVAL '1 minute'/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.redeem_samlink_connect_ticket_v1\(TEXT\) TO service_role;/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.redeem_samlink_connect_ticket_v1\(TEXT\) FROM PUBLIC, anon, authenticated;/);
    assert.match(sql, /digest\(v_ticket, 'sha256'\)/, '표에는 해시만');
});
