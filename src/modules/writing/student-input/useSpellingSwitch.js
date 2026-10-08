import { useWritingEditorSettings } from '../editor-settings/WritingEditorSettingsContext';
import { SPELLING_LOOKUP_TOOL_ID } from '../editor-settings/settings';
import { openSpellingLookup } from '../tools/spelling-lookup/events';

/**
 * 밑줄을 켤지와 칩을 눌렀을 때 할 일.
 * 'class' 는 학급 글쓰기 설정(맞춤법 수첩 켜기)을 따른다. 설정 묶음 밖의 화면에서는 기본값(켬)이 된다.
 * 칩의 기본 동작은 맞춤법 수첩 열기 — 수첩 도구가 없는 화면에서는 아무 일도 일어나지 않는다.
 */
export function useSpellingSwitch(spelling = 'class', onIssueClick) {
    const { isToolEnabled } = useWritingEditorSettings();
    const enabled = spelling === 'on' || (spelling === 'class' && isToolEnabled(SPELLING_LOOKUP_TOOL_ID));
    const openIssue = onIssueClick || ((issue) => openSpellingLookup(issue.text, issue));
    return { enabled, openIssue };
}
