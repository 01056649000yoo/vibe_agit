import { getTeacherGuideTarget } from './teacherGuideRegistry.js';

const step = (id, title, purpose, guideRef, sectionRef = null) => ({
    id,
    title,
    purpose,
    guideRef,
    ...(sectionRef ? { sectionRef } : {}),
    target: getTeacherGuideTarget(guideRef)
});

/**
 * 활용 안내서는 큰 흐름만 소유한다.
 * 버튼 순서·주의사항 같은 상세 내용은 guideRef가 가리키는 기존 탭 도움말에서 직접 읽는다.
 */
export const TEACHER_GUIDE_JOURNEYS = Object.freeze([
    {
        id: 'getting-started',
        icon: '🌱',
        title: '처음 시작하기',
        summary: '학급과 학생을 준비하고 첫 수업 전에 필요한 기본 설정을 마칩니다.',
        estimatedTime: '약 10분',
        steps: [
            step('prepare-class', '학급 만들기', '수업할 학급을 만들고 대표 학급과 보관 기준을 확인합니다.', 'settings:class'),
            step('invite-students', '학생 등록과 접속 코드 배부', '학생을 등록하고 개인별 접속 코드를 안전하게 전달합니다.', 'students'),
            step('prepare-editor', '글쓰기 도움 기능 설정', '학생 글쓰기 화면에서 사용할 기능을 고르고 실제 학생 화면에 적용합니다.', 'settings:writing-editor')
        ]
    },
    {
        id: 'first-writing-class',
        icon: '✍️',
        title: '첫 글쓰기 수업 운영하기',
        summary: '과제를 만들고 학생 제출을 확인한 뒤 다시 쓰기·승인·평가까지 이어 갑니다.',
        estimatedTime: '수업 전 10분',
        steps: [
            step('create-mission', '과제 만들기', '글 종류와 조건을 정하고 학생 화면을 확인한 뒤 과제를 공개합니다.', 'dashboard', 'create'),
            step('review-submissions', '제출 확인과 피드백', '학생별 제출 상태를 보고 글을 읽은 뒤 확인 또는 다시 쓰기를 결정합니다.', 'dashboard', 'review'),
            step('approve-and-evaluate', '승인과 평가로 마무리', '완성 글을 승인하고 필요하면 평가와 리포트로 이어 갑니다.', 'dashboard', 'complete'),
            step('set-ai-standards', 'AI 피드백 기준 정하기', 'AI가 학생에게 제안할 말투와 평가 문장의 기준을 수업에 맞게 정합니다.', 'settings:ai-prompts')
        ]
    },
    {
        id: 'self-writing',
        icon: '📚',
        title: '학생 자율 글쓰기 지도하기',
        summary: '독서록과 일기를 꾸준히 확인하고 활동과 책장·내보내기로 연결합니다.',
        estimatedTime: '주 1~2회',
        steps: [
            step('reading-logs', '독서록 확인', '학생 독서록을 확인하고 보상과 학생별 책장을 관리합니다.', 'reading-logs'),
            step('reading-events', '독서 활동 운영', '독서마라톤의 경기 방식과 거리·모둠·메달 조건을 운영합니다.', 'reading-events'),
            step('diaries', '일기 확인', '공개 범위를 존중하며 학생 일기를 확인하고 책장으로 이어 줍니다.', 'diaries'),
            step('archive-writing', '완성 글 보관과 내보내기', '확인한 글을 다시 찾고 필요한 형식으로 안전하게 내보냅니다.', 'archive')
        ]
    },
    {
        id: 'spelling-and-ai',
        icon: '🔎',
        title: '맞춤법과 AI 기능 활용하기',
        summary: '학생의 맞춤법 확인을 돕고 학급에서 나온 표현을 검수된 배움 자료로 발전시킵니다.',
        estimatedTime: '설정 후 주 1회 확인',
        steps: [
            step('enable-spelling-ai', 'AI 맞춤법 검사 사용 조건 확인', '다시 쓰기 단계에서만 열리는 검사 조건과 외부 전송 범위를 확인합니다.', 'settings:writing-editor'),
            step('curate-spelling', '맞춤법 배움 데이터 운영', '학생 검색과 AI 검사 결과의 주간 정선, 공통 반영, 학급별 추가 흐름을 확인합니다.', 'settings:module:spelling-learning'),
            step('review-ai-standards', 'AI 기준과 결과 확인', 'AI 결과는 자동 확정하지 않고 교사가 기준과 실제 결과를 함께 검토합니다.', 'settings:ai-prompts')
        ]
    },
    {
        id: 'class-operations',
        icon: '🧰',
        title: '학급 운영과 수업 도구 활용하기',
        summary: '학생 활동을 살피고 교실에서 바로 쓰는 도구를 현재 학급과 연결합니다.',
        estimatedTime: '필요할 때',
        steps: [
            step('recent-activity', '최근 활동 훑어보기', '학급에서 방금 올라온 글·독서록·댓글을 갈래와 기간으로 좁혀 봅니다.', 'recent-activity'),
            step('student-agits', '학생 아지트 살펴보기', '학생별 아지트와 글 활동을 읽기 전용으로 확인합니다.', 'student-agits'),
            step('comments', '학생 댓글 관리', '처리할 댓글을 찾고 현재 조건을 유지하며 확인 기록을 남깁니다.', 'comments'),
            step('class-footprints', '학급 발자국 확인', '학급이 쌓은 글쓰기 양과 흐름, 포인트 오고 감을 한 화면에서 봅니다.', 'footprints'),
            step('tool-overview', '학급운영도구 고르기', '현재 학급 명부를 사용하는 수업 도구를 한곳에서 엽니다.', 'tools'),
            step('class-board', '우리 반 스크린 띄우기', '수업별 화면을 탭으로 준비하고 기본 스크린을 전체화면으로 열어 안내 자료와 오늘의 글쓰기 현황을 함께 보여 줍니다.', 'class-board'),
            step('meal-board', '급식판 활용', '학교 급식을 확인하고 학생 정보가 빠진 화면을 교실에 크게 띄웁니다.', 'meal-board'),
            step('classroom-arrangement', '자리와 역할 배치', '교실 모양과 조건을 준비해 자리·역할을 배정하고 결과를 보완합니다.', 'classroom-arrangement', 'seat'),
            step('neighbor-agit', '이웃 학급과 글 나누기', '공간을 만들거나 초대받아 연결하고 학생 공개와 글 검토를 관리합니다.', 'neighbor-agit')
        ]
    },
    {
        id: 'motivation',
        icon: '🎡',
        title: '포인트와 동기부여 기능 활용하기',
        summary: '학생 화면 노출을 조절하고 성장·학습 보상의 기준을 오해 없이 운영합니다.',
        estimatedTime: '학기 초 설정',
        steps: [
            step('playground-modules', '놀이 활동 켜고 끄기', '학급 학생에게 보여 줄 놀이 활동을 고르고 각 활동 설정으로 들어갑니다.', 'playground'),
            step('dragon', '작가 수호룡 운영', '글쓰기 성장과 학기별 시즌 마감 순서를 확인합니다.', 'dragon'),
            step('vocab-tower', '어휘의 탑 운영', '익힘·도전·포인트 기준을 정하고 학생의 단계별 학습을 지원합니다.', 'vocab-tower')
        ]
    },
    {
        id: 'evaluation-records',
        icon: '📝',
        title: '평가와 평어 작성하기',
        summary: '성취기준과 실제 학생 기록을 바탕으로 평가를 입력하고 평어 문장을 준비합니다.',
        estimatedTime: '평가 시기',
        steps: [
            step('evaluation', '학생 평가 입력', '과제의 성취기준을 고르고 학생별 실제 평가 결과를 기록합니다.', 'evaluation'),
            step('comments-for-records', '평어 문장 만들기', '입력한 평가 결과로 덧붙일 문장을 만들고 교사가 최종 수정합니다.', 'activity'),
            step('mission-evaluation', '과제에서 평가로 연결', '승인한 학생 글을 평가 화면과 리포트로 이어 갑니다.', 'dashboard', 'complete')
        ]
    },
    {
        id: 'term-closing',
        icon: '📦',
        title: '학기 마무리와 자료 관리',
        summary: '학생 기록을 내보내고 되돌릴 수 없는 학기 마감과 삭제 작업을 순서대로 처리합니다.',
        estimatedTime: '학기말',
        steps: [
            step('export-records', '글과 기록 내보내기', '보관한 글을 필요한 형식으로 확인하고 내보냅니다.', 'archive'),
            step('close-dragon-season', '수호룡 시즌 마감', '작별 편지·시즌 종료·새 학기 시작의 차이를 확인한 뒤 진행합니다.', 'dragon'),
            step('archive-or-delete-class', '학급 보관과 삭제', '복구 가능한 보관과 되돌릴 수 없는 영구 삭제를 구분합니다.', 'settings:class')
        ]
    }
]);

export const getTeacherGuideJourney = (journeyId) => (
    TEACHER_GUIDE_JOURNEYS.find((journey) => journey.id === journeyId) || null
);

export const getJourneysForGuide = (guideId) => TEACHER_GUIDE_JOURNEYS.flatMap((journey) => (
    journey.steps
        .filter((journeyStep) => journeyStep.guideRef === guideId)
        .map((journeyStep) => ({ journey, step: journeyStep }))
));
