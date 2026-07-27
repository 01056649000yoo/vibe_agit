/**
 * 학생 자율 글쓰기의 첫 모듈.
 * 과제 글쓰기와 저장소·기본 에디터는 공유하되 미션 제출 흐름과는 분리한다.
 */
export const readingLogManifest = {
    id: 'reading-log',
    name: '나의 독서록',
    description: '읽은 책과 내 생각을 언제든 기록하기',
    icon: '📚',
    part: 'writing',
    audience: 'student',
    core: true,
    studentRoute: 'reading_logs',
    studentEntry: () => import('./ReadingLogPage'),
    teacherEntry: () => import('./teacher/TeacherReadingLogManager')
};

export default readingLogManifest;
