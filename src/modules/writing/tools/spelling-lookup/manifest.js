import { SPELLING_LOOKUP_OPEN_EVENT } from './events';

export const spellingLookupToolManifest = {
    id: 'spelling-lookup',
    label: '맞춤법 찾아보기',
    description: '학생 글을 기본 자료 500개로 살펴보고 무작위 5문제로 연습하는 학습 도구',
    teacherDescription: '학생이 궁금한 표현을 직접 찾고, 확인할 표현의 밑줄과 도움말을 봅니다.',
    order: 10,
    // 버튼은 공통 호스트가 그린다. 본체는 학생이 이 버튼을 누르거나
    // 밑줄 칩이 아래 신호를 보낼 때만 내려받는다.
    triggerLabel: '맞춤법 찾아보기',
    triggerHelp: '궁금한 표현을 찾아보고 랜덤 5문제로 연습해요.',
    triggerEmoji: '🔎',
    openEventName: SPELLING_LOOKUP_OPEN_EVENT,
    studentEntry: () => import('./SpellingLookupTool')
};
