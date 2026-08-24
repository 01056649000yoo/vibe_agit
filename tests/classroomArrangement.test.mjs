import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  RECENT_ROLE_ROUNDS,
  RECENT_SEAT_ROUNDS,
  buildRoleSlots,
  hasExactSeatCount,
  normalizeRoleSettings,
  normalizeSeatSettings,
  rectangularSeats,
  seatAdjacencyFor,
  seatsWithinGrid,
  suggestSeatLayout,
  solveRoles,
  solveSeats
} from '../src/modules/tool/classroom-arrangement/arrangementEngine.js';
import { mapLegacyClassToAgit } from '../src/modules/tool/classroom-arrangement/legacyImport.js';
import { buildRoleHistoryResult, buildSeatHistoryResult } from '../src/modules/tool/classroom-arrangement/historyResult.js';
import { swapStudents } from '../src/modules/tool/classroom-arrangement/resultSwap.js';

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

test('자리 이웃은 빈칸을 건너뛰지 않는 상하좌우 좌석만 포함한다', () => {
  const adjacency = seatAdjacencyFor(['0,0', '0,1', '1,0', '1,1', '2,0', '0,2']);
  assert.deepEqual(adjacency.get('1,1').sort(), ['0,1', '1,0']);
  assert.deepEqual(adjacency.get('0,0').sort(), ['0,1', '1,0']);
  assert.equal(adjacency.get('1,1').includes('0,0'), false);
});

test('이웃 금지는 상하좌우에서 반드시 지키고 불가능하면 결과를 만들지 않는다', () => {
  const students = [
    { id: 'a', name: '가' }, { id: 'b', name: '나' },
    { id: 'c', name: '다' }, { id: 'd', name: '라' }
  ];
  const possible = solveSeats(students, rectangularSeats(2, 2), { forbiddenPairs: [['a', 'b']] });
  const byStudent = new Map(possible.assignments.map((item) => [item.studentId, item.seatKey.split(',').map(Number)]));
  const [aRow, aCol] = byStudent.get('a');
  const [bRow, bCol] = byStudent.get('b');
  assert.notEqual(Math.abs(aRow - bRow) + Math.abs(aCol - bCol), 1);

  const impossible = solveSeats(students.slice(0, 2), rectangularSeats(1, 2), { forbiddenPairs: [['a', 'b']] });
  assert.deepEqual(impossible, {
    assignments: [], violations: 0,
    error: '고정 자리와 이웃 금지 조건을 만족하는 배치를 찾지 못했습니다.'
  });
});

test('남녀 혼합과 최근 자리·이웃 회피 조건을 따로 저장하고 기존 설정도 이어받는다', () => {
  const legacy = normalizeSeatSettings({ balanceMode: 'strict', avoidDuplicates: true });
  assert.equal(legacy.balanceMode, 'strict');
  assert.equal(legacy.avoidSameSeat, true);
  assert.equal(legacy.avoidSameNeighbor, true);
  assert.equal('avoidDuplicates' in legacy, false);

  const separate = normalizeSeatSettings({ avoidSameSeat: true, avoidSameNeighbor: false });
  assert.equal(separate.avoidSameSeat, true);
  assert.equal(separate.avoidSameNeighbor, false);

  const students = [
    { id: 'a', name: '가', group: 'A' }, { id: 'b', name: '나', group: 'A' },
    { id: 'c', name: '다', group: 'B' }, { id: 'd', name: '라', group: 'B' }
  ];
  const result = solveSeats(students, rectangularSeats(2, 2), { balanceMode: 'strict' });
  assert.equal(result.violations, 0);
});

