/**
 * 편지지 배경의 원본. PDF 렌더러·출력 양식 선택 화면·교사의 빈 편지지 인쇄가 모두 이 목록을 본다.
 *
 * 계기교육에서 편지를 쓰는 때를 기준으로 골랐다. 학교 프린터가 흑백이거나 잉크 절약인 경우가 많아
 * 사진 이미지 대신 테두리·바탕색·상단 띠로만 그린다. 벡터라 확대해도 또렷하고 번들도 가볍다.
 */

export const LETTER_PAPERS = Object.freeze([
    {
        value: 'plain',
        label: '기본 편지지',
        description: '무늬 없이 줄만 있는 편지지입니다.',
        emoji: '✉️',
        ink: '#334155',
        edge: '#CBD5E1',
        tint: '#F8FAFC',
        band: '#E2E8F0',
    },
    {
        value: 'parents',
        label: '어버이날 편지지',
        description: '5월 8일 부모님께 쓰는 편지에 맞춘 분홍 편지지입니다.',
        emoji: '🌸',
        ink: '#9D174D',
        edge: '#F9A8D4',
        tint: '#FFF1F5',
        band: '#FBCFE8',
    },
    {
        value: 'teacher',
        label: '스승의 날 편지지',
        description: '5월 15일 선생님께 쓰는 편지에 맞춘 초록 편지지입니다.',
        emoji: '🍎',
        ink: '#166534',
        edge: '#86EFAC',
        tint: '#F0FDF4',
        band: '#BBF7D0',
    },
    {
        value: 'soldier',
        label: '나라사랑 편지지',
        description: '호국보훈의 달과 국군의 날 위문편지에 맞춘 남색 편지지입니다.',
        emoji: '🇰🇷',
        ink: '#1E3A8A',
        edge: '#93C5FD',
        tint: '#EFF6FF',
        band: '#BFDBFE',
    },
    {
        value: 'thanks',
        label: '고마운 분들께',
        description: '경찰관·소방관·환경미화원 등 고마운 분들께 쓰는 편지지입니다.',
        emoji: '🙏',
        ink: '#92400E',
        edge: '#FCD34D',
        tint: '#FFFBEB',
        band: '#FDE68A',
    },
    {
        value: 'friend',
        label: '친구 사랑 편지지',
        description: '학교폭력 예방 주간의 칭찬 편지에 맞춘 하늘색 편지지입니다.',
        emoji: '💛',
        ink: '#0E7490',
        edge: '#7DD3FC',
        tint: '#F0F9FF',
        band: '#BAE6FD',
    },
    {
        value: 'farewell',
        label: '헤어지는 친구에게',
        description: '졸업·전학으로 헤어지는 친구에게 쓰는 편지지입니다.',
        emoji: '🎓',
        ink: '#5B21B6',
        edge: '#C4B5FD',
        tint: '#F5F3FF',
        band: '#DDD6FE',
    },
]);

export const DEFAULT_LETTER_PAPER = 'plain';

export const getLetterPaper = (value) => (
    LETTER_PAPERS.find((paper) => paper.value === value) || LETTER_PAPERS[0]
);

/** 출력 양식 선택 화면에 넘길 목록. 보고서의 `renderModes`와 같은 계약이다. */
export const getLetterPaperRenderModes = () => LETTER_PAPERS.map((paper) => ({
    value: paper.value,
    label: `${paper.emoji} ${paper.label}`,
    description: paper.description,
}));
