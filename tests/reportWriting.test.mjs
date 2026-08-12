import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    buildReportStructuredContent,
    normalizeReportConfig,
    normalizeReportSections,
    reportSectionsToContent,
    validateReportSubmission,
} from '../src/modules/writing/mission-types/report/reportContent.js';

const [
    reportEditorSource,
    reportDocumentSource,
    writingPdfSource,
    reportPdfSource,
    reportManifestSource,
    studentWritingSource,
    missionSubmitSource,
    reportWritingCss,
    exportSelectSource,
    archiveManagerSource,
    studentManagerSource,
    studentManagerHookSource,
    dataExportSource,
    registrySource,
] = await Promise.all([
    readFile('src/modules/writing/mission-types/report/ReportEditor.jsx', 'utf8'),
    readFile('src/modules/writing/mission-types/report/ReportDocument.jsx', 'utf8'),
    readFile('src/modules/writing/export/writingPdfExport.js', 'utf8'),
    readFile('src/modules/writing/mission-types/report/reportPdfExport.js', 'utf8'),
    readFile('src/modules/writing/mission-types/report/manifest.js', 'utf8'),
    readFile('src/components/student/StudentWriting.jsx', 'utf8'),
    readFile('src/hooks/useMissionSubmit.js', 'utf8'),
    readFile('src/modules/writing/mission-types/report/reportWriting.css', 'utf8'),
    readFile('src/components/common/ExportSelectModal.jsx', 'utf8'),
    readFile('src/components/teacher/ArchiveManager.jsx', 'utf8'),
    readFile('src/components/teacher/StudentManager.jsx', 'utf8'),
    readFile('src/hooks/useStudentManager.js', 'utf8'),
    readFile('src/hooks/useDataExport.js', 'utf8'),
    readFile('src/modules/writing/mission-types/registry.js', 'utf8'),
]);

test('첫 사진 저장은 생성된 초안 글 ID를 다음 저장까지 유지한다', () => {
    assert.match(reportEditorSource, /persistSections\(next, draftPostId\)/);
    assert.match(studentWritingSource, /persistGenreDraft = async \([^)]*targetPostId/);
    assert.match(studentWritingSource, /handleSave\(false, draft, targetPostId\)/);
    assert.match(missionSubmitSource, /targetPostId \|\| postId/);
});

test('보고서 편집 사진은 왼쪽 4대3 고정 프레임에 맞춘다', () => {
    assert.match(reportEditorSource, /report-editor__section-layout/);
    assert.match(reportEditorSource, /report-editor__photo-frame/);
    assert.match(reportWritingCss, /\.report-editor__section-layout[\s\S]*?grid-template-columns/);
    assert.match(reportWritingCss, /\.report-editor__photo-frame[\s\S]*?aspect-ratio: 4 \/ 3/);
    assert.match(reportWritingCss, /\.report-editor__photo-frame img[\s\S]*?object-fit: cover/);
});

test('보고서 한 칸은 사진과 관찰 결과 글쓰기 창 하나만 보여준다', () => {
    assert.match(reportEditorSource, /사진에 대한 관찰 결과/);
    assert.match(reportEditorSource, /사진을 보고 관찰한 모습, 변화, 알게 된 점을 적어보세요/);
    assert.doesNotMatch(reportEditorSource, /이 칸의 소제목/);
    assert.doesNotMatch(reportEditorSource, /사진에서 무엇을 볼 수 있는지 설명해주세요/);
    assert.doesNotMatch(reportEditorSource, /SECTION_TITLE_STYLE|CAPTION_STYLE/);
    assert.doesNotMatch(reportDocumentSource, /<figcaption>|<h3>/);
    assert.doesNotMatch(reportPdfSource, /<figcaption>/);
    assert.match(reportPdfSource, /교사의 질문/);
    assert.match(reportPdfSource, /보고서 내용/);
    assert.match(reportPdfSource, /report-sheet__question[\s\S]*?report-sheet__response/);
});

