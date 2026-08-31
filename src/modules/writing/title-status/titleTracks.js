import {
    DIARY_LEVELS,
    READER_LEVELS,
    READING_LEVELS,
    WRITER_LEVELS
} from '../../../constants/writerLevels';

/** 네 성장 칭호의 화면 이름·색·그림 방식을 모든 학생 화면이 함께 쓰는 원본. */
export const TITLE_TRACKS = Object.freeze({
    writer: Object.freeze({
        id: 'writer', rewardEnabled: false,
        label: '작가 칭호', shortLabel: '작가', icon: '✍️', levels: WRITER_LEVELS, assetKind: 'writer',
        accent: '#F4B740', deepAccent: '#9A5B00',
        border: 'rgba(255,211,117,.48)', glow: 'rgba(81,48,8,.18)',
        background: 'linear-gradient(155deg,rgba(255,247,220,.98),rgba(255,220,143,.92))',
        description: '선생님 과제와 일반 자유글로 성장해요. 자율 일기와 독서록은 각각의 칭호에서 따로 자라요.'
    }),
    reader: Object.freeze({
        id: 'reader', rewardEnabled: false,
        label: '소통 칭호', shortLabel: '소통', icon: '💬', levels: READER_LEVELS, assetKind: 'reader',
        accent: '#72B7FF', deepAccent: '#145EA8',
        border: 'rgba(139,199,255,.48)', glow: 'rgba(8,54,98,.2)',
        background: 'linear-gradient(155deg,rgba(237,248,255,.98),rgba(171,216,255,.92))',
        description: '친구의 서로 다른 글에 공감하거나 댓글을 남기면 1점, 댓글은 20자마다 보너스 1점이 붙어요. 한 글에서는 최대 4점까지 얻어요.'
    }),
    diary: Object.freeze({
        id: 'diary', rewardEnabled: true,
        label: '기록가 칭호', shortLabel: '기록가', icon: '📔', levels: DIARY_LEVELS,
        accent: '#C58AEE', deepAccent: '#713E98',
        border: 'rgba(197,138,238,.48)', glow: 'rgba(79,42,104,.18)',
        background: 'linear-gradient(155deg,rgba(252,244,255,.98),rgba(226,190,247,.92))',
        description: '이번 학기에 일기를 쓰고 선생님이 확인한 서로 다른 날짜를 세요. 같은 날에는 한 번만 인정하고 연속으로 쓸 필요는 없어요.'
    }),
    reading: Object.freeze({
        id: 'reading', rewardEnabled: true,
        label: '독서가 칭호', shortLabel: '독서가', icon: '📚', levels: READING_LEVELS,
        accent: '#68C79A', deepAccent: '#16704A',
        border: 'rgba(104,199,154,.5)', glow: 'rgba(22,90,62,.18)',
        background: 'linear-gradient(155deg,rgba(240,255,247,.98),rgba(174,230,198,.92))',
        description: '선생님이 확인한 독서록 수와 서로 다른 책 수를 함께 세요. 같은 책을 다시 읽은 기록은 편수에는 남지만 책 수에는 한 번만 들어가요.'
    })
});

export const getTitleTrack = (kind) => {
    if (kind === 'reader') return TITLE_TRACKS.reader;
    if (kind === 'diary') return TITLE_TRACKS.diary;
    if (kind === 'reading') return TITLE_TRACKS.reading;
    return TITLE_TRACKS.writer;
};

export const titleBadgeSrc = (kind, level) => `/assets/title-badges/${kind}-level-${level}.webp`;
