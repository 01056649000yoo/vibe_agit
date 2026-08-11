import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getWritingExportProfile,
    toWritingExportDocumentEntries,
    toWritingExportExcelRows
} from '../src/modules/writing/export/writingExportProfiles.js';
import {
    buildWritingPdfHtml,
    collectWritingPdfImagePaths,
    normalizeWritingPdfEntry,
    WRITING_PDF_MAX_ENTRIES
} from '../src/modules/writing/export/writingPdfExport.js';

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

test('일반 글 PDF는 제목·글쓴이·본문을 12포인트 A4 양식으로 만든다', () => {
    const item = {
        작성자: '김학생',
        미션제목: '우리 동네 이야기',
        학생글제목: '<소중한 장소>',
        승인일: '2026-08-11',
        내용: '첫 문단입니다.\n\n둘째 문단입니다.'
    };
    const entry = normalizeWritingPdfEntry(item, 'assignment');
    const html = buildWritingPdfHtml({ items: [item], title: '일반 글 모음' });

    assert.equal(entry.author, '김학생');
    assert.match(html, /@page \{ size: A4 portrait/);
    assert.match(html, /font-size: 12pt/);
    assert.match(html, /pdf-entry--normal/);
    assert.match(html, /&lt;소중한 장소&gt;/);
    assert.match(html, /첫 문단입니다/);
    assert.doesNotMatch(html, /font-size: (?:[0-9]|1[01])pt/);
});

test('보고서 PDF는 칸 구조와 사진·설명을 별도 양식으로 만든다', () => {
    const path = '11111111-1111-1111-1111-111111111111/section-1/photo.webp';
    const item = {
        작성자: '이학생',
        미션제목: '학교 화단 관찰',
        학생글제목: '봉선화가 자라는 모습',
        내용: '',
        _inputTemplate: 'report',
        _structuredContent: {
            template: 'report',
            version: 1,
            sections: [{
                id: 'section-1',
                heading: '관찰 결과',
                body: '새잎이 두 장 나왔습니다.',
                image: {
                    path,
                    caption: '관찰 셋째 날 봉선화',
                    width: 720,
                    height: 540,
                    bytes: 120000,
                    mimeType: 'image/webp'
                }
            }]
        }
    };
    const imageUrls = new Map([[path, 'https://example.test/signed-photo.webp?token=a&b=2']]);
    const html = buildWritingPdfHtml({ items: [item], title: '보고서 모음', imageUrls });

    assert.deepEqual(collectWritingPdfImagePaths([item]), [path]);
    assert.equal(WRITING_PDF_MAX_ENTRIES, 100);
    assert.match(html, /pdf-entry--report/);
    assert.match(html, /report-sheet__section/);
    assert.match(html, /report-sheet__section-body--with-photo/);
    assert.match(html, /report-sheet__photo-frame/);
    assert.match(html, /grid-template-columns: 68mm minmax\(0, 1fr\)/);
    assert.match(html, /width: 68mm/);
    assert.match(html, /object-fit: cover/);
    assert.match(html, /signed-photo.webp\?token=a&amp;b=2/);
    assert.match(html, /관찰 셋째 날 봉선화/);
});

