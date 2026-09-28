import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import {
    countContentChars,
    INVISIBLE_CHARS_CLASS,
    LINE_BREAKS_CLASS,
    SPACE_RUNS_CLASS,
} from '../src/lib/textMetrics.js';
import { countWrittenChars, getGenreMissionTypes } from '../src/modules/writing/mission-types/registry.js';
import {
    normalizeReportSections,
    reportSectionsToContent,
    buildReportStructuredContent,
} from '../src/modules/writing/mission-types/report/reportContent.js';
import { buildLetterContent, createLetterStructuredContent } from '../src/modules/writing/mission-types/letter/letterContent.js';

// 글자 수는 화면(src/lib/textMetrics.js·registry.countWrittenChars)과 서버(writing_content_char_count·
// writing_post_char_count)가 따로 센다. 둘이 어긋나면 화면은 "채웠다"는데 서버가 제출을 거절한다.
// 2026-09-28: 보고서가 선생님이 정한 칸 제목까지 세서 몇 자만 쓴 학생이 900자 가까이로 보였다.

const MIGRATIONS = 'supabase/migrations';

// 이 함수를 정의한 마지막 마이그레이션 속 정의 본문
const latestDefinition = async (name) => {
    const files = (await readdir(MIGRATIONS)).filter((file) => file.endsWith('.sql')).sort();
    const pattern = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`);
    for (const file of files.reverse()) {
        const match = (await readFile(`${MIGRATIONS}/${file}`, 'utf8')).match(pattern);
        if (match) return { file, body: match[0] };
    }
    throw new Error(`${name} 정의를 찾지 못했습니다.`);
};

// JS 는 ​, Postgres 정규식은 같은 글자를 \x200B 로 적는다.
const asPostgresClass = (jsClass) => jsClass.replace(/\\u/g, '\\x');

const ch = (codePoint) => String.fromCodePoint(codePoint);

test('서버의 한 덩어리 글자 세기는 화면과 같은 글자 묶음을 쓴다', async () => {
    const { body } = await latestDefinition('writing_content_char_count');
    for (const jsClass of [INVISIBLE_CHARS_CLASS, LINE_BREAKS_CLASS, SPACE_RUNS_CLASS]) {
        assert.ok(body.includes(`'${asPostgresClass(jsClass)}'`),
            `서버 writing_content_char_count 에 ${asPostgresClass(jsClass)} 가 없습니다. 화면 규칙과 같이 고치세요.`);
    }
    // 줄바꿈은 지우고('') 빈칸 뭉치는 한 칸(' ')으로, 앞뒤 한 칸은 btrim 으로 뗀다.
    assert.ok(body.includes(`'${asPostgresClass(LINE_BREAKS_CLASS)}', '', 'g'`));
    assert.ok(body.includes(`'${asPostgresClass(SPACE_RUNS_CLASS)}', ' ', 'g'`));
    assert.match(body, /btrim\(/);
    assert.match(body, /char_length\(/, '코드 포인트 단위로 센다(화면은 Array.from 으로 맞춘다).');
});

test('서버는 칸이 나뉜 장르마다 학생이 쓴 칸만 센다 — 화면 장르 목록과 같다', async () => {
    const { body } = await latestDefinition('writing_post_char_count');
    const probe = { template: '__none__' };
    const countingGenres = getGenreMissionTypes().filter((type) => typeof type.countWrittenChars === 'function');
    assert.ok(countingGenres.length >= 3);
    for (const type of countingGenres) {
        assert.equal(type.countWrittenChars(probe), null, `${type.id}: 다른 template 이면 null 이어야 합니다.`);
        assert.ok(body.includes(`p_structured ->> 'template' = '${type.id}'`),
            `서버 writing_post_char_count 에 '${type.id}' 갈래가 없습니다.`);
    }
    assert.match(body, /LEAST\(\s*public\.writing_content_char_count\(p_content\)/,
        '칸으로 센 값이 본문보다 커지지 않게 작은 값을 써야 합니다.');
});

test('저장 트리거와 제출이 칸을 아는 글자 세기를 쓴다', async () => {
    const guard = await latestDefinition('guard_student_post_server_columns');
    assert.match(guard.body,
        /NEW\.char_count := public\.writing_post_char_count\(COALESCE\(NEW\.content, ''\), NEW\.structured_content\);/,
        `${guard.file} 의 트리거가 본문 전체를 셉니다.`);
    const submit = await latestDefinition('writing_engine_submit_assignment');
    assert.match(submit.body, /v_char_count := public\.writing_post_char_count\(p_content, p_structured_content\);/,
        `${submit.file} 의 제출이 본문 전체로 최소 글자 수를 판정합니다.`);
});

test('줄바꿈은 세지 않고 띄어쓰기는 몇 칸이든 한 칸이다', () => {
    assert.equal(countContentChars('\n'.repeat(900)), 0, '엔터 연타로 글자 수가 늘면 안 됩니다.');
    assert.equal(countContentChars(' '.repeat(900)), 0);
    assert.equal(countContentChars('가     나'), 3);
    assert.equal(countContentChars(`가${ch(0x3000)}${ch(0xA0)} 나`), 3, '전각·줄바꿈없는 빈칸도 빈칸이다.');
    assert.equal(countContentChars('  가 나  '), 3, '앞뒤 빈칸은 세지 않는다.');
    assert.equal(countContentChars('끝.\r\n\r\n시작'), 4);
    assert.equal(countContentChars(`가${ch(0x200B)}나${ch(0xFEFF)}`), 2);
    assert.equal(countContentChars('좋아😀'), 3, '이모지는 한 글자.');
});

test('보고서는 선생님이 정한 칸 제목을 세지 않는다', () => {
    const question = '이 실험을 하기 전에 내가 예상한 결과는 무엇이었고, 그렇게 생각한 까닭은 무엇인지 자세히 적어 봅시다.';
    const config = { default_sections: Array(12).fill(question), min_sections: 12 };
    const sections = normalizeReportSections(null, '', config);
    sections[0] = { ...sections[0], body: '안녕하세요' };
    const content = reportSectionsToContent(sections);
    const structuredContent = buildReportStructuredContent(sections);

    assert.ok(countContentChars(content) > 600, '재현: 본문에는 칸 제목이 모두 들어 있다.');
    assert.equal(countWrittenChars({ content, structuredContent }), 5);
    assert.equal(countWrittenChars({ content: reportSectionsToContent(normalizeReportSections(null, '', config)),
        structuredContent: buildReportStructuredContent(normalizeReportSections(null, '', config)) }), 0,
    '한 글자도 안 쓰면 0자.');
});

test('보고서 옛 글처럼 내용 없이 사진 설명만 있으면 그 설명을 센다', () => {
    const structuredContent = {
        template: 'report',
        sections: [{ heading: '관찰', body: '', image: { path: 'a.jpg', caption: '잎이 노랗다' } }],
    };
    assert.equal(countWrittenChars({ content: '관찰\n사진 설명: 잎이 노랗다', structuredContent }), 6);
});

test('편지는 학생이 쓴 네 칸만 센다 — `에게`와 칸 사이 빈 줄은 빼고', () => {
    const parts = { recipient: '엄마', greeting: '안녕하세요', body: '사랑해요', closing: '안녕히' };
    const content = buildLetterContent(parts);
    assert.equal(countWrittenChars({ content, structuredContent: createLetterStructuredContent(parts) }), 14);
});

test('시는 연 사이 빈 줄을 세지 않는다', () => {
    const stanzas = ['하늘이\n파랗다', '바람이 분다'];
    const structuredContent = { template: 'poem', version: 1, stanzas };
    assert.equal(countWrittenChars({ content: stanzas.join('\n\n'), structuredContent }), 12);
});

test('칸 값만 부풀려 보내도 본문 글자 수를 넘지 못한다', () => {
    const structuredContent = { template: 'letter', recipient: '가'.repeat(900), greeting: '', body: '', closing: '' };
    assert.equal(countWrittenChars({ content: '가나다', structuredContent }), 3);
});

test('칸이 없는 글(자유 글·일기·독서록)은 본문을 센다', () => {
    assert.equal(countWrittenChars({ content: '오늘은\n\n비가 왔다', structuredContent: null }), 8);
    assert.equal(countWrittenChars({ content: '일기', structuredContent: { diaryDate: '2026-09-28' } }), 2);
});
