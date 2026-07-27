/**
 * 학생의 글쓰기 활동을 가볍게 돌아보는 고정 모듈.
 * 원천 이벤트는 DB에만 두고 화면은 일별 스냅샷 한 건만 읽는다.
 */
export const writingFootprintManifest = {
    id: 'writing-footprint',
    name: '글쓰기 발자국',
    description: '내가 쓰고 고치고 나눈 기록 돌아보기',
    icon: '👣',
    part: 'writing',
    audience: 'student',
    core: true,
    studentRoute: 'writing_footprint',
    studentEntry: () => import('./WritingFootprintPage')
};

export default writingFootprintManifest;
