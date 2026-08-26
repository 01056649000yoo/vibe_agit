export const TEACHER_GUIDE_CENTER_OPEN_EVENT = 'agit:teacher-guide-center-open';

export const openTeacherGuideCenter = ({ guideId = null, journeyId = null, stepId = null } = {}) => {
    window.dispatchEvent(new CustomEvent(TEACHER_GUIDE_CENTER_OPEN_EVENT, {
        detail: { guideId, journeyId, stepId }
    }));
};
