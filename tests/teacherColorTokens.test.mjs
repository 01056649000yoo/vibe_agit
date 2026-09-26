import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/*
 * 교사 화면 색 정리(2026-09-26). 글자 크기(`teacherTypeScale.test.mjs` 의 MIGRATED)와 같은 방식으로,
 * 정리를 마친 화면을 여기 적고 **회색·검정·테두리 색을 손으로 적지 못하게** 한다.
 * 이 색들은 디자인 토큰(--ui-ink-*·--ui-border·--ui-page·--ui-surface-muted)과 같거나 거의 같다.
 * 보라·분홍·주황처럼 맞는 토큰이 없는 색은 아직 남아 있다 — 토큰을 정한 뒤 이 목록에 더한다.
 */
const MIGRATED = [
    'src/components/teacher/MissionForm.jsx'
];

const NEUTRAL_HEX = [
    'E2E8F0', 'F8FAFC', '64748B', '94A3B8', 'F1F5F9', '1E293B', '0F172A', 'CBD5E1',
    '2C3E50', '2D3436', '7F8C8D', '636E72', '6B7280', '95A5A6', 'BDC3C7', 'F8F9FA',
    'E9ECEF', 'E2E6EA', 'E0E0E0', 'DFE6E9', 'ECF0F1', 'DDD'
];

test('색을 정리한 교사 화면은 회색·검정·테두리 색을 토큰으로만 쓴다', async () => {
    const pattern = new RegExp(`#(${NEUTRAL_HEX.join('|')})\\b`, 'i');
    for (const file of MIGRATED) {
        const source = await readFile(file, 'utf8');
        const found = source.split('\n').map((line, index) => [index + 1, line]).filter(([, line]) => pattern.test(line));
        assert.deepEqual(found.map(([line]) => line), [], `${file} 에 손으로 적은 회색이 있습니다 — var(--ui-...) 를 쓰세요.`);
    }
});
