/* eslint-disable security/detect-object-injection -- 셔플 배열과 자리·역할 인덱스는 이 파일에서 만든 숫자/검증 키만 사용한다. */
// 최근 몇 번까지 거슬러 보고 같은 자리·이웃·역할을 피할지. **엔진과 안내문이 이 값을 함께 쓴다.**
// 2026-08-24: 자리 5회·역할 8회는 범위가 너무 넓다는 의견에 따라 자리 3회·역할 4회로 좁혔다.
export const RECENT_SEAT_ROUNDS = 3;
export const RECENT_ROLE_ROUNDS = 4;
export const DEFAULT_SEAT_SETTINGS = Object.freeze({
  forbiddenPairs: [],
  preferredPairs: [],
  balanceMode: 'none',
  fixedSeats: [],
  avoidSameSeat: false,
  avoidSameNeighbor: false,
  seatLayout: null
});

export const DEFAULT_ROLE_SETTINGS = Object.freeze({
  forbiddenPairs: [],
  balanceMode: 'none',
  avoidDuplicates: false,
  roleGroups: []
});

export const seatKey = (row, col) => `${row},${col}`;

export function hasExactSeatCount(studentCount, seatCount) {
  return studentCount > 0 && studentCount === seatCount;
}

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

export function seatsWithinGrid(activeSeats, rows, cols) {
  const safeRows = Math.max(0, Math.min(30, Math.floor(Number(rows) || 0)));
  const safeCols = Math.max(0, Math.min(30, Math.floor(Number(cols) || 0)));
  return new Set([...activeSeats].filter((key) => {
    const match = /^(\d{1,2}),(\d{1,2})$/.exec(String(key));
    if (!match) return false;
    const row = Number(match[1]);
    const col = Number(match[2]);
    return row < safeRows && col < safeCols;
  }));
}

