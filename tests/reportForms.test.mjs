import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    REPORT_KINDS,
    buildReportStructuredContent,
    collectReportSources,
    describeReportMeta,
    normalizeReportConfig,
    normalizeReportMeta,
    normalizeReportSections,
    reportKindAllowsPhoto,
    reportKindOf,
    reportSectionsToContent,
    validateReportSubmission,
} from '../src/modules/writing/mission-types/report/reportContent.js';

const OBS = { kind: 'observation' };
const RES = { kind: 'research' };

test('양식 종류가 없는 과제는 예전 방식 그대로다(저장 모양도 같다)', () => {
    const config = normalizeReportConfig({});
    assert.equal(config.kind, null);
    assert.equal(config.sourcesEnabled, false);
    const saved = buildReportStructuredContent(normalizeReportSections(null, '', {}));
    assert.deepEqual(Object.keys(saved), ['template', 'version', 'sections']);
    assert.deepEqual(Object.keys(saved.sections[0]), ['id', 'heading', 'body', 'image']);
});

test('관찰·조사 양식은 종류별 머리말 칸과 기본 칸 제목을 가진다', () => {
    assert.deepEqual(REPORT_KINDS.observation.metaFields.map((f) => f.key), ['target', 'period', 'place', 'weather', 'method']);
    assert.deepEqual(REPORT_KINDS.research.metaFields.map((f) => f.key), ['topic', 'period', 'method']);
    assert.deepEqual(normalizeReportConfig(OBS).defaultSections, ['관찰한 까닭', '관찰한 모습', '알게 된 점과 느낀 점']);
    assert.deepEqual(normalizeReportConfig(RES).defaultSections, ['조사한 까닭', '조사한 내용', '알게 된 점', '느낀 점과 더 알고 싶은 점']);
    assert.equal(reportKindAllowsPhoto('observation', 0), false);
    assert.equal(reportKindAllowsPhoto('observation', 1), true);
    assert.equal(reportKindAllowsPhoto('observation', 2), false);
    assert.equal(reportKindAllowsPhoto('observation', 3), true);
    assert.equal(reportKindAllowsPhoto(null, 0), true);
    // 선생님이 칸 제목을 직접 정하면 그것이 우선이다.
    assert.deepEqual(normalizeReportConfig({ ...OBS, default_sections: ['가', '나'] }).defaultSections, ['가', '나']);
    // 모르는 종류는 예전 방식으로 본다.
    assert.equal(normalizeReportConfig({ kind: 'novel' }).kind, null);
});

test('출처 쓰기는 선생님이 켠 과제에서만 켜진다(기본 꺼짐)', () => {
    assert.equal(normalizeReportConfig(RES).sourcesEnabled, false);
    assert.equal(normalizeReportConfig({ ...RES, sources_enabled: 'true' }).sourcesEnabled, false);
    assert.equal(normalizeReportConfig({ ...RES, sources_enabled: true }).sourcesEnabled, true);
});

test('머리말은 그 종류에 정해진 칸만 남기고 길이를 자른다', () => {
    const meta = normalizeReportMeta({ target: '  강낭콩  ', zzz: '몰래', period: 'a'.repeat(300) }, 'observation');
    assert.deepEqual(Object.keys(meta), ['target', 'period']);
    assert.equal(meta.target, '강낭콩');
    assert.equal(meta.period.length, 100);
    // 관찰 칸 이름은 조사 보고서에 들어가지 않는다.
    assert.deepEqual(normalizeReportMeta({ target: '강낭콩', topic: '전통 음식' }, 'research'), { topic: '전통 음식' });
    assert.deepEqual(normalizeReportMeta({ target: 'x' }, null), {});
    // 입력하는 중에는 띄어쓰기를 지우지 않는다(저장 때만 trim: false).
    assert.equal(normalizeReportMeta({ target: '강낭 ' }, 'observation', { trim: false }).target, '강낭 ');
    assert.equal(buildReportStructuredContent([], { kind: 'observation', meta: { target: '강낭 ' } }).meta.target, '강낭 ');
    assert.deepEqual(normalizeReportMeta({ target: '   ' }, 'observation', { trim: false }), {});
});

