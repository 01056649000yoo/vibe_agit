/* eslint-disable security/detect-object-injection -- 셔플 배열과 자리·역할 인덱스는 이 파일에서 만든 숫자/검증 키만 사용한다. */
export const DEFAULT_SEAT_SETTINGS = Object.freeze({
  forbiddenPairs: [],
  balanceMode: 'none',
  fixedSeats: [],
  avoidDuplicates: false,
  seatLayout: null
});

export const DEFAULT_ROLE_SETTINGS = Object.freeze({
  forbiddenPairs: [],
  balanceMode: 'none',
  avoidDuplicates: false,
  roleGroups: []
});

export const seatKey = (row, col) => `${row},${col}`;

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function suggestSeatGrid(total) {
  if (total <= 0) return { rows: 4, cols: 6 };
  const cols = Math.max(2, Math.ceil(Math.sqrt(total) * 1.4));
  return { rows: Math.max(1, Math.ceil(total / cols)), cols };
}

export function rectangularSeats(rows, cols) {
  const seats = new Set();
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) seats.add(seatKey(row, col));
  }
  return seats;
}

export function normalizeSeatSettings(value = {}) {
  const layout = value?.seatLayout;
  const rows = Math.max(0, Math.min(30, Math.floor(Number(layout?.rows) || 0)));
  const cols = Math.max(0, Math.min(30, Math.floor(Number(layout?.cols) || 0)));
  const activeSeats = Array.isArray(layout?.activeSeats)
    ? layout.activeSeats.filter((key) => /^\d{1,2},\d{1,2}$/.test(String(key))).slice(0, 900)
    : [];
  return {
    forbiddenPairs: normalizePairs(value?.forbiddenPairs),
    balanceMode: value?.balanceMode === 'strict' || value?.genderBalance === 'strict' ? 'strict' : 'none',
    fixedSeats: Array.isArray(value?.fixedSeats)
      ? value.fixedSeats.map((seat) => ({
        studentId: String(seat?.studentId || ''),
        row: Math.max(1, Math.min(30, Math.floor(Number(seat?.row) || 1))),
        col: Math.max(1, Math.min(30, Math.floor(Number(seat?.col) || 1)))
      })).filter((seat) => seat.studentId).slice(0, 100)
      : [],
    avoidDuplicates: value?.avoidDuplicates === true,
    seatLayout: rows > 0 && cols > 0 ? { rows, cols, activeSeats: [...new Set(activeSeats)] } : null
  };
}

export function normalizeRoleSettings(value = {}) {
  return {
    forbiddenPairs: normalizePairs(value?.forbiddenPairs),
    balanceMode: value?.balanceMode === 'strict' || value?.genderBalance === 'strict' ? 'strict' : 'none',
    avoidDuplicates: value?.avoidDuplicates === true,
    roleGroups: Array.isArray(value?.roleGroups)
      ? value.roleGroups.map((role, index) => ({
        id: String(role?.id || `role-${index + 1}`),
        name: String(role?.name || '').trim().slice(0, 40),
        count: Math.max(1, Math.min(99, Math.floor(Number(role?.count) || 1)))
      })).filter((role) => role.name).slice(0, 100)
      : []
  };
}

function normalizePairs(value) {
  if (!Array.isArray(value)) return [];
  return value.map((pair) => Array.isArray(pair) ? pair.map(String) : [])
    .filter(([left, right]) => left && right && left !== right)
    .slice(0, 200);
}

function adjacencyFor(seatKeys) {
  const seats = new Set(seatKeys);
  const result = new Map();
  seats.forEach((key) => {
    const [row, col] = key.split(',').map(Number);
    const neighbors = [seatKey(row, col - 1), seatKey(row, col + 1)].filter((candidate) => seats.has(candidate));
    result.set(key, neighbors);
  });
  return result;
}

function pairKey(left, right) {
  return [String(left), String(right)].sort().join('|');
}

function placeSeatCandidate(students, seatKeys, settings) {
  const assignment = new Map();
  const studentMap = new Map(students.map((student) => [String(student.id), student]));
  const seatSet = new Set(seatKeys);
  const used = new Set();
  settings.fixedSeats.forEach((fixed) => {
    const key = seatKey(fixed.row - 1, fixed.col - 1);
    const student = studentMap.get(String(fixed.studentId));
    if (!student || !seatSet.has(key) || assignment.has(key) || used.has(String(student.id))) return;
    assignment.set(key, student);
    used.add(String(student.id));
  });
  const remaining = shuffle(students.filter((student) => !used.has(String(student.id))));
  seatKeys.filter((key) => !assignment.has(key)).forEach((key, index) => {
    if (remaining[index]) assignment.set(key, remaining[index]);
  });
  return assignment;
}

function seatHistoryRules(history) {
  return (history || []).slice(0, 5).map((entry) => {
    const assignments = Array.isArray(entry?.payload?.assignments) ? entry.payload.assignments : [];
    const seatStudents = new Set(assignments.map((item) => `${item.seatKey}:${item.studentId}`));
    const bySeat = new Map(assignments.map((item) => [item.seatKey, String(item.studentId)]));
    const adjacency = adjacencyFor(assignments.map((item) => item.seatKey));
    const neighborPairs = new Set();
    adjacency.forEach((neighbors, key) => neighbors.forEach((neighbor) => {
      if (key < neighbor && bySeat.has(key) && bySeat.has(neighbor)) neighborPairs.add(pairKey(bySeat.get(key), bySeat.get(neighbor)));
    }));
    return { seatStudents, neighborPairs };
  });
}

