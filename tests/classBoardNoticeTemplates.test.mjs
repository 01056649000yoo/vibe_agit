import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    DEFAULT_NOTICE_TEMPLATES,
    MAX_NOTICE_TEMPLATE_BODY,
    MAX_NOTICE_TEMPLATE_NAME,
    NOTICE_TEMPLATE_SLOTS,
    isNoticeTemplateEmpty,
    noticeTemplateLabel,
    normalizeNoticeTemplates,
    validateNoticeTemplate,
    withNoticeTemplateAt,
} from '../src/modules/tool/class-board/widgets/notice-board/noticeTemplates.js';

const migration = readFileSync('supabase/migrations/20261274_class_board_notice_templates.sql', 'utf8');
const composer = readFileSync('src/modules/tool/class-board/widgets/notice-board/NoticeComposer.jsx', 'utf8');

test('저장된 값이 무엇이든 화면은 언제나 세 칸을 받는다', () => {
    for (const raw of [null, undefined, 'string', 42, {}, [], [{ name: 'a', body: 'b' }]]) {
        const list = normalizeNoticeTemplates(raw);
        assert.equal(list.length, NOTICE_TEMPLATE_SLOTS, `${JSON.stringify(raw)} 에서 칸 수가 어긋납니다.`);
        for (const item of list) {
            assert.equal(typeof item.name, 'string');
            assert.equal(typeof item.body, 'string');
        }
    }
    // 칸보다 많이 저장돼 있어도 앞의 세 칸만 쓴다.
    const many = normalizeNoticeTemplates(Array.from({ length: 9 }, (_, i) => ({ name: `n${i}`, body: `b${i}` })));
    assert.equal(many.length, NOTICE_TEMPLATE_SLOTS);
    assert.equal(many[2].name, 'n2');
});

test('이름과 본문은 한도 안으로 잘리고 이름이 없으면 칸 번호로 부른다', () => {
    const [first] = normalizeNoticeTemplates([{ name: '가'.repeat(50), body: '나'.repeat(MAX_NOTICE_TEMPLATE_BODY + 10) }]);
    assert.equal(first.name.length, MAX_NOTICE_TEMPLATE_NAME);
    assert.equal(first.body.length, MAX_NOTICE_TEMPLATE_BODY);

    assert.equal(noticeTemplateLabel({ name: '오늘 알림' }, 0), '오늘 알림');
    assert.equal(noticeTemplateLabel({ name: '   ' }, 1), '서식 2');
    assert.equal(noticeTemplateLabel(null, 2), '서식 3');
});

test('내용이 없는 칸은 빈 칸이다 — 이름만 적어 두면 불러올 것이 없다', () => {
    assert.equal(isNoticeTemplateEmpty({ name: '', body: '' }), true);
    assert.equal(isNoticeTemplateEmpty({ name: '이름만', body: '   \n ' }), true);
    assert.equal(isNoticeTemplateEmpty({ name: '', body: '준비물' }), false);
});

test('한 칸만 바꿔도 칸 수와 다른 칸은 그대로다', () => {
    const before = normalizeNoticeTemplates(DEFAULT_NOTICE_TEMPLATES);
    const after = withNoticeTemplateAt(before, 1, { name: '새 이름', body: '새 내용' });
    assert.equal(after.length, NOTICE_TEMPLATE_SLOTS);
    assert.deepEqual(after[0], before[0]);
    assert.deepEqual(after[2], before[2]);
    assert.equal(after[1].name, '새 이름');

    // 칸 밖을 가리키면 아무것도 바꾸지 않는다.
    assert.deepEqual(withNoticeTemplateAt(before, -1, { body: 'x' }), before);
    assert.deepEqual(withNoticeTemplateAt(before, NOTICE_TEMPLATE_SLOTS, { body: 'x' }), before);
});

test('빈 내용은 서식으로 저장하지 않는다', () => {
    assert.match(validateNoticeTemplate({ name: '이름', body: '   ' }), /내용이 없습니다/);
    assert.equal(validateNoticeTemplate({ name: '', body: '준비물' }), '');
    assert.match(validateNoticeTemplate({ name: '가'.repeat(MAX_NOTICE_TEMPLATE_NAME + 1), body: 'x' }), /이름/);
    assert.match(validateNoticeTemplate({ body: 'x'.repeat(MAX_NOTICE_TEMPLATE_BODY + 1) }), /2000자/);
});

test('기본 서식은 백지를 면하게 하고 칸 수 안에 들어간다', () => {
    // 백지로 두면 아무도 채우지 않는다 — 이 저장소에 이미 그 기록이 있다.
    assert.ok(DEFAULT_NOTICE_TEMPLATES.length > 0);
    assert.ok(DEFAULT_NOTICE_TEMPLATES.length <= NOTICE_TEMPLATE_SLOTS);
    for (const template of DEFAULT_NOTICE_TEMPLATES) {
        assert.equal(validateNoticeTemplate(template), '');
    }
});

test('칸 수 한도는 화면 코드와 DB CHECK 가 같은 값을 쓴다', () => {
    // 두 곳이 어긋나면 화면은 3칸을 보내는데 DB 가 거절하거나, 그 반대가 된다.
    assert.match(migration, new RegExp(`jsonb_array_length\\(notice_templates\\) <= ${NOTICE_TEMPLATE_SLOTS}`));
    assert.match(migration, /jsonb_typeof\(notice_templates\) = 'array'/);
    // 옛 문자열 배열이 섞이지 않도록 객체·문자열 형태까지 DB 가 지킨다.
    assert.match(migration, /\$\[\*\] \? \(@\.type\(\) != "object"\)/);
    assert.match(migration, /\$\[\*\]\.body \? \(@\.type\(\) != "string"\)/);
    // 새 표를 만들지 않고 profiles 열을 쓴다(RLS 가 이미 본인만 읽고 쓰도록 잠가 둔다).
    assert.match(migration, /ALTER TABLE public\.profiles/);
    assert.doesNotMatch(migration, /CREATE TABLE/);
});

test('불러오기는 입력칸만 채우고 저장하지 않는다', () => {
    // 불러온 즉시 저장되면 교실 화면에 빈 틀이 그대로 걸린다.
    assert.match(composer, /const applyTemplate = \(template\) => \{/);
    assert.match(composer, /setState\(\(current\) => \(\{ \.\.\.current, body: template\.body \}\)\)/);
    const applyBlock = composer.split('const applyTemplate')[1].split('const persistTemplates')[0];
    assert.doesNotMatch(applyBlock, /write\(|saveNotice/);
    // 쓰던 글이 있으면 먼저 물어본다.
    assert.match(applyBlock, /dirty && !window\.confirm/);
    // 펼친 뒤에야 서버에서 읽는다.
    assert.match(composer, /if \(templates \|\| templateBusy\) return;/);
});
