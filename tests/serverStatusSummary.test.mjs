import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSummary, judgeBackup, judgeCertificates, judgeDisk, judgeRoutine, line } from '../scripts/lib/serverStatus.mjs';

test('백업은 오늘 성공이어야 정상(새벽 5시 전에는 어제 것도 정상)', () => {
    const ctx = { today: '2026-10-04', yesterday: '2026-10-03', hour: 9 };
    assert.equal(judgeBackup('PASS  2026-10-04 04:00:39  백업 20261004', ctx).level, 'ok');
    assert.equal(judgeBackup('PASS  2026-10-03 04:00:39  백업 20261003', ctx).level, 'problem');
    assert.equal(judgeBackup('PASS  2026-10-03 04:00:39  백업 20261003', { ...ctx, hour: 3 }).level, 'ok');
    assert.equal(judgeBackup('FAIL  2026-10-04 04:00:39  드라이브 실패', ctx).level, 'problem');
    assert.equal(judgeBackup('', ctx).level, 'problem');
});

test('루틴 상태: 실패·되돌림·확인 필요만 문제로, 긴 경로는 알림에서 뺀다', () => {
    assert.equal(judgeRoutine('Supabase', 'PASS 2026-10-04 21:44:34 target=self-hosted/v0.8.2 backup=/Users/x/y').detail.includes('/Users'), false);
    for (const state of ['FAILED', 'ROLLED_BACK', 'BLOCKED', 'NEEDS_ATTENTION', 'NEEDS_NODE', 'ATTENTION']) {
        assert.equal(judgeRoutine('x', `${state} 2026-10-04 이유`).level, 'problem', state);
    }
    assert.equal(judgeRoutine('x', 'CURRENT 2026-10-04 최신').level, 'ok');
    assert.equal(judgeRoutine('x', '').level, 'warn');
});

test('디스크·인증서 문턱', () => {
    assert.equal(judgeDisk(77, 63).level, 'ok');
    assert.equal(judgeDisk(20, 63).level, 'warn');
    assert.equal(judgeDisk(8, 63).level, 'problem');
    assert.equal(judgeDisk(77, 90).level, 'problem');
    const now = Date.parse('2026-10-04T00:00:00Z');
    assert.equal(judgeCertificates([{ name: 'a', end: 'Dec 19 21:12:32 2026 GMT' }], { now }).level, 'ok');
    assert.equal(judgeCertificates([{ name: 'a', end: 'Oct 20 00:00:00 2026 GMT' }], { now }).level, 'warn');
    assert.equal(judgeCertificates([{ name: 'a', end: 'Oct 08 00:00:00 2026 GMT' }], { now }).level, 'problem');
    assert.equal(judgeCertificates([], { now }).level, 'warn');
});

test('요약은 문제부터 보이고, 알림 중복 판단은 문제 항목 이름으로만 한다(숫자가 바뀌어도 같은 문제면 다시 안 보냄)', () => {
    const summary = buildSummary([line('디스크', 'problem', '맥 여유 8GB'), line('백업', 'ok', '성공'), line('인증서', 'warn', '20일')]);
    assert.match(summary.text.split('\n')[1], /확인 필요 1건 · 주의 1건/);
    assert.ok(summary.text.indexOf('디스크') < summary.text.indexOf('백업'));
    assert.equal(summary.problemKey, '디스크');
    assert.equal(buildSummary([line('디스크', 'problem', '맥 여유 7GB')]).problemKey, summary.problemKey);
    assert.match(buildSummary([line('백업', 'ok', '성공')]).text, /✅ 모두 정상/);
});

test('점검 스크립트와 오픈클로 스킬은 읽기만 한다(선생님 결정: 알림·묻고 답하기까지만)', () => {
    const script = readFileSync('scripts/server-status-summary.mjs', 'utf8');
    for (const forbidden of [/\['restart'/, /'compose', 'up'/, /\['rm'/, /launchctl/, /\bBREW\b/, /\['(upgrade|install|pull)'/, /'kickstart'/, /bootout/]) {
        assert.doesNotMatch(script, forbidden, `점검 스크립트가 바꾸는 명령을 부릅니다: ${forbidden}`);
    }
    // 텔레그램 받는 사람 번호를 저장소에 적지 않는다(오픈클로 짝짓기에서 그때 읽음).
    assert.match(script, /channel_pairing_allow_entries/);
    assert.doesNotMatch(script, /--target', '\d{6,}/);
    const skill = readFileSync('ops/openclaw/skills/server-status/SKILL.md', 'utf8');
    assert.match(skill, /scripts\/server-status-summary\.mjs/);
    assert.match(skill, /재시작·업데이트·삭제·설정 변경을 하지 않는다/);
    for (const kind of ['brief', 'watch']) {
        const agent = readFileSync(`ops/launchd/com.agit.server-status-${kind}.plist`, 'utf8');
        assert.match(agent, /scripts\/server-status-summary\.mjs/);
    }
    assert.match(readFileSync('ops/launchd/com.agit.server-status-watch.plist', 'utf8'), /--alert-only/);
});
