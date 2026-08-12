export const pointNotificationDefinitions = Object.freeze([
    {
        eventType: 'points.adjusted',
        icon: 'P',
        tone: 'points',
        title: '포인트 내역이 생겼어요',
        message: (payload) => {
            const delta = Number(payload.point_delta || 0);
            const amount = `${delta > 0 ? '+' : ''}${delta}P`;
            return `${amount} · ${payload.reason || '선생님이 포인트를 조정했어요.'}`;
        },
        action: 'confirm',
        actionLabel: '확인했어요'
    }
]);
