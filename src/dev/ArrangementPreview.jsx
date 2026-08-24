import ClassroomArrangementTeacherEntry from '../modules/tool/classroom-arrangement/TeacherEntry';
import '../styles/design-system.css';
import '../index.css';

const students = [
  ['01', '김도윤', 'A'], ['02', '이서윤', 'B'], ['03', '박하준', 'A'], ['04', '최지아', 'B'],
  ['05', '정현우', 'A'], ['06', '강수아', 'B'], ['07', '조지호', 'A'], ['08', '윤예린', 'B'],
  ['09', '장민준', 'A'], ['10', '임서연', 'B'], ['11', '한주원', 'A'], ['12', '오지우', 'B'],
  ['13', '서건우', 'A'], ['14', '신하윤', 'B'], ['15', '권우진', 'A'], ['16', '황채원', 'B'],
  ['17', '안시우', 'A'], ['18', '송다은', 'B'], ['19', '전유나', 'A'], ['20', '홍정우', 'B'],
  ['21', '문태윤', 'A'], ['22', '양나윤', 'B'], ['23', '배성민', 'A'], ['24', '백예준', 'B'],
  ['25', '허가온', 'A'], ['26', '남재이', 'B'], ['27', '심소율', 'A'], ['28', '노준서', 'B']
].map(([id, name, group]) => ({ id, name, group }));

const previewSeats = Array.from({ length: 28 }, (_, index) => `${Math.floor(index / 7)},${index % 7}`);

const previewWorkspace = {
  students,
  settings: {
    seat: {
      forbiddenPairs: [], balanceMode: 'none', fixedSeats: [],
      avoidDuplicates: true, seatLayout: { rows: 4, cols: 7, activeSeats: previewSeats }
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
