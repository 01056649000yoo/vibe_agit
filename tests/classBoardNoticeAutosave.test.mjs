import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    findPreviousNoticeDate,
    isHeldNotice,
    NOTICE_AUTOSAVE_DELAY_MS,
    shouldAutoSaveNotice,
} from '../src/modules/tool/class-board/widgets/notice-board/noticeAutosave.js';

// 2026-09-29 선생님 요청: 알림장은 치는 대로 저장하고, 어제 쓴 알림을 가져와 고친다.

test('입력을 멈추면 저장하고, 서버처럼 앞뒤 빈칸은 잘라 견준다', () => {
    assert.equal(shouldAutoSaveNotice('준비물: 풀', ''), 'save');
    assert.equal(shouldAutoSaveNotice('준비물: 풀 ', '준비물: 풀'), 'unchanged', '끝 빈칸만 다르면 저장하지 않는다');
    assert.equal(shouldAutoSaveNotice('준비물: 풀\n', '준비물: 풀'), 'unchanged');
    assert.equal(shouldAutoSaveNotice('준비물: 가위', '준비물: 풀'), 'save');
    assert.ok(NOTICE_AUTOSAVE_DELAY_MS >= 800 && NOTICE_AUTOSAVE_DELAY_MS <= 3000, '치는 동안 매 글자 저장하지 않되, 오래 기다리지도 않는다');
});

test('빈 입력칸은 저장하지 않는다 — 서버는 빈 내용을 그날 알림 지우기로 받는다', () => {
    assert.equal(shouldAutoSaveNotice('', '준비물: 풀'), 'empty');
    assert.equal(shouldAutoSaveNotice('   \n ', '준비물: 풀'), 'empty');
    assert.equal(shouldAutoSaveNotice('', ''), 'unchanged');
});

test('서식·지난 알림으로 채운 내용은 한 글자라도 고치기 전에는 붙잡아 둔다', () => {
    assert.equal(isHeldNotice('서식 내용', '서식 내용'), true);
    assert.equal(isHeldNotice('서식 내용!', '서식 내용'), false);
    assert.equal(isHeldNotice('아무 내용', null), false);
    assert.equal(isHeldNotice('', ''), true);
});

test('가져올 지난 알림은 보고 있는 날보다 앞선 날 중 가장 최근이다(주말·방학을 건넌다)', () => {
    const recent = [
        { date: '2026-09-29', preview: '오늘' },
        { date: '2026-09-25', preview: '금요일' },
        { date: '2026-09-24', preview: '목요일' },
    ];
    assert.equal(findPreviousNoticeDate(recent, '2026-09-29'), '2026-09-25', '월요일이면 지난 금요일');
    assert.equal(findPreviousNoticeDate(recent, '2026-09-25'), '2026-09-24', '지난 날을 보고 있으면 그보다 앞선 날');
    assert.equal(findPreviousNoticeDate(recent, '2026-09-24'), null);
    assert.equal(findPreviousNoticeDate([], '2026-09-29'), null);
    assert.equal(findPreviousNoticeDate(['2026-09-20', '2026-09-28'], '2026-09-29'), '2026-09-28', '순서가 섞여 와도 가장 최근');
});

test('화면이 규칙 파일을 쓰고, 한 번에 하나만 보내며, 닫을 때 쓰던 글을 남긴다', async () => {
    const composer = await readFile('src/modules/tool/class-board/widgets/notice-board/NoticeComposer.jsx', 'utf8');
    assert.match(composer, /from '\.\/noticeAutosave'/);
    assert.match(composer, /setTimeout\([\s\S]*NOTICE_AUTOSAVE_DELAY_MS\)/);
    assert.match(composer, /if \(inFlightRef\.current\) await inFlightRef\.current/, '보내는 중이면 끝난 뒤 다시 본다');
    // 자동 저장 뒤 입력칸을 덮지 않는다 — 서버가 끝 빈칸을 잘라 돌려주므로 치던 띄어쓰기가 사라진다.
    assert.match(composer, /replaceBody \? \{ body: savedBody \} : \{\}/);
    // 창을 닫을 때(부품이 사라질 때) 저장 안 된 글을 보낸다.
    assert.match(composer, /useEffect\(\(\) => \(\) => \{[\s\S]*api\.saveNotice\(classId, date, body\)/);
    // 다른 날짜로 가기 전에 먼저 저장한다.
    assert.match(composer, /const switchDate = async \(date\) => \{[\s\S]*await flush\(\);[\s\S]*load\(date\)/);
    // 지난 알림은 목록의 미리보기가 아니라 그 날짜를 한 번 더 읽어 전체를 가져온다.
    assert.match(composer, /const importPrevious = async \(\) => \{[\s\S]*api\.getNotices\(classId, previousDate\)/);
});
