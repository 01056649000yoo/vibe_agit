import { getAllModules } from '../registry';
import { pointNotificationDefinitions } from '../points/notifications';
import { feedbackNotificationDefinitions, writingNotificationDefinitions } from '../writing/notifications';

const fallbackDefinition = Object.freeze({
    eventType: 'unknown',
    icon: '🔔',
    tone: 'default',
    title: '새로운 활동 알림이 있어요',
    message: () => '새로운 내역을 확인해 주세요.',
    action: 'confirm',
    actionLabel: '확인했어요'
});

const definitions = [
    ...writingNotificationDefinitions,
    ...feedbackNotificationDefinitions,
    ...pointNotificationDefinitions,
    ...getAllModules().flatMap((module) => module.notifications || [])
];

const definitionsByType = new Map(definitions.map((definition) => [definition.eventType, definition]));

export const resolveActivityNotification = (event) => {
    const definition = definitionsByType.get(event?.event_type) || fallbackDefinition;
    const payload = event?.payload || {};
    return {
        ...definition,
        message: typeof definition.message === 'function'
            ? definition.message(payload, event)
            : definition.message
    };
};

export const getActivityNotificationDefinitions = () => [...definitions];
