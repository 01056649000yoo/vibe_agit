import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildRoleSlots,
  hasExactSeatCount,
  normalizeRoleSettings,
  normalizeSeatSettings,
  rectangularSeats,
  seatsWithinGrid,
  suggestSeatLayout,
  solveRoles,
  solveSeats
} from '../src/modules/tool/classroom-arrangement/arrangementEngine.js';
import { mapLegacyClassToAgit } from '../src/modules/tool/classroom-arrangement/legacyImport.js';

test('자리 배치는 고정 자리와 학생 수를 지킨다', () => {
  const students = [{ id: 'a', name: '가' }, { id: 'b', name: '나' }, { id: 'c', name: '다' }];
  const result = solveSeats(students, new Set(['0,0', '0,1', '1,0']), {
    fixedSeats: [{ studentId: 'b', row: 2, col: 1 }]
  });
  assert.equal(result.assignments.length, 3);
  assert.deepEqual(result.assignments.find((item) => item.seatKey === '1,0'), {
    seatKey: '1,0', studentId: 'b', studentName: '나', group: null
  });
  assert.equal(new Set(result.assignments.map((item) => item.studentId)).size, 3);
});

test('자리 배치는 학생 수와 활성 좌석 수가 정확히 같을 때만 실행한다', () => {
  const students = [{ id: 'a', name: '가' }, { id: 'b', name: '나' }, { id: 'c', name: '다' }];
  assert.equal(hasExactSeatCount(3, 3), true);
  assert.equal(hasExactSeatCount(3, 4), false);
  assert.equal(hasExactSeatCount(3, 2), false);
  assert.equal(hasExactSeatCount(0, 0), false);
  assert.deepEqual(solveSeats(students, rectangularSeats(2, 2), {}), { assignments: [], violations: 0 });
});

test('자동 맞춤과 격자 축소는 화면 안에 학생 수만큼의 좌석만 남긴다', () => {
  const suggested = suggestSeatLayout(13);
  assert.deepEqual({ rows: suggested.rows, cols: suggested.cols }, { rows: 3, cols: 6 });
  assert.equal(suggested.activeSeats.size, 13);
  assert.deepEqual([...seatsWithinGrid(new Set(['0,0', '1,1', '2,0', '0,2']), 2, 2)], ['0,0', '1,1']);
});

test('역할 나누기는 정원 합계가 학생 수와 같을 때 모두 한 번씩 배정한다', () => {
  const students = [{ id: 'a', name: '가' }, { id: 'b', name: '나' }, { id: 'c', name: '다' }];
  const settings = normalizeRoleSettings({ roleGroups: [
    { id: 'leader', name: '모둠장', count: 1 },
    { id: 'record', name: '기록자', count: 2 }
  ] });
  assert.equal(buildRoleSlots(settings.roleGroups).length, 3);
  const result = solveRoles(students, settings);
  assert.equal(result.assignments.length, 3);
  assert.equal(new Set(result.assignments.map((item) => item.studentId)).size, 3);
});

test('이전 앱 학급 설정은 이름이 하나로 일치하는 아지트 학생만 UUID로 바꾼다', () => {
  const archive = {
    classes: [{ id: 1, name: '옛 반', seatSettings: {
      genderBalance: 'strict', forbiddenPairs: [[10, 11]], fixedSeats: [{ studentId: 10, row: 1, col: 1 }]
    }, roleSettings: { genderBalance: 'strict', forbiddenPairs: [[10, 11]], roleGroups: [{ id: 'r', name: '기록', count: 2 }] } }],
    students: [{ id: 10, classId: 1, name: '가', gender: 'M' }, { id: 11, classId: 1, name: '나', gender: 'F' }]
  };
  const mapped = mapLegacyClassToAgit(archive, 1, [{ id: 'uuid-a', name: '가' }, { id: 'uuid-b', name: '나' }]);
  assert.deepEqual(mapped.seat.forbiddenPairs, [['uuid-a', 'uuid-b']]);
  assert.equal(mapped.seat.fixedSeats[0].studentId, 'uuid-a');
  assert.deepEqual(mapped.studentGroups, { 'uuid-a': 'A', 'uuid-b': 'B' });
  assert.equal(mapped.report.unmatchedNames.length, 0);
});

