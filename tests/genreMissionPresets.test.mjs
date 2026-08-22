import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    applyGenrePreset,
    describePresetResult,
    getFreeformGenreCategories,
    getGenreCategories,
    getGenreEntries,
    getGenreMissionTypeId,
    getGenrePreset,
} from '../src/modules/writing/mission-types/genreCatalog.js';
import { getGenreMissionType } from '../src/modules/writing/mission-types/registry.js';

const [missionForm, missionManager, missionTypePicker] = await Promise.all([
    readFile('src/components/teacher/MissionForm.jsx', 'utf8'),
    readFile('src/components/teacher/MissionManager.jsx', 'utf8'),
    readFile('src/components/teacher/MissionTypePicker.jsx', 'utf8'),
]);

test('글 종류 목록은 카탈로그 한 곳에서 오고 화면에 값을 다시 적지 않는다', () => {
    assert.match(missionManager, /getFreeformGenreCategories\(\)/);
    assert.match(missionTypePicker, /getGenreCategories\(\)/);
    // 예전처럼 화면 안에 목록을 다시 박아 두면 두 곳이 어긋난다.
    assert.ok(!/genres: \['일기'/.test(missionManager), 'MissionManager에 옛 하드코딩 목록이 남아 있다');
    for (const legacy of ['일기', '독후감(서평)', '동시', '보고서(관찰 기록문)']) {
        assert.ok(
            !getGenreEntries().some((entry) => entry.id === legacy),
            `${legacy}은(는) 새 목록에서 빠져야 한다`,
        );
    }
});

test('전용 틀이 있는 종류는 그 틀로 보내고 폼 선택칸에는 넣지 않는다', () => {
    assert.equal(getGenreMissionTypeId('시'), 'poem');
    assert.equal(getGenreMissionTypeId('관찰·조사 보고서'), 'report');
    assert.equal(getGenreMissionTypeId('안건 의견 모으기'), 'meeting');

    // 등록되지 않은 틀을 가리키면 첫 화면에서 빈 카드가 된다.
    for (const entry of getGenreEntries()) {
        if (!entry.missionTypeId) continue;
        assert.ok(getGenreMissionType(entry.missionTypeId), `${entry.id}의 전용 틀이 등록되어 있지 않다`);
    }

    const freeformIds = getFreeformGenreCategories().flatMap((category) => category.entries.map((entry) => entry.id));
    for (const id of ['시', '편지', '관찰·조사 보고서', '안건 의견 모으기']) {
        assert.ok(!freeformIds.includes(id), `${id}은(는) 폼 선택칸에 있으면 안 된다`);
    }
    // 첫 화면에는 전용 틀까지 모두 보인다.
    const allIds = getGenreCategories().flatMap((category) => category.entries.map((entry) => entry.id));
    assert.equal(allIds.length, getGenreEntries().length);
});

test('프리셋은 안내·질문·분량을 함께 채운다', () => {
    const { formData, filled } = applyGenrePreset({}, '논설문');
    assert.equal(formData.genre, '논설문');
    assert.match(formData.guide, /주장/);
    assert.equal(formData.guide_questions.length, 3);
    assert.equal(formData.min_paragraphs, 3);
    assert.equal(formData.use_ai_questions, true);
    assert.equal(formData.question_count, 3);
    assert.deepEqual(filled, ['guide', 'guide_questions', 'min_chars', 'min_paragraphs']);

    // 프리셋이 없는 종류는 폼을 건드리지 않는다.
    const untouched = applyGenrePreset({ guide: '직접 쓴 안내' }, '기타');
    assert.equal(untouched.formData.guide, '직접 쓴 안내');
    assert.deepEqual(untouched.filled, []);
});

test('프리셋은 덮어쓰기가 아니라 채워 넣기다', () => {
    const first = applyGenrePreset({}, '논설문').formData;

    // 선생님이 안내 문구만 고친 뒤 종류를 바꾸면, 고친 안내는 남고 나머지는 새 프리셋으로 간다.
    const edited = { ...first, guide: '우리 반 규칙을 주제로 씁니다.' };
    const { formData: next, filled, kept } = applyGenrePreset(edited, '설명문', { previousGenre: '논설문' });
    assert.equal(next.guide, '우리 반 규칙을 주제로 씁니다.');
    assert.deepEqual(next.guide_questions, getGenrePreset('설명문').questions);
    assert.ok(kept.includes('guide'));
    assert.ok(filled.includes('guide_questions'));
    assert.match(describePresetResult('설명문', { filled, kept }), /안내 문구은\(는\) 그대로 두었어요/);

    // 직접 요청한 `프리셋 다시 넣기`는 고친 값까지 되돌린다.
    const forced = applyGenrePreset(edited, '논설문', { previousGenre: '논설문', force: true });
    assert.equal(forced.formData.guide, getGenrePreset('논설문').guide);
});

test('제출이 시작되면 프리셋이 안내 질문을 건드리지 않는다', () => {
    const started = { ...applyGenrePreset({}, '논설문').formData };
    const { formData: next, kept } = applyGenrePreset(started, '설명문', {
        previousGenre: '논설문',
        keepQuestions: true,
    });
    assert.deepEqual(next.guide_questions, getGenrePreset('논설문').questions);
    assert.ok(kept.includes('guide_questions'));
    assert.equal(next.guide, getGenrePreset('설명문').guide);
});

test('제출이 시작된 미션의 기존 질문은 잠기고 추가만 열려 있다', () => {
    // 학생 답은 질문 번호로 저장된다. 아래 네 가지 중 하나라도 빠지면 잠금이 뚫린다.
    assert.match(missionForm, /readOnly=\{hasSubmissions && idx < lockedQuestionCount\}/);
    assert.match(missionForm, /if \(hasSubmissions && idx < lockedQuestionCount\) return;/);
    assert.match(missionForm, /hasSubmissions && idx < lockedQuestionCount \? \(/);
    assert.match(missionForm, /disabled=\{isGeneratingQuestions \|\| hasSubmissions\}/);
    assert.match(missionForm, /질문을 모두 지울 수 없습니다/);

    // 질문 추가 버튼에는 잠금 조건이 붙지 않아야 한다.
    const addButton = missionForm.match(/guide_questions: \[\.\.\.\(formData\.guide_questions \|\| \[\]\), ''\]/);
    assert.ok(addButton, '질문 추가 버튼이 사라졌다');

    assert.match(missionManager, /submittedCount=\{editingMissionId/);
});

test('목록에서 빠진 지난 종류로 저장된 미션도 값이 바뀌지 않는다', () => {
    assert.match(missionForm, /지난 종류/);
    assert.match(missionForm, /!genreCategories\.some\(cat => cat\.entries\.some\(entry => entry\.id === formData\.genre\)\)/);
});

test('프리셋 값은 초등학생 분량 기준을 지킨다', () => {
    for (const entry of getGenreEntries()) {
        if (!entry.preset) continue;
        const { guide, questions, minChars, minParagraphs } = entry.preset;
        assert.ok(guide.trim().length >= 20, `${entry.id} 안내 문구가 너무 짧다`);
        assert.equal(questions.length, 3, `${entry.id} 질문은 3개로 맞춘다`);
        assert.ok(questions.every((question) => question.trim().endsWith('?')), `${entry.id} 질문이 물음표로 끝나지 않는다`);
        assert.ok(minChars >= 200 && minChars <= 600, `${entry.id} 최소 글자 수가 범위를 벗어났다`);
        assert.ok(minParagraphs >= 2 && minParagraphs <= 5, `${entry.id} 최소 문단 수가 범위를 벗어났다`);
    }
});
