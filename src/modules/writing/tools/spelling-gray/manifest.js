import { SPELLING_GRAY_TOOL_ID } from '../../editor-settings/settings';

/**
 * 회색 점선 '한번 살펴볼까요?' — 학생 입력기(student-input) 안에 그어지는 표시라 도구 줄 단추도, 따로 여는 창도 없다.
 * 이 매니페스트는 선생님 글쓰기 설정에 켜기 줄을 하나 띄우는 데만 쓴다(surface 'inline').
 */
export const spellingGrayToolManifest = {
    id: SPELLING_GRAY_TOOL_ID,
    label: '한번 살펴볼까요? (회색 점선)',
    description: '띄어쓰기·받침 오타 가운데 틀렸을 수 있는 곳에 회색 점선을 긋는 기능',
    teacherDescription: '빨간 물결(틀렸어요) 말고, 틀렸을 수도 있는 곳에 회색 점선을 긋습니다. 맞춤법 찾아보기를 끄면 함께 꺼집니다. 학생이 [이렇게 고치기]나 [그대로 두기]를 고르고, 글을 저절로 바꾸지 않습니다. 글은 우리 서버(맥미니) 안에서만 분석하며 밖으로 보내지 않습니다. 고른 결과만 학급 단위로 기록합니다(학생 이름 없음, 60일 보관).',
    order: 15,
    surface: 'inline',
    triggerEmoji: '🔍',
    // 2026-10-08 선생님 결정으로 기본 켜짐(20261384). 원치 않는 학급은 끈다.
    defaultEnabled: true,
    performance: { home: 'none', load: 'on-type', writes: 'on-choice', realtime: 'none', maxInitialRows: 0 }
};
