import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    parseActivityReportHistory,
    resolveActivityReportHistory,
    serializeActivityReportHistory
} from '../src/modules/writing/evaluation/activityReportHistory.js';

test('새 활동 보고서 이력은 학생 이름이 아니라 학생 ID로 복원한다', () => {
    const content = serializeActivityReportHistory([
        { student: { id: 'student-a', name: '김하늘' }, ai_synthesis: '첫 번째 학생 문장' },
        { student: { id: 'student-b', name: '김하늘' }, ai_synthesis: '두 번째 학생 문장' }
    ]);
    const parsed = parseActivityReportHistory(content);

    assert.equal(parsed.format, 'v2');
    assert.equal(parsed.byStudentId.get('student-a'), '첫 번째 학생 문장');
    assert.equal(parsed.byStudentId.get('student-b'), '두 번째 학생 문장');
});

test('이름만 저장된 과거 이력은 동명이인이 없을 때만 호환 복원한다', () => {
    const legacy = '[김하늘]\n과거 문장';

    assert.deepEqual(
        Object.fromEntries(resolveActivityReportHistory(legacy, [{ id: 'student-a', name: '김하늘' }])),
        { 'student-a': '과거 문장' }
    );
    assert.deepEqual(
        Object.fromEntries(resolveActivityReportHistory(legacy, [
            { id: 'student-a', name: '김하늘' },
            { id: 'student-b', name: '김하늘' }
        ])),
        {}
    );
});

test('활동 보고서는 생성 결과를 기다려 저장하고 일부 실패를 완료로 숨기지 않는다', async () => {
    const source = await readFile('src/components/teacher/ActivityReport.jsx', 'utf8');
    const batchSection = source.slice(
        source.indexOf('const handleBatchGenerate'),
        source.indexOf('// 생성 이력 저장')
    );

    assert.match(batchSection, /await saveGenerationHistory\(generatedThisRun/);
    assert.doesNotMatch(batchSection, /setTimeout\(async/);
    assert.match(batchSection, /failedStudentIds\.length/);
    assert.match(source, /serializeActivityReportHistory\(currentResults\)/);
    assert.match(source, /\.insert\(\[\.\.\.records, \.\.\.individualRecords\]\)/);
    assert.match(source, /\.limit\(MISSION_LIST_LIMIT\)/);
    assert.match(source, /\.limit\(GENERATION_HISTORY_LIMIT\)/);
});
