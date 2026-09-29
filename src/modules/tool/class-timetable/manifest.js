/**
 * 학급 시간표 관리 (2026-09-29 선생님 요청) — 기초 시간표·주간 시간표·지난 기록.
 * 우리 반 스크린의 `시간표` 위젯(class-board/widgets/timetable)이 여기서 저장한 것을 보여 준다.
 */
export const classTimetableManifest = {
    id: 'class-timetable',
    name: '학급 시간표 관리',
    description: '기초 시간표를 입력하고 주마다 바뀐 수업을 기록해요',
    icon: '🗓️',
    part: 'tool',
    audience: 'teacher',
    available: true,
    teacherEntry: () => import('./TeacherEntry.jsx'),
    // 알림장(15) 바로 뒤. 알림장·시간표·자리 배치처럼 교실 운영 도구를 한데 둔다.
    tool: { order: 16, launchMode: 'embedded' },
    // 성능표(PERFORMANCE_HARNESS.md): 홈 조회 없음, 열 때 1회(+주를 옮길 때 그 주 1회), 쓰기는 담당 교사 RPC,
    // 실시간 없음, 지난 기록은 20줄씩.
    performance: { home: 'none', load: 'on-open', writes: 'rpc', realtime: 'none', maxInitialRows: 20 }
};