test('최근 기록 회피는 자리 3회와 역할 4회까지만 반영한다', () => {
  assert.equal(RECENT_SEAT_ROUNDS, 3);
  assert.equal(RECENT_ROLE_ROUNDS, 4);

  const students = [{ id: 'a', name: '가' }];
  const blank = { payload: { assignments: [] } };
  const sameSeat = { payload: { assignments: [{ seatKey: '0,0', studentId: 'a', studentName: '가' }] } };
  const seatSettings = { avoidSameSeat: true };
  assert.equal(solveSeats(students, new Set(['0,0']), seatSettings, [blank, blank, sameSeat], 1).violations, 2);
  assert.equal(solveSeats(students, new Set(['0,0']), seatSettings, [blank, blank, blank, sameSeat], 1).violations, 0);
  const randomSeat = { id: 'seat-random', ...sameSeat };
  const editedSeat = { id: 'seat-edited', payload: { ...sameSeat.payload, edited: true, originalHistoryId: randomSeat.id } };
  assert.equal(solveSeats(students, new Set(['0,0']), seatSettings, [editedSeat, randomSeat], 1).violations, 2);

  const sameRole = { payload: { assignments: [{ roleId: 'r', roleName: '정리', studentId: 'a', studentName: '가' }] } };
  const roleSettings = { avoidDuplicates: true, roleGroups: [{ id: 'r', name: '정리', count: 1 }] };
  assert.equal(solveRoles(students, roleSettings, [blank, blank, blank, sameRole], 1).violations, 5);
  assert.equal(solveRoles(students, roleSettings, [blank, blank, blank, blank, sameRole], 1).violations, 0);
  const randomRole = { id: 'role-random', ...sameRole };
  const editedRole = { id: 'role-edited', payload: { ...sameRole.payload, edited: true, originalHistoryId: randomRole.id } };
  assert.equal(solveRoles(students, roleSettings, [editedRole, randomRole], 1).violations, 5);
});

test('맞바꾸기는 학생 ID·이름·남녀 그룹을 함께 옮긴다', () => {
  const assignments = [
    { seatKey: '0,0', studentId: 'a', studentName: '가', group: 'A' },
    { seatKey: '0,1', studentId: 'c', studentName: '다', group: 'A' },
    { seatKey: '0,2', studentId: 'b', studentName: '나', group: 'B' }
  ];
  const forbiddenSwap = swapStudents(assignments, (item) => item.seatKey, '0,1', '0,2');
  assert.deepEqual(
    { id: forbiddenSwap[1].studentId, name: forbiddenSwap[1].studentName, group: forbiddenSwap[1].group },
    { id: 'b', name: '나', group: 'B' }
  );
});

