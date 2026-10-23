import QuizArenaTeacherEntry from '../modules/game/quiz-arena/TeacherEntry.jsx';
import { quizArenaApi } from '../modules/game/quiz-arena/quizArenaApi.js';

/**
 * 수호룡 퀴즈 아레나 교사 화면(관리자 시험). DB 없이 돈다 — 기본 세트는 정적 파일을 그대로 읽고,
 * 내 세트는 이 브라우저 메모리 안에서만 저장·삭제·공유 표시가 된다(새로고침하면 사라짐).
 */
let nextId = 1;
const store = [];
const toMeta = (entry) => ({ id: entry.id, title: entry.meta.title, grade: entry.meta.grade ? Number(entry.meta.grade) : null, subject: entry.meta.subject, unit: entry.meta.unit, description: entry.meta.description, visibility: entry.visibility, source: entry.meta.source, question_count: entry.questions.length, copy_count: 0 });
const mockApi = {
    loadOfficialSets: quizArenaApi.loadOfficialSets,
    listMySets: async () => store.map(toMeta),
    getSet: async (id) => ({ questions: store.find((entry) => entry.id === id)?.questions ?? [] }),
    saveSet: async ({ meta, questions }) => { store.unshift({ id: `dev-${nextId++}`, meta, questions, visibility: 'private' }); return { id: store[0].id, question_count: questions.length }; },
    deleteSet: async (id) => { const at = store.findIndex((entry) => entry.id === id); if (at >= 0) store.splice(at, 1); },
    setVisibility: async (id, visibility) => { const entry = store.find((item) => item.id === id); if (entry) entry.visibility = visibility; }
};

export default function QuizArenaPreview() {
    return (
        <div style={{ maxWidth: 860, margin: '0 auto', padding: 'var(--ui-space-4)' }}>
            <QuizArenaTeacherEntry api={mockApi} />
        </div>
    );
}
