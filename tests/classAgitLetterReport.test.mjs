import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { missionFormatLabel, missionFormatNote } from '../src/modules/class-agit/selection/missionFormat.js';

/*
 * 우리반 아지트 전시·문집에 편지와 보고서(사진 없는 것)를 담는다(2026-10-20, 20261400).
 * 담을 수 있는 종류의 기준은 서버 함수 하나(class_agit_exhibitable_format_v1)이고, 화면은 서버가 준 supported 를 따른다.
 */
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('미션 목록은 편지·보고서를 이름으로 보여 주고, 모르는 종류만 기타 장르로 둔다', () => {
    assert.equal(missionFormatLabel('poem'), '시');
    assert.equal(missionFormatLabel('prose'), '글');
    assert.equal(missionFormatLabel('letter'), '편지');
    assert.equal(missionFormatLabel('report'), '보고서');
    assert.equal(missionFormatLabel('meeting'), '기타 장르');
    assert.match(missionFormatNote('report'), /사진은 글만 담겨요/);
    assert.equal(missionFormatNote('letter'), '');
});

test('두 미션 선택 화면은 같은 이름 도우미를 쓴다(한쪽만 옛 이름으로 남지 않게)', async () => {
    for (const path of ['src/modules/class-agit/selection/MissionList.jsx', 'src/modules/class-agit/selection/MissionBulkPicker.jsx']) {
        const source = await read(path);
        assert.match(source, /missionFormatLabel\(mission\.format\)/, path);
        assert.doesNotMatch(source, /mission\.format === 'poem'/, `${path} 에 옛 이름 표가 남았습니다.`);
    }
});

test('서버 마이그레이션은 허용 기준을 한 함수로 모으고 사진 보고서·meeting 을 막는다', async () => {
    const sql = await read('supabase/migrations/20261400_class_agit_letter_report_sources.sql');
    assert.match(sql, /class_agit_exhibitable_format_v1[\s\S]*?'prose','poem','letter','report'/);
    // 예전 복사본(prose, poem 두 가지만)이 어느 함수에도 남지 않아야 한다.
    assert.doesNotMatch(sql, /IN\s*\(\s*'prose'\s*,\s*'poem'\s*\)/);
    assert.match(sql, /class_agit_report_has_photo_v1\(v_structured\)\s*THEN RETURN NULL/);
    assert.doesNotMatch(sql, /'meeting'\s*\)?\s*THEN\s+'(letter|report)'/);
});
