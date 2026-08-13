import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    SPELLING_LOOKUP_TOOL_ID,
    LAB_RESULTS_TOOL_ID,
    isWritingToolEnabled,
    normalizeWritingEditorSettings,
    setWritingToolEnabled
} from '../src/modules/writing/editor-settings/settings.js';

const [referencePanel, referencePanelCss, studentWriting, writingWorkspace] = await Promise.all([
    readFile('src/modules/writing/references/WritingReferencePanel.jsx', 'utf8'),
    readFile('src/modules/writing/references/WritingReferencePanel.css', 'utf8'),
    readFile('src/components/student/StudentWriting.jsx', 'utf8'),
    readFile('src/components/writing/WritingWorkspace.jsx', 'utf8')
]);

test('기존 학급과 잘못된 설정은 맞춤법 찾아보기를 기본으로 켠다', () => {
    assert.equal(isWritingToolEnabled(null, SPELLING_LOOKUP_TOOL_ID), true);
    assert.equal(isWritingToolEnabled({ enabled_tools: '잘못된 값' }, SPELLING_LOOKUP_TOOL_ID), true);
});

test('교사가 맞춤법 찾아보기를 끄고 다시 켤 수 있다', () => {
    const disabled = setWritingToolEnabled(null, SPELLING_LOOKUP_TOOL_ID, false);
    assert.equal(isWritingToolEnabled(disabled, SPELLING_LOOKUP_TOOL_ID), false);

    const enabled = setWritingToolEnabled(disabled, SPELLING_LOOKUP_TOOL_ID, true);
    assert.equal(isWritingToolEnabled(enabled, SPELLING_LOOKUP_TOOL_ID), true);
});

test('연구소 결과 불러오기는 기존 학급에 기본 OFF이고 교사가 켤 수 있다', () => {
    assert.equal(isWritingToolEnabled(null, LAB_RESULTS_TOOL_ID), false);
    const enabled = setWritingToolEnabled(null, LAB_RESULTS_TOOL_ID, true);
    assert.equal(isWritingToolEnabled(enabled, LAB_RESULTS_TOOL_ID), true);
});

test('앞으로 추가될 다른 글쓰기 설정은 토글 변경 때 보존한다', () => {
    const source = {
        enabled_tools: [SPELLING_LOOKUP_TOOL_ID, 'future-outline'],
        layout: { density: 'comfortable' }
    };
    const changed = setWritingToolEnabled(source, SPELLING_LOOKUP_TOOL_ID, false);

    assert.deepEqual(changed.enabled_tools, ['future-outline']);
    assert.deepEqual(changed.layout, source.layout);
    assert.deepEqual(normalizeWritingEditorSettings(changed), changed);
});

test('글쓰기 참고함은 입력창을 유지한 채 열고 닫는 공통 인라인 패널이다', () => {
    assert.match(referencePanel, /aria-expanded=\{isOpen\}/);
    assert.match(referencePanel, /aria-controls=\{panelId\}/);
    assert.match(referencePanel, /hidden=\{!isOpen\}/);
    assert.match(referencePanel, /<div className="writing-reference-main">\s*\{children\}/);
    assert.doesNotMatch(referencePanel, /ModalPortal|position:\s*['"]fixed|supabase|\.rpc\(|setInterval|\.channel\(/);
    assert.match(referencePanelCss, /grid-template-areas: 'main panel'/);
    assert.match(referencePanelCss, /position: sticky/);
    assert.match(referencePanelCss, /align-self: start/);
    assert.match(writingWorkspace, /overflow: 'visible'/);
    assert.match(referencePanelCss, /@media \(max-width: 1180px\)[\s\S]*'panel'[\s\S]*'main'/);
});

test('글쓰기 참고함 옆 안내칸은 가로·세로 배치와 긴 글 추적 동작을 설명한다', () => {
    assert.match(referencePanel, /className="writing-reference-position-note"/);
    assert.match(referencePanel, /가로 화면에서는 오른쪽에서 글을 따라오고/);
    assert.match(referencePanel, /세로 화면에서는 입력창 위에 보여요/);
    assert.match(referencePanelCss, /\.writing-reference-position-note/);
});

test('학생 글쓰기 참고함은 기존 선생님 안내와 핵심질문만 재사용한다', () => {
    assert.match(studentWriting, /<WritingReferencePanel key=\{missionId\} sections=\{writingReferenceSections\}>/);
    assert.match(studentWriting, /id: 'teacher-guide'/);
    assert.match(studentWriting, /id: 'teacher-questions'/);
    assert.match(studentWriting, /supportingText: Reflect\.get\(studentAnswers, index\)/);
    assert.doesNotMatch(studentWriting, /WritingReferencePanel[\s\S]{0,200}labResultsApi/);
});
