/*
 * 오픈클로로 텔레그램 보내기 — 받는 사람은 오픈클로와 짝지은 사용자(대화 id 는 저장소에 두지 않는다).
 * 서버 상태 알림(server-status-summary)과 맞춤법 자동 검수 요약(run-weekly-spelling-review --auto)이 같이 쓴다.
 * 오픈클로 범위는 ① 알림 ② 질문 답하기뿐이다 — 여기서 보내는 것도 알림 글뿐이다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const OPENCLAW = existsSync('/opt/homebrew/bin/openclaw') ? '/opt/homebrew/bin/openclaw' : 'openclaw';

const run = (command, args, timeout) => {
    try { return execFileSync(command, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return null; }
};

export const sendTelegram = (text) => {
    const target = run('/usr/bin/sqlite3', ['-readonly', path.join(homedir(), '.openclaw/state/openclaw.sqlite'),
        "select entry from channel_pairing_allow_entries where channel_key='telegram' order by sort_order limit 1"], 20000);
    if (!target) { console.error('텔레그램 받는 사람을 찾지 못함(오픈클로 짝짓기 확인)'); return false; }
    const result = run(OPENCLAW, ['message', 'send', '--channel', 'telegram', '--target', target, '-m', text], 90000);
    if (result === null) { console.error('텔레그램 보내기 실패(오픈클로 게이트웨이 확인)'); return false; }
    return true;
};
