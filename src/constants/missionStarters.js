/*
 * 첫 과제 예시.
 *
 * 왜 (2026-09-14 사용자 분석): 학생을 등록한 교사 168명 중 과제를 만든 사람은 90명이다.
 * 과제만 만들면 그 뒤는 81%가 학생 글까지 간다 — **첫 과제가 문턱**이다.
 * 그리고 만든 사람은 학생 등록 뒤 **6분** 만에 만들었다. 첫 자리에서 갈린다.
 *
 * 무엇이 막나: 과제 만들기 화면은 태그·질문 마법사·점수·평가 기준까지 있어 처음 보면 크다.
 * 정작 **꼭 채워야 하는 것은 주제와 안내 두 칸**뿐이다. 그리고 "무엇을 쓰게 할까" 를
 * 그 자리에서 정하는 것도 일이다.
 *
 * 그래서 바로 쓸 수 있는 예시를 둔다. 누르면 **폼이 채워진 채 열린다** — 조용히 만들지
 * 않는다. 선생님이 무엇을 만드는지 보고 고친 뒤 저장한다.
 *
 * 안내 글은 **짧게** 썼다. 실제 교사들이 쓴 안내의 중앙값이 53자이고 82%가 100자 미만이다.
 * 예시가 길면 "이만큼 써야 하나" 로 읽혀 오히려 문턱이 높아진다.
 *
 * 장르는 **실제로 쓰이는 이름**을 쓴다(생활문·일기가 가장 많다). 목록에 없는 이름을 넣으면
 * 장르별 화면이 그 과제를 못 알아본다.
 */
export const MISSION_STARTERS = Object.freeze([
    Object.freeze({
        id: 'today-diary',
        emoji: '📔',
        label: '오늘 있었던 일',
        detail: '어느 학년에서나 첫 과제로 쓰기 좋아요',
        title: '오늘 있었던 일',
        guide: '오늘 학교나 집에서 있었던 일 하나를 골라 적어 보세요. 언제, 어디서, 무슨 일이 있었는지 차례대로 쓰면 좋아요.',
        genre: '일기',
        mission_type: '일기',
        min_chars: 100
    }),
    Object.freeze({
        id: 'my-friend',
        emoji: '🙂',
        label: '내 짝을 소개합니다',
        detail: '학기 초에 서로를 알아가며 쓰기 좋아요',
        title: '내 짝을 소개합니다',
        guide: '짝의 좋은 점 하나를 떠올려 적어 보세요. 어떤 일이 있었는지 함께 쓰면 읽는 사람이 더 잘 알 수 있어요.',
        genre: '생활문',
        mission_type: '생활문',
        min_chars: 100
    }),
    Object.freeze({
        id: 'autumn-walk',
        emoji: '🍂',
        label: '가을에 본 것',
        detail: '창밖이나 운동장을 보고 바로 쓸 수 있어요',
        title: '가을에 본 것',
        guide: '오늘 본 가을의 모습을 하나 골라 적어 보세요. 무슨 색이었는지, 어떤 소리가 났는지도 함께 쓰면 좋아요.',
        genre: '생활문',
        mission_type: '생활문',
        min_chars: 80
    })
]);

/** 예시를 지금 폼 값 위에 얹는다. 학급 기본 설정(점수·댓글 등)은 건드리지 않는다. */
export const applyMissionStarter = (formData, starter) => ({
    ...formData,
    title: starter.title,
    guide: starter.guide,
    genre: starter.genre,
    mission_type: starter.mission_type,
    min_chars: starter.min_chars
});
