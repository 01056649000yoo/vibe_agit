import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('src/components/teacher/MissionLabQuestionsModal.jsx', 'utf8');

test('학급 정보가 없으면 활동 목록 로딩을 끝내고 원인을 안내한다', () => {
    const missingClassBranch = source.slice(
        source.indexOf('if (!classId)'),
        source.indexOf('setLoadingRooms(true)')
    );

    assert.match(missingClassBranch, /setLoadingRooms\(false\)/);
    assert.match(missingClassBranch, /setError\('학급 정보를 확인한 뒤 다시 시도해 주세요\.'\)/);
});

test('활동을 바꿀 때 이전 질문을 비우고 마지막 요청 결과만 반영한다', () => {
    const loadQuestions = source.slice(
        source.indexOf('const loadQuestions'),
        source.indexOf('const handleBackToRooms')
    );

    assert.match(loadQuestions, /const requestId = \+\+questionsRequestIdRef\.current/);
    assert.match(loadQuestions, /setQuestions\(\[\]\)/);
    assert.match(loadQuestions, /requestId !== questionsRequestIdRef\.current/);
    assert.match(loadQuestions, /requestId === questionsRequestIdRef\.current/);
});

test('활동 목록으로 돌아가면 진행 중인 질문 요청을 무효화한다', () => {
    const handleBack = source.slice(
        source.indexOf('const handleBackToRooms'),
        source.indexOf('useEffect(() =>')
    );

    assert.match(handleBack, /questionsRequestIdRef\.current \+= 1/);
    assert.match(handleBack, /setQuestions\(\[\]\)/);
    assert.match(source, /onClick=\{handleBackToRooms\}/);
});
