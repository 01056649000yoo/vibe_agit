import { DEFAULT_STATUS_SECTIONS } from './statusSections';

export const writingStatusWidgetManifest = Object.freeze({
  id: 'writing-status',
  name: '글쓰기 현황',
  description: '미션별 제출 이름표와 오늘의 일기·독서록 현황을 보여 줘요',
  icon: '✍️',
  version: 1,
  type: 'live',
  projectorSafe: true,
  maxInstances: 1,
  requestBudget: { initial: 1, refreshMs: 20_000, realtime: false },
  defaultPlacement: { zone: 'sidebar', size: 'large' },
  createDefaultConfig: () => ({ missionId: null, tone: 'navy', sections: [...DEFAULT_STATUS_SECTIONS] }),
  load: () => import('./WritingStatusWidget'),
  loadSettings: () => import('./WritingStatusSettings'),
});
