import { getAllModules } from '../registry';

export const DASHBOARD_IDS = Object.freeze({
    CLASS_OPERATIONS: 'class-operations',
    CLASS_FOOTPRINT: 'class-footprint'
});

export const DASHBOARD_CARD_CONTRACT_VERSION = 1;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * 점으로 구분한 경로에서 값을 읽는다. 카드 매니페스트가 화면 컴포넌트의 데이터 구조를
 * 직접 알지 않아도 되게 하는 공통 계약이다.
 */
export const getDashboardValue = (source, path, fallback = undefined) => {
    if (!path) return source ?? fallback;
    const value = String(path).split('.').reduce(
        (current, key) => (current == null ? undefined : Reflect.get(current, key)),
        source
    );
    return value ?? fallback;
};

export const getFirstDashboardValue = (source, paths, fallback = undefined) => {
    for (const path of paths || []) {
        const value = getDashboardValue(source, path);
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return fallback;
};

export const validateDashboardCard = (card, dashboardId) => {
    const problems = [];
    if (!isRecord(card)) return ['카드가 객체가 아님'];
    if (!card.id) problems.push('id 없음');
    if (!card.section) problems.push('section 없음');
    if (!card.renderer) problems.push('renderer 없음');
    if (!card.title && !card.label) problems.push('title/label 없음');
    if (card.contractVersion !== DASHBOARD_CARD_CONTRACT_VERSION) {
        problems.push(`지원하지 않는 contractVersion: ${card.contractVersion}`);
    }
    if (card.surfaces && !Array.isArray(card.surfaces)) problems.push('surfaces가 배열이 아님');
    if (card.dashboard && card.dashboard !== dashboardId) {
        problems.push(`dashboard 불일치: ${card.dashboard}`);
    }
    return problems;
};

/**
 * 코어 카드와 각 기능 모듈의 dashboardCards 기여분을 하나로 합친다.
 * 새 모듈은 대시보드 본체를 수정하지 않고 자기 manifest에 카드만 등록한다.
 */
export function getDashboardCards(dashboardId, builtInCards = [], options = {}) {
    const withSource = (card, sourceModuleId) => ({
        contractVersion: DASHBOARD_CARD_CONTRACT_VERSION,
        ...card,
        sourceModuleId: card.sourceModuleId || sourceModuleId
    });
    const cards = [
        ...builtInCards.map((card) => withSource(card, 'core')),
        ...getAllModules()
            .filter((module) => module.available !== false)
            .flatMap((module) => {
                const contributed = module.dashboardCards
                    ? Reflect.get(module.dashboardCards, dashboardId)
                    : undefined;
                return Array.isArray(contributed)
                    ? contributed.map((card) => withSource(card, module.id))
                    : [];
            })
    ];

    const seenIds = new Set();
    const validCards = cards.filter((card) => {
        const problems = validateDashboardCard(card, dashboardId);
        const sectionRenderers = options.renderers
            ? Reflect.get(options.renderers, card?.section)
            : undefined;
        if (options.renderers && !Array.isArray(sectionRenderers)) {
            problems.push(`지원하지 않는 section: ${card.section}`);
        } else if (Array.isArray(sectionRenderers) && !sectionRenderers.includes(card?.renderer)) {
            problems.push(`지원하지 않는 renderer: ${card.renderer}`);
        }
        if (seenIds.has(card?.id)) problems.push(`id 중복: ${card.id}`);
        if (card?.id) seenIds.add(card.id);

        if (problems.length && import.meta.env.DEV) {
            console.error(`[대시보드 카드] ${dashboardId}/${card?.id || '(id없음)'}: ${problems.join(', ')}`);
        }
        return problems.length === 0;
    });

    return validCards.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}
