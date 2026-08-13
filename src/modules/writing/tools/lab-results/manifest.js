export const labResultsToolManifest = {
    id: 'lab-results',
    label: '연구소 결과 불러오기',
    description: '학생이 연구소에서 완성한 개요·질문·문장을 현재 글에 참고하거나 넣는 도구',
    teacherDescription: '학생이 본인 연구소 결과만 열어 보고 일반 글 본문에 직접 넣을 수 있습니다.',
    order: 20,
    triggerLabel: '연구소 결과 불러오기',
    triggerHelp: '개요, 질문, 한 줄 문장을 내 글에 활용해요.',
    triggerEmoji: '🧪',
    performance: { home: 'none', load: 'on-open', writes: 'none', realtime: 'none', maxInitialRows: 20 },
    studentEntry: () => import('./LabResultsTool')
};