export function suggestSeatLayout(total) {
  const count = Math.max(0, Math.min(900, Math.floor(Number(total) || 0)));
  const { rows, cols } = suggestSeatGrid(count);
  const activeSeats = new Set();
  for (let index = 0; index < count; index += 1) {
    activeSeats.add(seatKey(Math.floor(index / cols), index % cols));
  }
  return { rows, cols, activeSeats };
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
    preferredPairs: normalizePairs(value?.preferredPairs),
    balanceMode: value?.balanceMode === 'strict' || value?.genderBalance === 'strict' ? 'strict' : 'none',
    fixedSeats: Array.isArray(value?.fixedSeats)
      ? value.fixedSeats.map((seat) => ({
        studentId: String(seat?.studentId || ''),
        row: Math.max(1, Math.min(30, Math.floor(Number(seat?.row) || 1))),
        col: Math.max(1, Math.min(30, Math.floor(Number(seat?.col) || 1)))
      })).filter((seat) => seat.studentId).slice(0, 100)
      : [],
    avoidSameSeat: value?.avoidSameSeat === true || (value?.avoidSameSeat == null && value?.avoidDuplicates === true),
    avoidSameNeighbor: value?.avoidSameNeighbor === true || (value?.avoidSameNeighbor == null && value?.avoidDuplicates === true),
    seatLayout: rows > 0 && cols > 0 ? { rows, cols, activeSeats: [...seatsWithinGrid(activeSeats, rows, cols)] } : null
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

export function seatAdjacencyFor(seatKeys) {
  const seats = new Set(seatKeys);
  const result = new Map();
  seats.forEach((key) => {
    const [row, col] = key.split(',').map(Number);
    const neighbors = [
      seatKey(row - 1, col),
      seatKey(row + 1, col),
      seatKey(row, col - 1),
      seatKey(row, col + 1)
    ].filter((candidate) => seats.has(candidate));
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
  return distinctArrangementRounds(history).slice(0, RECENT_SEAT_ROUNDS).map((entry) => {
    const assignments = Array.isArray(entry?.payload?.assignments) ? entry.payload.assignments : [];
    const seatStudents = new Set(assignments.map((item) => `${item.seatKey}:${item.studentId}`));
    const bySeat = new Map(assignments.map((item) => [item.seatKey, String(item.studentId)]));
    const adjacency = seatAdjacencyFor(assignments.map((item) => item.seatKey));
    const neighborPairs = new Set();
    adjacency.forEach((neighbors, key) => neighbors.forEach((neighbor) => {
      if (key < neighbor && bySeat.has(key) && bySeat.has(neighbor)) neighborPairs.add(pairKey(bySeat.get(key), bySeat.get(neighbor)));
    }));
    return { seatStudents, neighborPairs };
  });
}

function inspectSeatCandidate(assignment, settings, historyRules) {
  let requiredViolations = 0;
  let preferenceViolations = 0;
  const forbidden = new Set(settings.forbiddenPairs.map(([left, right]) => pairKey(left, right)));
  const adjacency = seatAdjacencyFor([...assignment.keys()]);
  const currentSeatStudents = new Set();
  const currentNeighborPairs = new Set();
  const currentStudentIds = new Set();
  assignment.forEach((student, key) => {
    currentSeatStudents.add(`${key}:${student.id}`);
    currentStudentIds.add(String(student.id));
    adjacency.get(key)?.forEach((neighborKey) => {
      if (key >= neighborKey) return;
      const neighbor = assignment.get(neighborKey);
      if (!neighbor) return;
      const currentPair = pairKey(student.id, neighbor.id);
      currentNeighborPairs.add(currentPair);
      if (forbidden.has(currentPair)) requiredViolations += 1;
      if (settings.balanceMode === 'strict' && student.group && neighbor.group && student.group === neighbor.group) preferenceViolations += 1;
    });
  });
  settings.preferredPairs.forEach(([left, right]) => {
    const key = pairKey(left, right);
    if (currentStudentIds.has(left) && currentStudentIds.has(right) && !currentNeighborPairs.has(key)) preferenceViolations += 4;
  });
  historyRules.forEach((historyRule) => {
    if (settings.avoidSameSeat) currentSeatStudents.forEach((key) => {
      if (historyRule.seatStudents.has(key)) preferenceViolations += 2;
    });
    if (settings.avoidSameNeighbor) currentNeighborPairs.forEach((key) => {
      if (historyRule.neighborPairs.has(key)) preferenceViolations += 3;
    });
  });
  return { requiredViolations, preferenceViolations };
}

function distinctArrangementRounds(history) {
  const originalIdsWithEdits = new Set((history || [])
    .filter((entry) => entry?.payload?.edited && entry.payload.originalHistoryId)
    .map((entry) => String(entry.payload.originalHistoryId)));
  return (history || []).filter((entry) => !originalIdsWithEdits.has(String(entry?.id)));
}

function validateFixedSeats(students, seatKeys, settings) {
  const studentIds = new Set(students.map((student) => String(student.id)));
  const seats = new Set(seatKeys);
  const usedStudents = new Set();
  const usedSeats = new Set();
  for (const fixed of settings.fixedSeats) {
    if (!studentIds.has(String(fixed.studentId))) continue;
    const key = seatKey(fixed.row - 1, fixed.col - 1);
    if (!seats.has(key) || usedStudents.has(String(fixed.studentId)) || usedSeats.has(key)) return false;
    usedStudents.add(String(fixed.studentId));
    usedSeats.add(key);
  }
  return true;
}

function placeRequiredSeatCandidate(students, seatKeys, settings, nodeLimit = 200000) {
  const studentMap = new Map(students.map((student) => [String(student.id), student]));
  const forbiddenByStudent = new Map();
  settings.forbiddenPairs.forEach(([left, right]) => {
    if (!studentMap.has(left) || !studentMap.has(right)) return;
    const leftSet = forbiddenByStudent.get(left) || new Set();
    const rightSet = forbiddenByStudent.get(right) || new Set();
    leftSet.add(right);
    rightSet.add(left);
    forbiddenByStudent.set(left, leftSet);
    forbiddenByStudent.set(right, rightSet);
  });
  const adjacency = seatAdjacencyFor(seatKeys);
  const assignment = new Map();
  const remainingStudentIds = new Set(studentMap.keys());
  settings.fixedSeats.forEach((fixed) => {
    const studentId = String(fixed.studentId);
    if (!studentMap.has(studentId)) return;
    assignment.set(seatKey(fixed.row - 1, fixed.col - 1), studentMap.get(studentId));
    remainingStudentIds.delete(studentId);
  });
  const remainingSeats = new Set(seatKeys.filter((key) => !assignment.has(key)));
  let visitedNodes = 0;

  const compatibleStudents = (key) => {
    const neighborIds = (adjacency.get(key) || [])
      .map((neighborKey) => assignment.get(neighborKey))
      .filter(Boolean)
      .map((student) => String(student.id));
    return [...remainingStudentIds].filter((studentId) => {
      const forbidden = forbiddenByStudent.get(studentId);
      return neighborIds.every((neighborId) => !forbidden?.has(neighborId));
    });
  };

  const search = () => {
    if (remainingSeats.size === 0) return true;
    if (visitedNodes >= nodeLimit) return false;
    visitedNodes += 1;
    let selectedSeat = null;
    let selectedCandidates = null;
    remainingSeats.forEach((key) => {
      const candidates = compatibleStudents(key);
      if (
        selectedCandidates == null
        || candidates.length < selectedCandidates.length
        || (candidates.length === selectedCandidates.length && (adjacency.get(key)?.length || 0) > (adjacency.get(selectedSeat)?.length || 0))
      ) {
        selectedSeat = key;
        selectedCandidates = candidates;
      }
    });
    if (!selectedSeat || selectedCandidates.length === 0) return false;
    const orderedCandidates = shuffle(selectedCandidates).sort((left, right) =>
      (forbiddenByStudent.get(right)?.size || 0) - (forbiddenByStudent.get(left)?.size || 0));
    remainingSeats.delete(selectedSeat);
    for (const studentId of orderedCandidates) {
      assignment.set(selectedSeat, studentMap.get(studentId));
      remainingStudentIds.delete(studentId);
      if (search()) return true;
      remainingStudentIds.add(studentId);
      assignment.delete(selectedSeat);
    }
    remainingSeats.add(selectedSeat);
    return false;
  };

  const fixedInspection = inspectSeatCandidate(assignment, settings, []);
  if (fixedInspection.requiredViolations > 0 || !search()) return null;
  return assignment;
}

export function solveSeats(students, activeSeats, rawSettings, history = [], maxTries = 300) {
  const settings = normalizeSeatSettings(rawSettings);
  const seatKeys = [...activeSeats].sort((left, right) => {
    const [leftRow, leftCol] = left.split(',').map(Number);
    const [rightRow, rightCol] = right.split(',').map(Number);
    return leftRow - rightRow || leftCol - rightCol;
  });
  if (!hasExactSeatCount(students.length, seatKeys.length)) return { assignments: [], violations: 0 };
  if (!validateFixedSeats(students, seatKeys, settings)) {
    return { assignments: [], violations: 0, error: '고정 자리가 현재 좌석과 겹치거나 자리판 밖에 있습니다.' };
  }
  const rules = seatHistoryRules(history);
  let best = null;
  let bestViolations = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < maxTries && bestViolations > 0; attempt += 1) {
    const candidate = placeSeatCandidate(students, seatKeys, settings);
    const { requiredViolations, preferenceViolations } = inspectSeatCandidate(candidate, settings, rules);
    if (requiredViolations === 0 && preferenceViolations < bestViolations) {
      best = candidate;
      bestViolations = preferenceViolations;
    }
  }
  if (!best) {
    const requiredCandidate = placeRequiredSeatCandidate(students, seatKeys, settings);
    if (requiredCandidate) {
      best = requiredCandidate;
      bestViolations = inspectSeatCandidate(requiredCandidate, settings, rules).preferenceViolations;
    }
  }
  if (!best) {
    return { assignments: [], violations: 0, error: '고정 자리와 이웃 금지 조건을 만족하는 배치를 찾지 못했습니다.' };
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
    distinctArrangementRounds(history).slice(0, RECENT_ROLE_ROUNDS).forEach((entry) => {
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
