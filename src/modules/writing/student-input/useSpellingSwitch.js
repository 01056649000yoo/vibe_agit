import { useWritingEditorSettings } from '../editor-settings/WritingEditorSettingsContext';
import { SPELLING_GRAY_TOOL_ID, SPELLING_LOOKUP_TOOL_ID } from '../editor-settings/settings';
import { openSpellingLookup } from '../tools/spelling-lookup/events';

/**
 * 밑줄을 켤지와 칩을 눌렀을 때 할 일.
 * 'class' 는 학급 글쓰기 설정을 따른다 — 빨간 물결은 `맞춤법 수첩`(기본 켬), 회색 점선은 `한번 살펴볼까요?`(기본 켬, 2026-10-08~).
 * 설정 묶음 밖의 화면에서는 기본값이 된다(둘 다 켬).
 * 칩의 기본 동작은 맞춤법 수첩 열기 — 수첩 도구가 없는 화면에서는 아무 일도 일어나지 않는다.
 */
export function useSpellingSwitch(spelling = 'class', onIssueClick, grayLine = 'class') {
    const { isToolEnabled } = useWritingEditorSettings();
    const enabled = spelling === 'on' || (spelling === 'class' && isToolEnabled(SPELLING_LOOKUP_TOOL_ID));
    const grayEnabled = grayLine === 'on' || (grayLine === 'class' && isToolEnabled(SPELLING_GRAY_TOOL_ID));
    const openIssue = onIssueClick || ((issue) => openSpellingLookup(issue.text, issue));
    return { enabled, grayEnabled, openIssue };
}
