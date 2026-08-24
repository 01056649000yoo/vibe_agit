export const labResultsToolManifest = {
    id: 'lab-results',
    label: '연구소 결과 불러오기',
    description: '학생이 연구소에서 완성한 개요·질문·문장을 현재 글에 참고하거나 넣는 도구',
    teacherDescription: '학생 글쓰기 창의 글쓰기 참고함 안에서 본인 연구소 결과를 골라 펼쳐 두거나 본문에 넣습니다. 끄면 참고함에서 연구소 자료가 사라집니다.',
    order: 20,
    // 이 도구의 자리는 **참고함**이다. 참고함에 이미 `연구소 자료 불러오기`가 있어
    // 글쓰기 도구 줄에 같은 버튼을 또 두지 않는다(2026-08-19 사용자 지적).
    surface: 'reference',
    triggerLabel: '연구소 결과 불러오기',
    triggerHelp: '개요, 질문, 한 줄 문장을 내 글에 활용해요.',
    triggerEmoji: '🧪',
    performance: { home: 'none', load: 'on-open', writes: 'none', realtime: 'none', maxInitialRows: 20 },
    studentEntry: () => import('./LabResultsTool')
};
