export const aiSpellCheckToolManifest = {
    id: 'ai-spell-check',
    label: 'AI 맞춤법 검사',
    description: '학생이 다 쓴 글을 AI가 한 번 훑어 맞춤법·띄어쓰기 오류만 짚어 주는 도구',
    teacherDescription: '학생이 글 하나에 **한 번만** 쓸 수 있습니다. 글 내용이 AI(OpenAI)로 전송되며, 결과는 고쳐 주는 제안일 뿐 글을 자동으로 바꾸지 않습니다.',
    order: 30,
    // 글 한 편에 매인 도구라 도구 줄이 아니라 글쓰기 화면 안에서 열린다.
    surface: 'editor',
    triggerLabel: 'AI 맞춤법 검사',
    triggerHelp: '다 쓴 뒤 한 번, 틀린 곳을 모아서 알려줘요.',
    triggerEmoji: '🔍',
    // 새 외부 전송이 생기는 기능이라 기본은 꺼짐이다. 교사가 학급마다 켠다.
    defaultEnabled: false,
    performance: { home: 'none', load: 'on-open', writes: 'once-per-post', realtime: 'none', maxInitialRows: 12 },
    studentEntry: () => import('./AiSpellCheckPanel')
};
