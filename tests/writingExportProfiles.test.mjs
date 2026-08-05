import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getWritingExportProfile,
    toWritingExportDocumentEntries,
    toWritingExportExcelRows
} from '../src/modules/writing/export/writingExportProfiles.js';

const READING_LOG = {
    student_code: '7',
    student_name: '김학생',
    post_title: '내가 발견한 용기',
    content: '책을 읽고 용기에 대해 생각했다.',
    source_title: '용감한 아이',
    source_authors: ['작가 A'],
    visibility: 'private',
    review_status: 'commented',
    teacher_comment: '생각이 잘 드러나요.',
    created_at: '2026-08-05T01:00:00Z',
    updated_at: '2026-08-05T02:00:00Z'
};

test('독서록 엑셀 프로필은 책 정보·검토 정보·본문을 한 행으로 만든다', () => {
    const [row] = toWritingExportExcelRows([READING_LOG], 'reading_log');
    assert.equal(row.작성자, '김학생');
    assert.equal(row.책제목, '용감한 아이');
    assert.equal(row.책저자, '작가 A');
    assert.equal(row.선생님확인, '선생님 한마디 있음');
    assert.equal(row.선생님한마디, '생각이 잘 드러나요.');
    assert.equal(row.내용, READING_LOG.content);
});

test('독서록 구글 문서 프로필은 학생별 묶음과 책 제목 소제목을 만든다', () => {
    const [entry] = toWritingExportDocumentEntries([READING_LOG], 'reading_log');
    assert.equal(entry.group, '김학생 학생의 독서록');
    assert.match(entry.heading, /용감한 아이/);
    assert.ok(entry.metadata.some((line) => line.includes('선생님 한마디')));
    assert.equal(entry.content, READING_LOG.content);
});

test('새 콘텐츠 프로필이 아직 없어도 공용 과제형 안전 프로필로 내보낼 수 있다', () => {
    const profile = getWritingExportProfile('future_journal');
    assert.equal(profile.id, 'future_journal');
    assert.equal(profile.sheetName, '글 모음');
});