test('저장: 머리말·날짜·출처는 있을 때만 들어가고, 칸 날짜·출처 필드는 비면 빠진다', () => {
    const sections = normalizeReportSections(null, '', OBS);
    sections[1].body = '잎이 나왔다.';
    sections[1].date = '10월 3일';
    sections[1].source = '식물도감';
    const saved = buildReportStructuredContent(sections, { kind: 'observation', meta: { target: '강낭콩' } });
    assert.deepEqual(saved.meta, { kind: 'observation', target: '강낭콩' });
    assert.deepEqual(Object.keys(saved.sections[0]), ['id', 'heading', 'body', 'image', 'photo']);
    assert.equal(saved.sections[1].date, '10월 3일');
    assert.equal(saved.sections[1].source, '식물도감');
    assert.equal(reportKindOf(saved), 'observation');
});

test('사진 설명: 양식 종류가 있으면 본문과 따로, 없으면 예전처럼 본문을 설명으로 쓴다', () => {
    const image = { path: 'p/a/b.webp', caption: '', width: 10, height: 10, bytes: 10, mimeType: 'image/webp' };
    const kinded = buildReportStructuredContent([{ id: 's1', heading: '', body: '본문', image }], { kind: 'observation' });
    assert.equal(kinded.sections[0].image.caption, '');
    const legacy = buildReportStructuredContent([{ id: 's1', heading: '', body: '본문', image }]);
    assert.equal(legacy.sections[0].image.caption, '본문');
    // 저장된 글에서 읽을 때도 같다(종류는 글 안의 머리말에서 알아낸다).
    assert.equal(normalizeReportSections(kinded, '', {})[0].image.caption, '');
    assert.equal(normalizeReportSections(legacy, '', {})[0].image.caption, '본문');
});

test('글 본문 텍스트에 머리말·칸 날짜·참고 자료가 들어간다', () => {
    const sections = normalizeReportSections(null, '', RES);
    sections[1].body = '비빔밥은 전주가 유명하다.';
    sections[1].source = '책 『우리 음식』 33쪽';
    const content = reportSectionsToContent(sections, { kind: 'research', meta: { topic: '전통 음식', method: '책, 인터넷' } });
    assert.match(content, /^조사 주제: 전통 음식\n조사 방법: 책, 인터넷\n\n/);
    assert.match(content, /참고 자료\n1\. 책 『우리 음식』 33쪽$/);
    // 예전 방식은 머리말·참고 자료를 붙이지 않는다.
    assert.doesNotMatch(reportSectionsToContent(sections), /참고 자료|조사 주제/);
});

test('출처 목록: 같은 출처는 한 번만, 빈 것은 뺀다', () => {
    assert.deepEqual(collectReportSources([{ source: ' 책 A ' }, { source: '' }, { source: '책 A' }, { source: '누리집' }]), ['책 A', '누리집']);
    assert.deepEqual(describeReportMeta('observation', { target: '강낭콩', weather: '' }), [{ key: 'target', label: '관찰 대상', value: '강낭콩' }]);
});

