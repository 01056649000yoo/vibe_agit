import { getTitleTrack } from './titleTracks.js';

const resolveLevel = (payload) => {
    const track = getTitleTrack(payload?.track_id);
    const levelNumber = Math.max(1, Number(payload?.level) || 1);
    const level = track.levels.find((item) => item.level === levelNumber) || track.levels.at(0);
    return { track, level };
};

/** 소통·기록가·독서가 성장은 방해되는 모달 대신 학생 홈 활동 알림으로 모은다. */
export const titleNotificationDefinitions = Object.freeze([
    {
        eventType: 'titles.level_up',
        icon: '🏅',
        tone: 'positive',
        title: '칭호가 성장했어요',
        message: (payload) => {
            const { track, level } = resolveLevel(payload);
            const rewardMessage = payload?.reward_claimable
                ? ' 받을 수 있는 단계 보상도 확인해 보세요.'
                : '';
            return `${track.label}가 LV.${level.level} ${level.name} 단계가 되었어요.${rewardMessage}`;
        },
        action: 'custom',
        actionLabel: '칭호와 보상 보기',
        handleAction: ({ event, onOpenTitle }) => onOpenTitle?.(event?.payload?.track_id)
    }
]);
