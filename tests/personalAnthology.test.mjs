import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAnthologyHtml } from '../src/modules/class-agit/anthology/print.js';
import { buildAnthologyDocRequests } from '../src/modules/class-agit/anthology/googleDocExport.js';

const migration = readFileSync('supabase/migrations/20261296_personal_anthologies_and_book_designs.sql', 'utf8');
const edition = {
    version: 1, id: 'edition-personal', number: 1,
    book: {
        title: '김하늘의 글 모음', subtitle: '자라난 이야기', introduction: '내 글을 소개합니다.', class_label: '햇살반', issue_date: '2026-09-15',
        book_type: 'personal', owner_student_id: 'student-1', owner_student_name: '김하늘', grouping: 'custom', page_breaks: [],
        print: { paper: 'A4', design: 'storybook', layout: 'work-per-page', body_pt: 12, poem_pt: 14, version: 2 },
        works: [
            { title: '첫 번째 글', author: '김하늘', group: '봄', format: 'prose', kindLabel: '글', excerpt: '', blocks: ['첫 문장'] },
            { title: '두 번째 시', author: '김하늘', group: '여름', format: 'poem', kindLabel: '시', excerpt: '', blocks: ['두 번째 문장'] },
        ]
    }
};

test('개인 문집은 목차에 지은이를 싣고 작품 본문에서는 같은 이름을 반복하지 않는다', async () => {
    const html = await buildAnthologyHtml(edition);
    assert.match(html, /나의 글 모음/);
    assert.match(html, /김하늘 지음/);
    assert.match(html, /<h1>작가의 말<\/h1>/);
    assert.match(html, /anthology-personal \.pdf-entry__author/);
    assert.match(html, /data-toc-row="0"><span>첫 번째 글 · 김하늘/);
    assert.match(html, /data-toc-row="1"><span>두 번째 시 · 김하늘/);

    const { requests } = buildAnthologyDocRequests(edition);
    const text = requests.flatMap((request) => request.insertText?.text || []).join('');
    assert.match(text, /김하늘 지음/);
    assert.match(text, /작가의 말/);
    assert.match(text, /1\. 첫 번째 글 · 김하늘/);
    assert.match(text, /2\. 두 번째 시 · 김하늘/);
});

test('개인 문집은 학생당 하나이며 다른 학생 글과 다른 학생의 열람을 서버에서 막는다', () => {
    assert.match(migration, /UNIQUE INDEX[\s\S]*WHERE book_type='personal'/);
    assert.match(migration, /v_source->>'student_id'[\s\S]*v_book\.owner_student_id/);
    assert.match(migration, /b\.book_type='class' OR b\.owner_student_id=v_student/g);
    assert.match(migration, /학급 문집은 20권까지/);
});

test('개인 문집 생성 시 학생을 먼저 고르고 이후 작품 찾기는 그 학생으로 고정한다', () => {
    const manager = readFileSync('src/modules/class-agit/anthology/AnthologyManager.jsx', 'utf8');
    const picker = readFileSync('src/modules/class-agit/selection/StudentBulkPicker.jsx', 'utf8');
    assert.match(manager, /학생 개인 문집 만들기/);
    assert.match(manager, /ownerStudent=\{ownerStudent\}/);
    assert.match(manager, /목차에는 지은이를 표시하고, 각 작품 본문에서는 같은 이름을 반복하지 않습니다/);
    assert.match(manager, /문집 종류는 만든 뒤 바꿀 수 없습니다/);
    assert.match(picker, /student\.id === fixedStudent\.id/);
});
