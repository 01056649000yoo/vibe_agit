export const MISSION_WORKSPACE_VIEW_STORAGE_KEY = 'teacher-mission-workspace-view-v1';
export const DEFAULT_MISSION_WORKSPACE_VIEW = 'manage';

export const MISSION_WORKSPACE_VIEW_OPTIONS = Object.freeze([
    Object.freeze({ id: 'manage', label: '과제 만들기·관리', icon: '✍️' }),
    Object.freeze({ id: 'board', label: '실시간 제출 현황', icon: '📡' })
]);

const VALID_MISSION_WORKSPACE_VIEWS = new Set(
    MISSION_WORKSPACE_VIEW_OPTIONS.map((option) => option.id)
);

export const normalizeMissionWorkspaceView = (value) => (
    VALID_MISSION_WORKSPACE_VIEWS.has(value) ? value : DEFAULT_MISSION_WORKSPACE_VIEW
);
