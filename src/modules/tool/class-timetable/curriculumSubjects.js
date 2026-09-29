/*
 * 초등 교과 이름 — 2022 개정 교육과정(2026년 현재 초등 전 학년 적용).
 *
 * 학급 시간표 관리에서 학년을 고르면 이 목록이 과목 단추로 배열된다. 교육과정이 바뀌거나 이름이
 * 틀렸으면 **이 파일 하나만** 고친다(화면·위젯·검사가 모두 여기서 읽는다).
 * 목록에 없는 과목(학교자율시간 과목 이름·외부 강의·행사)은 교사가 직접 적는다.
 */

const MIDDLE = Object.freeze(['국어', '사회', '도덕', '수학', '과학', '체육', '음악', '미술', '영어', '창의적 체험활동']);

export const CURRICULUM_SUBJECTS = Object.freeze({
    // 1~2학년: 국어·수학·통합교과(바른 생활·슬기로운 생활·즐거운 생활)·창의적 체험활동
    lower: Object.freeze(['국어', '수학', '바른 생활', '슬기로운 생활', '즐거운 생활', '창의적 체험활동']),
    // 3~4학년
    middle: MIDDLE,
    // 5~6학년: 3~4학년 과목 + 실과(과학 다음)
    upper: Object.freeze([...MIDDLE.slice(0, 5), '실과', ...MIDDLE.slice(5)]),
});

/* 창의적 체험활동의 영역(2022 개정). 과목 단추 옆에 작게 둔다. */
export const CREATIVE_ACTIVITY_AREAS = Object.freeze(['자율·자치활동', '동아리활동', '진로활동']);

export const TIMETABLE_GRADES = Object.freeze([1, 2, 3, 4, 5, 6]);

export const subjectsForGrade = (grade) => {
    const value = Number(grade);
    if (value === 1 || value === 2) return CURRICULUM_SUBJECTS.lower;
    if (value === 3 || value === 4) return CURRICULUM_SUBJECTS.middle;
    if (value === 5 || value === 6) return CURRICULUM_SUBJECTS.upper;
    return CURRICULUM_SUBJECTS.middle;
};

/** 교육과정 과목(모든 학년)과 창체 영역 — 직접 적은 과목을 가려낼 때 쓴다. */
export const ALL_CURRICULUM_NAMES = Object.freeze(new Set([
    ...CURRICULUM_SUBJECTS.lower, ...CURRICULUM_SUBJECTS.upper, ...CREATIVE_ACTIVITY_AREAS,
]));
