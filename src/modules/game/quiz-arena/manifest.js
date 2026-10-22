/**
 * 수호룡 퀴즈 아레나 (2026-10-22 시작 — 관리자 시험 중).
 *
 * 교사가 방을 열고 학생이 QR·로그인으로 들어와, 수호룡이 정답 구역으로 달리는 실시간 퀴즈 대결.
 * 게임 서버는 별도 저장소 `suhoryong-arena`(Docker `suhoryong-arena`)가 돌리고, 아지트는 로그인·문제 세트 저장·메뉴를 맡는다.
 * **관리자 시험 모듈(`adminOnly`)**: 교사 놀이터 관리 화면에서 관리자 계정에게만 보이고, 학급 설정이 어떻든
 * 학생·일반 교사에게는 보이지 않는다(`registry.getEnabledModules`·`RegisteredGameModuleCards`). 공개할 때 `adminOnly` 를 떼고
 * FEATURE_MAP·도움말·성능표를 같은 커밋에서 맞춘다.
 */
export const quizArenaManifest = {
    id: 'quiz-arena',
    name: '수호룡 퀴즈 아레나',
    description: '수호룡이 정답 구역으로 달리는 실시간 퀴즈 대결 (개발 중)',
    icon: '⚔️',
    part: 'game',
    audience: 'teacher',
    defaultEnabled: false,
    available: true,
    adminOnly: true,
    teacherEntry: () => import('./TeacherEntry.jsx'),
    playground: { economy: 'earn', pointLabel: '포인트를 모아요', ctaLabel: '시작하기', order: 100, entryMode: 'standard' },
    // 수호룡의 인형뽑기(90) 바로 아래
    management: { title: '수호룡 퀴즈 아레나 관리', order: 95 },
    // 열 때만 읽는다. 실시간 연결은 아레나 서버(별도)에 있고 아지트 홈·학생 화면에는 연결을 만들지 않는다.
    performance: { home: 'none', load: 'on-open', writes: 'rpc', realtime: 'none', maxInitialRows: 50 }
};
