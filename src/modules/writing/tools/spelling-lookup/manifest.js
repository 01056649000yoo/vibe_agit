import { SPELLING_LOOKUP_OPEN_EVENT } from './events';

export const spellingLookupToolManifest = {
    id: 'spelling-lookup',
    label: '맞춤법 찾아보기',
    description: '학생이 궁금한 표현을 직접 검색하고 자기 글을 스스로 고치는 학습 도구',
    order: 10,
    // 버튼은 공통 호스트가 그린다. 본체는 학생이 이 버튼을 누르거나
    // 밑줄 칩이 아래 신호를 보낼 때만 내려받는다.
    triggerLabel: '맞춤법 찾아보기',
    triggerHelp: '궁금한 표현을 직접 찾아보고 내 글은 내가 고쳐요.',
    openEventName: SPELLING_LOOKUP_OPEN_EVENT,
    studentEntry: () => import('./SpellingLookupTool')
};
