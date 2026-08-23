const MAX_ITEMS = 100;
const MAX_GRID_SIZE = 30;

const safeCount = (value, fallback = 1) => Math.max(1, Math.min(MAX_GRID_SIZE, Math.floor(Number(value) || fallback)));

function parseSeatPosition(value) {
  const match = /^(\d{1,2}),(\d{1,2})$/.exec(String(value || ''));
  if (!match) return null;
  const row = Number(match[1]);
  const col = Number(match[2]);
  return row < MAX_GRID_SIZE && col < MAX_GRID_SIZE ? { key: `${row},${col}`, row, col } : null;
}

export function buildSeatHistoryResult(payload = {}) {
  const assignments = Array.isArray(payload?.assignments) ? payload.assignments.slice(0, MAX_ITEMS) : [];
  const savedSeats = Array.isArray(payload?.layout?.activeSeats) ? payload.layout.activeSeats : null;
  const positions = [...(savedSeats || []), ...assignments.map((item) => item?.seatKey)]
    .map(parseSeatPosition)
    .filter(Boolean);
  const inferredRows = positions.length ? Math.max(...positions.map((position) => position.row)) + 1 : 1;
  const inferredCols = positions.length ? Math.max(...positions.map((position) => position.col)) + 1 : 1;
  const rows = safeCount(payload?.layout?.rows, inferredRows);
  const cols = safeCount(payload?.layout?.cols, inferredCols);
  const activeSource = savedSeats || assignments.map((item) => item?.seatKey);
  const activeSeats = new Set(activeSource.map(parseSeatPosition)
    .filter((position) => position && position.row < rows && position.col < cols)
    .map((position) => position.key));
  const assignmentBySeat = new Map(assignments.map((item) => [parseSeatPosition(item?.seatKey)?.key, item])
    .filter(([key]) => key && activeSeats.has(key)));
  return { rows, cols, activeSeats, assignmentBySeat };
}

const roleNameOf = (assignment) => String(assignment?.roleName || assignment?.role || '').trim();

export function buildRoleHistoryResult(payload = {}) {
  const assignments = (Array.isArray(payload?.assignments) ? payload.assignments : []).slice(0, MAX_ITEMS)
    .map((assignment, index) => ({ ...assignment, historyIndex: index }));
  const savedGroups = Array.isArray(payload?.roleGroups) ? payload.roleGroups.slice(0, MAX_ITEMS) : [];
  const groups = savedGroups.length ? savedGroups.map((role, index) => ({
    id: String(role?.id || `role-${index + 1}`),
    name: String(role?.name || `역할 ${index + 1}`).trim().slice(0, 40),
    count: Math.max(1, Math.min(MAX_ITEMS, Math.floor(Number(role?.count) || 1)))
  })) : [...assignments.reduce((result, assignment) => {
    const name = roleNameOf(assignment) || '역할 미지정';
    const key = String(assignment?.roleId || name);
    const current = result.get(key) || { id: key, name, count: 0 };
    current.count += 1;
    result.set(key, current);
    return result;
  }, new Map()).values()];

  return groups.map((role) => {
    const grouped = assignments.filter((assignment) => String(assignment?.roleId || '') === role.id
      || (!assignment?.roleId && roleNameOf(assignment) === role.name))
      .sort((left, right) => (Number(left?.slotNumber) || left.historyIndex + 1) - (Number(right?.slotNumber) || right.historyIndex + 1));
    return { ...role, count: Math.max(role.count, grouped.length), assignments: grouped };
  });
}
