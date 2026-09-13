import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const list = readFileSync('src/components/teacher/MissionList.jsx', 'utf8');

test('미션 카드의 조작 단추는 모두 글자를 함께 보여 준다', () => {
    /*
     * 2026-09-13 지적: 수정·보관·삭제에는 이름이 붙어 있는데 **연구소 연결만 아이콘뿐**이라
     * 무엇인지 알 수 없었다. 아이콘만으로는 처음 보는 사람이 못 읽는다.
     */
    const labels = ['✏️ 수정', '📂 보관', '🗑️ 삭제', '🧪 연구소 연결'];
    labels.forEach((label) => {
        assert.ok(list.includes(label), `미션 카드에 "${label}" 단추가 없습니다.`);
    });
});

test('조작 단추는 같은 모양을 쓴다', () => {
    // 하나만 다른 모양이면 줄이 어긋나고, 그 하나가 다른 것처럼 보인다.
    const shared = [...list.matchAll(/\.\.\.CARD_ACTION_BUTTON_STYLE/g)];
    assert.ok(shared.length >= 4, `공용 모양을 쓰는 단추가 ${shared.length}개뿐입니다.`);
    // 연구소 단추가 공용 모양을 쓰는지 그 자리에서 확인한다.
    const labAt = list.indexOf('🧪 연구소 연결');
    const before = list.slice(Math.max(0, labAt - 600), labAt);
    assert.match(before, /\.\.\.CARD_ACTION_BUTTON_STYLE/);
});