test('가까이 배치할 학생은 상하좌우 이웃이 되도록 우선 반영한다', () => {
  const students = [
    { id: 'a', name: '가' }, { id: 'b', name: '나' }, { id: 'c', name: '다' }
  ];
  const result = solveSeats(students, rectangularSeats(1, 3), { preferredPairs: [['a', 'b']] });
  const byStudent = new Map(result.assignments.map((item) => [item.studentId, item.seatKey.split(',').map(Number)]));
  const [aRow, aCol] = byStudent.get('a');
  const [bRow, bCol] = byStudent.get('b');
  assert.equal(Math.abs(aRow - bRow) + Math.abs(aCol - bCol), 1);
  assert.equal(result.violations, 0);
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

test('지난 기록은 당시 자리 모양과 역할별 그룹을 그대로 복원한다', () => {
  const seat = buildSeatHistoryResult({
    layout: { rows: 2, cols: 3, activeSeats: ['0,0', '0,2', '1,0'] },
    assignments: [
      { seatKey: '0,0', studentId: 'a', studentName: '가' },
      { seatKey: '0,2', studentId: 'b', studentName: '나' },
      { seatKey: '1,0', studentId: 'c', studentName: '다' }
    ]
  });
  assert.deepEqual({ rows: seat.rows, cols: seat.cols }, { rows: 2, cols: 3 });
  assert.deepEqual([...seat.activeSeats], ['0,0', '0,2', '1,0']);
  assert.equal(seat.assignmentBySeat.get('0,2').studentName, '나');
  assert.equal(seat.activeSeats.has('1,2'), false);

  const roles = buildRoleHistoryResult({
    roleGroups: [{ id: 'leader', name: '모둠장', count: 2 }, { id: 'record', name: '기록자', count: 1 }],
    assignments: [
      { roleId: 'leader', roleName: '모둠장', slotNumber: 2, studentId: 'b', studentName: '나' },
      { roleId: 'record', roleName: '기록자', slotNumber: 1, studentId: 'c', studentName: '다' },
      { roleId: 'leader', roleName: '모둠장', slotNumber: 1, studentId: 'a', studentName: '가' }
    ]
  });
  assert.deepEqual(roles.map((role) => ({ name: role.name, students: role.assignments.map((item) => item.studentName) })), [
    { name: '모둠장', students: ['가', '나'] },
    { name: '기록자', students: ['다'] }
  ]);

  const legacyRoles = buildRoleHistoryResult({ assignments: [
    { role: '청소', studentId: 'a', studentName: '가' },
    { role: '청소', studentId: 'b', studentName: '나' },
    { role: '급식', studentId: 'c', studentName: '다' }
  ] });
  assert.deepEqual(legacyRoles.map((role) => [role.name, role.count]), [['청소', 2], ['급식', 1]]);
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
  const [manifest, api, migration, registry, teacherEntry, historyResultBoard, settingsEntry, legacyImport, teacherGuides, seatEntry, seatLotteryModal, roleEntry, roleLotteryModal, lotteryMachine, arrangementCss] = await Promise.all([
    readFile('src/modules/tool/classroom-arrangement/manifest.js', 'utf8'),
    readFile('src/modules/tool/classroom-arrangement/classroomArrangementApi.js', 'utf8'),
    readFile('supabase/migrations/20261159_classroom_arrangement_tool.sql', 'utf8'),
    readFile('src/modules/registry.js', 'utf8'),
    readFile('src/modules/tool/classroom-arrangement/TeacherEntry.jsx', 'utf8'),
    readFile('src/modules/tool/classroom-arrangement/HistoryResultBoard.jsx', 'utf8'),
    readFile('src/modules/tool/classroom-arrangement/ArrangementSettings.jsx', 'utf8'),
    readFile('src/modules/tool/classroom-arrangement/legacyImport.js', 'utf8'),
    readFile('src/constants/teacherGuides.js', 'utf8'),
    readFile('src/modules/tool/classroom-arrangement/SeatArrangement.jsx', 'utf8'),
    readFile('src/modules/tool/classroom-arrangement/SeatLotteryModal.jsx', 'utf8'),
    readFile('src/modules/tool/classroom-arrangement/RoleArrangement.jsx', 'utf8'),
    readFile('src/modules/tool/classroom-arrangement/RoleLotteryModal.jsx', 'utf8'),
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
  assert.match(seatEntry, /<SeatLotteryModal/);
  assert.doesNotMatch(seatEntry, /<LotteryMachine/);
  assert.match(roleEntry, /<RoleLotteryModal/);
  assert.doesNotMatch(roleEntry, /<LotteryMachine/);
  assert.match(lotteryMachine, /arrange-lottery-drum/);
  assert.match(arrangementCss, /@keyframes arrange-ball-orbit/);
  assert.match(settingsEntry, /학생 남녀 구분/);
  assert.match(settingsEntry, /<option value="A">남<\/option><option value="B">여<\/option>/);
  assert.doesNotMatch(`${settingsEntry}\n${teacherGuides}`, /A\/B|학생 A|학생 B/);
  assert.match(settingsEntry, /반드시 지킬 조건/);
  assert.match(settingsEntry, /이웃하면 안 되는 학생/);
  assert.match(settingsEntry, /가능하면 반영할 조건/);
  assert.match(settingsEntry, /상·하·좌·우 이웃에 남녀가 골고루 섞이도록 배치/);
  assert.match(settingsEntry, /최근 \{RECENT_SEAT_ROUNDS\}회 같은 자리 피하기/);
  assert.match(settingsEntry, /최근 \{RECENT_SEAT_ROUNDS\}회 같은 이웃 피하기/);
  assert.match(settingsEntry, /최근 \{RECENT_ROLE_ROUNDS\}회 같은 역할 피하기/);
  assert.match(settingsEntry, /가까이 배치할 학생/);
  assert.doesNotMatch(settingsEntry, /좌우로 번갈아|옆자리 금지|같은 자리·옆자리/);
  assert.match(seatEntry, /id: 'slow', label: '천천히', delay: 1500/);
  assert.match(seatEntry, /id: 'normal', label: '보통', delay: 950/);
  assert.match(seatEntry, /id: 'fast', label: '빠르게', delay: 600/);
  assert.match(seatEntry, /group === 'A' \? '남' : group === 'B' \? '여'/);
  assert.match(arrangementCss, /\.arrange-lottery \{ position:absolute;[^}]*top:50%;[^}]*transform:translate\(-50%,-50%\)/);
  assert.doesNotMatch(arrangementCss, /\.arrange-lottery \{[^}]*position:fixed/);
  assert.match(teacherEntry, /arrange-settings-utilities/);
  assert.match(teacherEntry, /<HistoryResultBoard kind=\{selected\.kind\} payload=\{selected\.payload\}/);
  assert.match(historyResultBoard, /arrange-history-seat-grid/);
  assert.match(historyResultBoard, /arrange-history-role-cards/);
  assert.match(historyResultBoard, /role\.assignments\.map/);
  assert.doesNotMatch(teacherEntry, /selected\.payload\?\.assignments \|\| \[\]/);
  assert.match(arrangementCss, /\.arrange-history-seat-grid/);
  assert.match(arrangementCss, /\.arrange-history-role-cards/);
  assert.match(arrangementCss, /\.arrange-settings-utilities \{ display:grid; grid-template-columns:/);
  assert.match(seatEntry, /setModalOpen\(true\)/);
  assert.match(seatEntry, /setFlyingPick\(\{ \.\.\.pick, flightDuration:/);
  assert.match(seatEntry, /base \+ step \* 0\.55/);
  assert.match(seatEntry, /base \+ step \* 0\.9/);
  assert.match(seatLotteryModal, /<ModalPortal>/);
  assert.match(seatLotteryModal, /role="dialog" aria-modal="true"/);
  assert.match(seatLotteryModal, /data-modal-seat=/);
  assert.match(seatLotteryModal, /is-target/);
  assert.match(seatLotteryModal, /arrange-seat-flight/);
  assert.match(seatLotteryModal, /완성된 자리표 보기/);
  assert.match(roleEntry, /setModalOpen\(true\)/);
  assert.match(roleEntry, /setFlyingPick\(\{ \.\.\.pick, flightDuration:/);
  assert.match(roleEntry, /base \+ step \* 0\.55/);
  assert.match(roleEntry, /base \+ step \* 0\.9/);
  assert.match(roleLotteryModal, /<ModalPortal>/);
  assert.match(roleLotteryModal, /role="dialog" aria-modal="true"/);
  assert.match(roleLotteryModal, /data-modal-role-slot=/);
  assert.match(roleLotteryModal, /is-target/);
  assert.match(roleLotteryModal, /arrange-role-flight/);
  assert.match(roleLotteryModal, /완성된 역할표 보기/);
  assert.match(arrangementCss, /\.arrange-role-lottery-cards/);
  assert.match(arrangementCss, /\.arrange-role-lottery-slot\.is-filled/);
  assert.match(arrangementCss, /\.arrange-seat-machine-wrap \.arrange-lottery \{ position:relative;/);
  assert.match(arrangementCss, /@keyframes arrange-seat-flight/);
  assert.match(teacherGuides, /이름표가 해당 자리로 이동/);
  assert.match(teacherGuides, /이름표가 해당 역할 칸으로 이동/);
  assert.match(teacherGuides, /바로 붙은 위·아래·왼쪽·오른쪽 좌석/);
  assert.match(teacherEntry, /TeacherGuideButton/);
  assert.match(teacherEntry, /tabId="classroom-arrangement" variant="help"/);
  assert.match(teacherGuides, /'classroom-arrangement'/);
  assert.match(teacherGuides, /학생 두 명을 차례로 눌러 자리를 맞바꾸고/);
  assert.match(teacherGuides, /학생 두 명을 차례로 눌러 역할을 맞바꾸고/);
  assert.match(seatEntry, /학생 두 명을 차례로 누르면 자리를 맞바꿀 수 있습니다/);
  assert.match(roleEntry, /학생 두 명을 차례로 누르면 역할을 맞바꿀 수 있습니다/);
  assert.match(arrangementCss, /\.arrange-edit-bar__icon/);
  assert.match(seatEntry, /필수 조건은 모두 지켰으며, 권장 조건은 가장 가까운 결과/);
  assert.match(seatEntry, /result\.error/);
  assert.match(seatEntry, /<output className=\{`arrange-student-counter/);
  assert.match(seatEntry, /현재 학생 \$\{roster\.length\}명, 활성 좌석 \$\{activeSeats\.size\}석/);
  assert.match(seatEntry, /seatCountMatches \? '좌석 일치' : `좌석 \$\{activeSeats\.size\}석`/);
  assert.match(arrangementCss, /\.arrange-board-heading \{ display:grid; grid-template-columns:minmax\(120px,560px\) auto;/);
  assert.match(arrangementCss, /\.arrange-student-counter\.is-mismatch/);
});

test('설정 정규화는 좌석·역할 입력 크기와 화면 밖 좌표를 제한한다', () => {
  const seats = normalizeSeatSettings({ seatLayout: { rows: 99, cols: 99, activeSeats: ['0,0', '0,0', '30,0', '0,30', 'bad'] } });
  assert.equal(seats.seatLayout.rows, 30);
  assert.equal(seats.seatLayout.cols, 30);
  assert.deepEqual(seats.seatLayout.activeSeats, ['0,0']);
  const roles = normalizeRoleSettings({ roleGroups: [{ id: 'a', name: '긴 역할', count: 500 }] });
  assert.equal(roles.roleGroups[0].count, 99);
});
