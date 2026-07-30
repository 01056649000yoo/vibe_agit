export const spellingLookupToolManifest = {
    id: 'spelling-lookup',
    label: '맞춤법 찾아보기',
    description: '학생이 궁금한 표현을 직접 검색하고 자기 글을 스스로 고치는 학습 도구',
    order: 10,
    studentEntry: () => import('./SpellingLookupTool')
};
