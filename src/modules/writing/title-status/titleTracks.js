import {
    DIARY_LEVELS,
    READER_LEVELS,
    READING_LEVELS,
    WRITER_LEVELS
} from '../../../constants/writerLevels.js';

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
        description: '이번 학기에 완성하고 선생님이 확인한 독서록 편수로 자라요. 같은 책이라도 새 독서록을 쓰고 확인받으면 각각 한 편으로 인정해요.'
    })
});

/** 학생 칭호 상세와 교사 도움말이 같은 시즌·보상 원칙을 설명하도록 하는 안내 원본. */
export const TITLE_SYSTEM_GUIDE = Object.freeze({
    season: '작가·소통·기록가·독서가 네 칭호는 같은 학기 시즌에서 함께 자라요.',
    reset: '성장 마감 기간에는 수치가 멈추고, 새 학기를 시작할 때 네 칭호가 첫 단계로 돌아가요. 이미 쓴 글·보유 포인트·구입한 소품은 사라지지 않아요.',
    reward: '기록가·독서가는 2~7단계 달성 보상이 자동 지급되지 않아요. 해제된 단계의 `받기`를 학생이 직접 눌러야 하며, 각 보상은 한 시즌에 한 번만 받아요.',
    rewardDeadline: '보상은 이미 올라간 단계도 받을 수 있고, 성장 마감 기간까지 받을 수 있어요. 시즌 종료 후에는 지난 시즌의 미수령 보상을 받을 수 없어요.',
    activityOnly: '작가·소통 칭호는 단계 보상 버튼이 없고, 글쓰기·소통 활동의 기존 보상을 그대로 받아요.'
});

export const getTitleTrack = (kind) => {
    if (kind === 'reader') return TITLE_TRACKS.reader;
    if (kind === 'diary') return TITLE_TRACKS.diary;
    if (kind === 'reading') return TITLE_TRACKS.reading;
    return TITLE_TRACKS.writer;
};

export const titleBadgeSrc = (kind, level) => `/assets/title-badges/${kind}-level-${level}.webp`;
