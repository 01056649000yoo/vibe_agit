import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { splitGuideLead } from '../src/components/teacher/guideFold.js';
import { TEACHER_GUIDES } from '../src/constants/teacherGuides.js';

test('짧은 항목은 나누지 않는다', () => {
    assert.deepEqual(splitGuideLead('현재 운영할 학급을 고릅니다.'), { lead: '현재 운영할 학급을 고릅니다.', rest: '' });
});

test('긴 항목은 첫 문장만 먼저 보이고 나머지는 뒤로 간다(합치면 원문)', () => {
    const text = '`학급 만들기`를 눌러 새 학급을 만듭니다. 학급 이름은 나중에도 바꿀 수 있고, 학생 명단은 학급을 만든 뒤에 따로 등록해야 하며 접속 코드는 그때 자동으로 만들어집니다. 보관한 학급은 지난 학급 목록에서 다시 열 수 있습니다.';
    const { lead, rest } = splitGuideLead(text);
    assert.equal(lead, '`학급 만들기`를 눌러 새 학급을 만듭니다.');
    assert.ok(rest.startsWith('학급 이름은'));
    assert.equal(`${lead} ${rest}`, text);
});

test('강조 표기가 짝이 맞지 않는 자리에서는 자르지 않는다', () => {
    const text = '**먼저 `확정` 을 누릅니다. 그러면** 책이 잠기고 그 뒤에는 고칠 수 없습니다. 그래서 확정하기 전에 미리보기를 꼭 봐 두세요 반드시 확인합니다.';
    const { lead } = splitGuideLead(text);
    assert.equal((lead.match(/\*\*/g) || []).length % 2, 0);
});

test('안내서 전체에서 나눠도 원문이 하나도 사라지지 않는다', () => {
    let splits = 0;
    (function walk(value) {
        if (typeof value === 'string') {
            const { lead, rest } = splitGuideLead(value);
            if (rest) splits += 1;
            assert.equal(`${lead}${rest ? ` ${rest}` : ''}`.replace(/\s+/g, ' '), value.replace(/\s+/g, ' '));
        } else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    })(TEACHER_GUIDES);
    assert.ok(splits > 50, `나뉘는 항목이 너무 적습니다: ${splits}`);
});

test('안내서 상세는 주의사항을 접고, 긴 항목에 더 보기를 둔다', () => {
    const source = readFileSync(new URL('../src/components/teacher/TeacherGuideContent.jsx', import.meta.url), 'utf8');
    assert.match(source, /<details className="teacher-guide__notes-fold"/);
    assert.match(source, /알아 두면 좋은 것 \{activeSection\.notes\.length\}가지 보기/);
    assert.match(source, /<FoldItem text=\{guideStep\} \/>/);
});

test('첫 문장이 강조 표기로 끝나도 거기서 나눈다', () => {
    const text = '**먼저 학생들에게 과제의 목표를 설명합니다.** ' + '학생들이 자료를 살펴보도록 안내하세요 '.repeat(10);
    const { lead, rest } = splitGuideLead(text);
    assert.equal(lead, '**먼저 학생들에게 과제의 목표를 설명합니다.**');
    assert.ok(rest.startsWith('학생들이'));
});