test('제출 검사: 필수 머리말, 출처(켠 과제만), 사진 설명', () => {
    const filled = (config, patch = {}) => {
        const sections = normalizeReportSections(null, '', config);
        sections[0].body = '까닭'; sections[1].body = '내용';
        Object.assign(sections[1], patch);
        return sections;
    };
    // 필수 머리말이 비면 막는다.
    let saved = buildReportStructuredContent(filled(OBS), { kind: 'observation', meta: { period: '10월' } });
    assert.match(validateReportSubmission({ structuredContent: saved, content: '', config: OBS }), /관찰 대상/);
    saved = buildReportStructuredContent(filled(OBS), { kind: 'observation', meta: { target: '강낭콩' } });
    assert.equal(validateReportSubmission({ structuredContent: saved, content: '', config: OBS }), null);
    // 출처가 꺼져 있으면 출처 없이도 통과, 켜져 있으면 하나 이상 필요.
    saved = buildReportStructuredContent(filled(RES), { kind: 'research', meta: { topic: '음식' } });
    assert.equal(validateReportSubmission({ structuredContent: saved, content: '', config: RES }), null);
    const withSources = { ...RES, sources_enabled: true };
    assert.match(validateReportSubmission({ structuredContent: saved, content: '', config: withSources }), /출처/);
    saved = buildReportStructuredContent(filled(withSources, { source: '책' }), { kind: 'research', meta: { topic: '음식' } });
    assert.equal(validateReportSubmission({ structuredContent: saved, content: '', config: withSources }), null);
    // 사진이 있으면 설명이 필요하다.
    const image = { path: 'p/a/b.webp', caption: '', width: 10, height: 10, bytes: 10, mimeType: 'image/webp' };
    saved = buildReportStructuredContent(filled(OBS, { image }), { kind: 'observation', meta: { target: '강낭콩' } });
    assert.match(validateReportSubmission({ structuredContent: saved, content: '', config: OBS }), /사진 설명/);
});

test('칸 id 가 겹치거나 80자를 넘어도 서로 다른 80자 이하로 바로잡는다', () => {
    const long = 'x'.repeat(80);
    const sections = normalizeReportSections({
        sections: [{ id: 'section-2' }, { id: long }, { id: long }, { id: 'section-1' }, { id: 'section-1' }],
    }, '', {});
    const ids = sections.map((section) => section.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every((id) => id.length <= 80));
    const padded = normalizeReportSections({ sections: [{ id: 'section-2' }] }, '', {});
    assert.equal(new Set(padded.map((section) => section.id)).size, padded.length);
});

test('칸마다 사진 칸 여부: 선생님이 정한 값이 우선, 없으면 양식 기본값, 예전 방식은 모두 있음', () => {
    assert.deepEqual(normalizeReportConfig(OBS).sectionPhotos, [false, true, false]);
    assert.deepEqual(normalizeReportConfig({ ...OBS, default_sections: ['가', '나', '다'], section_photos: [true, true, false] }).sectionPhotos, [true, true, false]);
    assert.deepEqual(normalizeReportConfig({ ...OBS, default_sections: ['가', '', '다'], section_photos: [false, true, true] }).sectionPhotos, [false, true]);
    assert.deepEqual(normalizeReportConfig({ min_sections: 2 }).sectionPhotos, [true, true, true]);
    const sections = normalizeReportSections(null, '', { ...OBS, default_sections: ['가', '나'], section_photos: [true, false] });
    assert.deepEqual(sections.map((section) => section.photo), [true, false]);
    const saved = buildReportStructuredContent(sections, { kind: 'observation', meta: { target: 'x' } });
    assert.deepEqual(saved.sections.map((section) => section.photo), [true, false]);
    // 저장된 글의 칸 값이 설정보다 우선(학생이 칸을 옮겨도 따라간다)
    assert.equal(normalizeReportSections(saved, '', OBS)[1].photo, false);
    assert.equal('photo' in buildReportStructuredContent(normalizeReportSections(null, '', {}), {}).sections[0], false);
});

test('학생은 글만 칸에 사진을 더하거나 사진 칸을 뺄 수 있다(선생님 설정은 기본값)', () => {
    const source = readFileSync(new URL('../src/modules/writing/mission-types/report/ReportEditor.jsx', import.meta.url), 'utf8');
    assert.match(source, /이 칸에도 사진을 넣고 싶어요/);
    assert.match(source, /updateSection\(section\.id, \{ photo: true \}\)/);
    assert.match(source, /이 칸은 글만 쓸래요/);
});
