import QuizArenaTeacherEntry from '../modules/game/quiz-arena/TeacherEntry.jsx';

/** 수호룡 퀴즈 아레나 교사 화면(관리자 시험). 기본 세트 만들기는 정적 자료(`/data`·`/spelling`)만 읽어 DB 없이 돈다. */
export default function QuizArenaPreview() {
    return (
        <div style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--ui-space-4)' }}>
            <QuizArenaTeacherEntry activeClass={{ id: 'dev', name: '시험 학급' }} isMobile={false} />
        </div>
    );
}