test('자리·역할 도구는 지연 로딩, 단일 RPC 읽기, 권한·상한 계약을 가진다', async () => {
  const [manifest, api, migration, registry, teacherEntry, settingsEntry, legacyImport, teacherGuides, seatEntry, roleEntry, lotteryMachine, arrangementCss] = await Promise.all([
    readFile('src/modules/tool/classroom-arrangement/manifest.js', 'utf8'),
    readFile('src/modules/tool/classroom-arrangement/classroomArrangementApi.js', 'utf8'),
    readFile('supabase/migrations/20261159_classroom_arrangement_tool.sql', 'utf8'),
    readFile('src/modules/registry.js', 'utf8'),
    readFile('src/modules/tool/classroom-arrangement/TeacherEntry.jsx', 'utf8'),
    readFile('src/modules/tool/classroom-arrangement/ArrangementSettings.jsx', 'utf8'),
    readFile('src/modules/tool/classroom-arrangement/legacyImport.js', 'utf8'),
    readFile('src/constants/teacherGuides.js', 'utf8'),
    readFile('src/modules/tool/classroom-arrangement/SeatArrangement.jsx', 'utf8'),
    readFile('src/modules/tool/classroom-arrangement/RoleArrangement.jsx', 'utf8'),
    readFile('src/modules/tool/classroom-arrangement/LotteryMachine.jsx', 'utf8'),
    readFile('src/modules/tool/classroom-arrangement/classroomArrangement.css', 'utf8')
  ]);
  assert.match(registry, /classroomArrangementManifest/);
  assert.match(manifest, /load: 'on-open'/);
  assert.match(manifest, /realtime: 'none'/);
  assert.match(manifest, /maxInitialRows: 50/);
  assert.match(api, /get_teacher_classroom_arrangement_v1/);
  assert.doesNotMatch(api, /\.from\(/);
  assert.match(migration, /class\.teacher_id = auth\.uid\(\)/);
  assert.match(migration, /LIMIT 100/);
  assert.match(migration, /LIMIT v_limit/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.survival_legacy_archives/);
  assert.match(migration, /source_fingerprint ~ '\^\[a-f0-9\]\{64\}\$'/);
  assert.doesNotMatch(`${teacherEntry}\n${legacyImport}\n${teacherGuides}`, /서바이벌/);
  assert.match(seatEntry, /<LotteryMachine/);
  assert.match(roleEntry, /<LotteryMachine/);
  assert.match(lotteryMachine, /arrange-lottery-drum/);
  assert.match(arrangementCss, /@keyframes arrange-ball-orbit/);
  assert.match(settingsEntry, /학생 남녀 구분/);
  assert.match(settingsEntry, /<option value="A">남<\/option><option value="B">여<\/option>/);
  assert.doesNotMatch(`${settingsEntry}\n${teacherGuides}`, /A\/B|학생 A|학생 B/);
  assert.match(seatEntry, /id: 'slow', label: '천천히', delay: 1500/);
  assert.match(seatEntry, /id: 'normal', label: '보통', delay: 950/);
  assert.match(seatEntry, /id: 'fast', label: '빠르게', delay: 600/);
  assert.match(seatEntry, /group === 'A' \? '남' : group === 'B' \? '여'/);
  assert.match(arrangementCss, /\.arrange-lottery \{ position:absolute;[^}]*top:50%;[^}]*transform:translate\(-50%,-50%\)/);
  assert.doesNotMatch(arrangementCss, /\.arrange-lottery \{[^}]*position:fixed/);
  assert.match(teacherEntry, /arrange-settings-utilities/);
  assert.match(arrangementCss, /\.arrange-settings-utilities \{ display:grid; grid-template-columns:/);
});

test('설정 정규화는 좌석·역할 입력 크기와 화면 밖 좌표를 제한한다', () => {
  const seats = normalizeSeatSettings({ seatLayout: { rows: 99, cols: 99, activeSeats: ['0,0', '0,0', '30,0', '0,30', 'bad'] } });
  assert.equal(seats.seatLayout.rows, 30);
  assert.equal(seats.seatLayout.cols, 30);
  assert.deepEqual(seats.seatLayout.activeSeats, ['0,0']);
  const roles = normalizeRoleSettings({ roleGroups: [{ id: 'a', name: '긴 역할', count: 500 }] });
  assert.equal(roles.roleGroups[0].count, 99);
});