test('보고서 PDF는 질문 포함 지도형과 질문 없는 완성본을 선택해 내보낸다', () => {
    // 선택지 문구는 장르 매니페스트가 소유한다(pdfExport.renderModes) — 공용 렌더러가 아니다.
    assert.match(reportManifestSource, /renderModes:/);
    assert.match(reportManifestSource, /질문 포함 지도형/);
    assert.match(reportManifestSource, /질문 없는 완성본/);
    assert.match(reportPdfSource, /renderMode === REPORT_PDF_MODE_FINAL/);
    // 공용 내보내기 모달은 장르 이름을 하드코딩하지 않고 매니페스트가 선언한 선택지 목록(pdfRenderModes)을 그린다.
    assert.doesNotMatch(exportSelectSource, /보고서|report/i);
    assert.match(exportSelectSource, /pdfRenderModes\.map\(/);
    assert.match(exportSelectSource, /renderMode/);
    // 화면은 registry.js의 매니페스트 조회 헬퍼만 쓰고 report 모듈을 직접 import하지 않는다.
    assert.doesNotMatch(archiveManagerSource, /mission-types\/report/);
    assert.match(registrySource, /export const getPdfRenderModes/);
    assert.match(registrySource, /export const getAnyRegisteredPdfRenderModes/);
    assert.match(archiveManagerSource, /pdfRenderModes: getPdfRenderModes\(mission\)/);
    assert.match(archiveManagerSource, /selectedMissions\s*\.map\(getPdfRenderModes\)/);
    assert.match(archiveManagerSource, /pdfRenderModes=\{exportTarget\?\.pdfRenderModes \|\| \[\]\}/);
    assert.match(studentManagerSource, /getAnyRegisteredPdfRenderModes/);
    assert.match(archiveManagerSource, /renderMode: options\.renderMode/);
    assert.match(studentManagerHookSource, /renderMode: options\.renderMode/);
    assert.match(dataExportSource, /renderMode: pdfOptions\.renderMode/);
    // 공용 PDF 출력기는 어떤 장르 상수도 알지 못한 채 renderMode를 그대로 전달만 한다.
    assert.doesNotMatch(writingPdfSource, /REPORT_PDF_MODE/);
    assert.match(writingPdfSource, /renderMode/);
});

test('보고서 기본 틀은 학생이 바로 쓸 수 있는 세 칸으로 열린다', () => {
    const sections = normalizeReportSections(null, '', {});
    assert.equal(sections.length, 3);
    assert.deepEqual(sections.map((section) => section.heading), [
        '조사하거나 관찰한 까닭',
        '조사하거나 관찰한 내용',
        '결과와 새롭게 알게 된 점',
    ]);
});

test('보고서 제한값은 성능 상한 안에서 정규화된다', () => {
    const config = normalizeReportConfig({
        default_sections: Array.from({ length: 20 }, (_, index) => `칸 ${index + 1}`),
        min_sections: 30,
        max_sections: 99,
        max_images: 99,
    });
    assert.equal(config.defaultSections.length, 12);
    assert.equal(config.minSections, 12);
    assert.equal(config.maxSections, 12);
    assert.equal(config.maxImages, 3);
});

test('구조화 보고서는 검색·AI용 평문을 함께 만든다', () => {
    const sections = [
        { id: 'a', heading: '관찰 까닭', body: '학교 화단의 변화를 알아보았다.', image: null },
        {
            id: 'b',
            heading: '관찰 결과',
            body: '새싹의 키가 사흘 동안 자랐다.',
            image: {
                path: '11111111-1111-1111-1111-111111111111/b/photo.webp',
                caption: '사흘째 새싹의 모습',
                width: 1200,
                height: 900,
                bytes: 320000,
                mimeType: 'image/webp',
                signedUrl: '저장되면 안 되는 값',
            },
        },
    ];
    const structured = buildReportStructuredContent(sections);
    const plain = reportSectionsToContent(sections);

    assert.equal(structured.template, 'report');
    assert.equal(structured.sections.at(1).image.signedUrl, undefined);
    assert.match(plain, /관찰 결과/);
    assert.match(plain, /사진 설명: 사흘째 새싹의 모습/);
});

test('관찰 결과는 사진 제출용 설명에도 자동으로 연결된다', () => {
    const observation = '잎이 어제보다 두 장 더 늘었고 줄기가 햇빛 쪽으로 기울었다.';
    const sections = [{
        id: 'a',
        heading: '과거 소제목',
        body: observation,
        image: {
            path: '11111111-1111-1111-1111-111111111111/a/photo.webp',
            caption: '   ',
            width: 720,
            height: 540,
            bytes: 100000,
            mimeType: 'image/webp',
        },
    }];
    const structured = buildReportStructuredContent(sections);

    assert.equal(structured.sections.at(0).image.caption, observation);
    assert.equal(validateReportSubmission({
        structuredContent: structured,
        content: reportSectionsToContent(sections),
        config: { min_sections: 1 },
    }), null);
});

test('관찰 결과를 쓴 최소 완성 칸 수를 제출 전에 확인한다', () => {
    const sections = [
        {
            id: 'a', heading: '첫째', body: '내용 하나',
            image: {
                path: '11111111-1111-1111-1111-111111111111/a/photo.webp',
                caption: '', width: 800, height: 600, bytes: 100000, mimeType: 'image/webp',
            },
        },
        { id: 'b', heading: '둘째', body: '', image: null },
    ];
    const structuredContent = buildReportStructuredContent(sections);
    const missingSection = validateReportSubmission({
        structuredContent,
        content: reportSectionsToContent(sections),
        config: { min_sections: 2 },
    });
    assert.match(missingSection, /최소 2개/);

    sections.at(1).body = '내용 둘';
    assert.equal(validateReportSubmission({
        structuredContent: buildReportStructuredContent(sections),
        content: reportSectionsToContent(sections),
        config: { min_sections: 2 },
    }), null);
});