function countSeatViolations(assignment, settings, historyRules) {
  let violations = 0;
  const forbidden = new Set(settings.forbiddenPairs.map(([left, right]) => pairKey(left, right)));
  const adjacency = adjacencyFor([...assignment.keys()]);
  const currentSeatStudents = new Set();
  const currentNeighborPairs = new Set();
  assignment.forEach((student, key) => {
    currentSeatStudents.add(`${key}:${student.id}`);
    adjacency.get(key)?.forEach((neighborKey) => {
      if (key >= neighborKey) return;
      const neighbor = assignment.get(neighborKey);
      if (!neighbor) return;
      const currentPair = pairKey(student.id, neighbor.id);
      currentNeighborPairs.add(currentPair);
      if (forbidden.has(currentPair)) violations += 8;
      if (settings.balanceMode === 'strict' && student.group && neighbor.group && student.group === neighbor.group) violations += 1;
    });
  });
  if (settings.avoidDuplicates) historyRules.forEach((historyRule) => {
    currentSeatStudents.forEach((key) => { if (historyRule.seatStudents.has(key)) violations += 2; });
    currentNeighborPairs.forEach((key) => { if (historyRule.neighborPairs.has(key)) violations += 3; });
  });
  return violations;
}

export function solveSeats(students, activeSeats, rawSettings, history = [], maxTries = 300) {
  const settings = normalizeSeatSettings(rawSettings);
  const seatKeys = [...activeSeats].sort((left, right) => {
    const [leftRow, leftCol] = left.split(',').map(Number);
    const [rightRow, rightCol] = right.split(',').map(Number);
    return leftRow - rightRow || leftCol - rightCol;
  });
  if (students.length === 0 || seatKeys.length < students.length) return { assignments: [], violations: 0 };
  const rules = seatHistoryRules(history);
  let best = placeSeatCandidate(students, seatKeys, settings);
  let bestViolations = countSeatViolations(best, settings, rules);
  for (let attempt = 1; attempt < maxTries && bestViolations > 0; attempt += 1) {
    const candidate = placeSeatCandidate(students, seatKeys, settings);
    const violations = countSeatViolations(candidate, settings, rules);
    if (violations < bestViolations) {
      best = candidate;
      bestViolations = violations;
    }
  }
  return {
    assignments: [...best.entries()].map(([key, student]) => ({ seatKey: key, studentId: student.id, studentName: student.name, group: student.group || null })),
    violations: bestViolations
  };
}

export function buildRoleSlots(roleGroups) {
  return roleGroups.flatMap((role) => Array.from({ length: role.count }, (_, index) => ({
    id: `${role.id}-${index + 1}`,
    roleId: role.id,
    roleName: role.name,
    slotNumber: index + 1,
    total: role.count
  })));
}

function countRoleViolations(assignments, settings, history) {
  let violations = 0;
  const forbidden = new Set(settings.forbiddenPairs.map(([left, right]) => pairKey(left, right)));
  const byRole = new Map();
  assignments.forEach((assignment) => {
    const current = byRole.get(assignment.roleId) || [];
    current.push(assignment);
    byRole.set(assignment.roleId, current);
  });
  byRole.forEach((group) => {
    for (let left = 0; left < group.length; left += 1) {
      for (let right = left + 1; right < group.length; right += 1) {
        if (forbidden.has(pairKey(group[left].studentId, group[right].studentId))) violations += 8;
        if (settings.balanceMode === 'strict' && group[left].group && group[right].group && group[left].group === group[right].group) violations += 1;
      }
    }
  });
  if (settings.avoidDuplicates) {
    const currentKeys = new Set(assignments.map((item) => `${item.studentId}:${item.roleName}`));
    (history || []).slice(0, 8).forEach((entry) => {
      const previous = Array.isArray(entry?.payload?.assignments) ? entry.payload.assignments : [];
      previous.forEach((item) => { if (currentKeys.has(`${item.studentId}:${item.roleName || item.role}`)) violations += 5; });
    });
  }
  return violations;
}

export function solveRoles(students, rawSettings, history = [], maxTries = 500) {
  const settings = normalizeRoleSettings(rawSettings);
  const slots = buildRoleSlots(settings.roleGroups);
  if (students.length === 0 || slots.length !== students.length) return { assignments: [], violations: 0 };
  const candidate = () => shuffle(students).map((student, index) => ({ ...slots[index], studentId: student.id, studentName: student.name, group: student.group || null }));
  let best = candidate();
  let bestViolations = countRoleViolations(best, settings, history);
  for (let attempt = 1; attempt < maxTries && bestViolations > 0; attempt += 1) {
    const next = candidate();
    const violations = countRoleViolations(next, settings, history);
    if (violations < bestViolations) {
      best = next;
      bestViolations = violations;
    }
  }
  return { assignments: best, violations: bestViolations };
}
