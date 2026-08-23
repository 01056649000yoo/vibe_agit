import ClassroomArrangementTeacherEntry from '../modules/tool/classroom-arrangement/TeacherEntry';
import '../styles/design-system.css';
import '../index.css';

const students = [
  ['01', '도윤', 'A'], ['02', '서윤', 'B'], ['03', '하준', 'A'], ['04', '지아', 'B'],
  ['05', '현우', 'A'], ['06', '수아', 'B'], ['07', '지호', 'A'], ['08', '예린', 'B']
].map(([id, name, group]) => ({ id, name, group }));

const previewWorkspace = {
  students,
  settings: {
    seat: {
      forbiddenPairs: [['01', '03']], balanceMode: 'strict', fixedSeats: [{ studentId: '02', row: 1, col: 1 }],
      avoidDuplicates: true, seatLayout: { rows: 2, cols: 4, activeSeats: ['0,0', '0,1', '0,2', '0,3', '1,0', '1,1', '1,2', '1,3'] }
    },
    role: {
      forbiddenPairs: [['01', '03']], balanceMode: 'strict', avoidDuplicates: true,
      roleGroups: [{ id: 'leader', name: '모둠장', count: 2 }, { id: 'record', name: '기록자', count: 2 }, { id: 'present', name: '발표자', count: 2 }, { id: 'helper', name: '준비·정리', count: 2 }]
    },
    studentGroups: Object.fromEntries(students.map((student) => [student.id, student.group]))
  },
  history: []
};

export default function ArrangementPreview() {
  return <main style={{ maxWidth: 1320, margin: '0 auto', padding: 24 }}><ClassroomArrangementTeacherEntry activeClass={{ id: 'preview-class', name: '햇살반' }} previewWorkspace={previewWorkspace} /></main>;
}
