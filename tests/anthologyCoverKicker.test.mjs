import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { bookCoverKicker, buildBookSavePayload } from '../src/modules/class-agit/anthology/contract.js';
import { buildAnthologyHtml } from '../src/modules/class-agit/anthology/print.js';
import { buildAnthologyDocRequests } from '../src/modules/class-agit/anthology/googleDocExport.js';

const migration = readFileSync('supabase/migrations/20261297_editable_anthology_cover_kicker.sql', 'utf8');
const manager = readFileSync('src/modules/class-agit/anthology/AnthologyManager.jsx', 'utf8');
const edition = (cover_kicker) => ({ version: 1, id: 'e1', draft: true, number: 1, book: {
    title: '우리 책', subtitle: '', cover_kicker, introduction: '', class_label: '햇살반', issue_date: '2026-09-15', grouping: 'custom',
    print: { paper: 'A4', design: 'botanical', layout: 'continuous', body_pt: 12, poem_pt: 14, version: 2 },
    works: [{ sourceId: 'p1', title: '첫 글', author: '하늘', group: '주제', format: 'prose', blocks: ['본문'] }]
} });

test('표지 윗문구는 기존 문집 기본값을 지키고 편집값을 저장한다', () => {
    assert.equal(bookCoverKicker({ book_type: 'class' }), '우리 반의 이야기');
    assert.equal(bookCoverKicker({ book_type: 'personal' }), '나의 글 모음');
    assert.equal(bookCoverKicker({ cover_kicker: '' }), '', '빈 값은 기본 문구로 되살리지 않는다');
    const payload = buildBookSavePayload({ id: 'b1', revision: 1, title: '책', subtitle: '', cover_kicker: '열일곱 개의 마음', introduction: '', class_label: '', issue_date: '', grouping: 'custom', paper_format: 'A4', design_id: 'botanical', page_layout: 'continuous', page_breaks: [], items: [] });
    assert.equal(payload.cover_kicker, '열일곱 개의 마음');
    assert.match(manager, /<label>표지 윗문구<input/);
    assert.match(manager, /placeholder="비워 두면 표지에서 숨깁니다"/);
});

test('수정하거나 비운 윗문구가 PDF와 Google Docs에 똑같이 반영된다', async () => {
    const custom = edition('열일곱 개의 마음');
    assert.match(await buildAnthologyHtml(custom), /열일곱 개의 마음/);
    const requests = buildAnthologyDocRequests(custom).requests;
    assert.ok(requests.some((request) => request.insertText?.text === '열일곱 개의 마음\n'));
    const blankHtml = await buildAnthologyHtml(edition(''));
    assert.doesNotMatch(blankHtml, /우리 반의 이야기|나의 글 모음/);
});

test('DB는 기존값·개인 기본값·저장값을 확정판 스냅샷까지 보존한다', () => {
    assert.match(migration, /ADD COLUMN IF NOT EXISTS cover_kicker TEXT NOT NULL DEFAULT '우리 반의 이야기'/);
    assert.match(migration, /book_type = 'personal'.*cover_kicker = '우리 반의 이야기'/s);
    assert.match(migration, /'cover_kicker',v_book\.cover_kicker/);
    assert.match(migration, /SET cover_kicker=COALESCE\(v_kicker,cover_kicker\)/);
    assert.match(migration, /char_length\(v_kicker\)>60/);
});
