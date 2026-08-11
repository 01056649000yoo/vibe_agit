import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildReportStructuredContent,
    normalizeReportConfig,
    normalizeReportSections,
    reportSectionsToContent,
    validateReportSubmission,
} from '../src/modules/writing/mission-types/report/reportContent.js';

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

test('사진 설명과 최소 완성 칸을 제출 전에 확인한다', () => {
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
    const missingCaption = validateReportSubmission({
        structuredContent: buildReportStructuredContent(sections),
        content: reportSectionsToContent(sections),
        config: { min_sections: 2 },
    });
    assert.match(missingCaption, /사진이 무엇인지/);

    sections.at(0).image.caption = '관찰 첫날 사진';
    assert.equal(validateReportSubmission({
        structuredContent: buildReportStructuredContent(sections),
        content: reportSectionsToContent(sections),
        config: { min_sections: 2 },
    }), null);
});
