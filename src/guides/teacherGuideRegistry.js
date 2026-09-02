import { TEACHER_GUIDES } from '../constants/teacherGuides.js';

/**
 * 교사 도움말과 실제 화면 이동 대상을 한곳에서 연결한다.
 *
 * 탭 도움말과 전체 활용 안내서는 모두 TEACHER_GUIDES 원본을 읽고, 화면 바로가기는
 * 이 표만 사용한다. 안내서마다 tab/tool/module 문자열을 다시 적으면 기능 이동 경로가
 * 바뀔 때 일부 안내서만 과거 주소로 남기 쉽다.
 */
export const TEACHER_GUIDE_TARGETS = Object.freeze({
    'settings:class': { tab: 'settings', section: 'class' },
    'settings:ai-prompts': { tab: 'settings', section: 'ai-prompts' },
    'settings:writing-editor': { tab: 'settings', section: 'writing-editor' },
    'settings:module:spelling-learning': { tab: 'settings', section: 'module:spelling-learning' },
    'neighbor-agit': { tab: 'neighbor-agit' },
    dashboard: { tab: 'dashboard' },
    'reading-logs': { tab: 'reading-logs' },
    'reading-events': { tab: 'reading-logs' },
    diaries: { tab: 'diaries' },
    archive: { tab: 'archive' },
    comments: { tab: 'comments' },
    'recent-activity': { tab: 'recent-activity' },
    'student-agits': { tab: 'student-agits' },
    footprints: { tab: 'footprints' },
    playground: { tab: 'playground' },
    students: { tab: 'students' },
    evaluation: { tab: 'evaluation' },
    activity: { tab: 'activity' },
    tools: { tab: 'tools' },
    'class-board': { tab: 'tools', tool: 'class-board' },
    'class-notice': { tab: 'tools', tool: 'class-notice' },
    'meal-board': { tab: 'tools', tool: 'meal-board' },
    'classroom-arrangement': { tab: 'tools', tool: 'classroom-arrangement' },
    dragon: { tab: 'playground', module: 'dragon' },
    'vocab-tower': { tab: 'playground', module: 'vocab-tower' }
});

export const getTeacherGuide = (guideId) => Reflect.get(TEACHER_GUIDES, guideId) || null;

export const getTeacherGuideTarget = (guideId) => {
    const target = Reflect.get(TEACHER_GUIDE_TARGETS, guideId);
    return target ? { ...target } : null;
};

export const getTeacherGuideSection = (guideId, sectionId) => {
    const guide = getTeacherGuide(guideId);
    if (!guide || !sectionId) return null;
    return (guide.sections || []).find((section) => section.id === sectionId) || null;
};

export { TEACHER_GUIDES };
