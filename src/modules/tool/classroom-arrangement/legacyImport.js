const MAX_ARCHIVE_BYTES = 5 * 1024 * 1024;

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR');
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function readSurvivalArchive(file) {
  if (!file || file.size <= 0 || file.size > MAX_ARCHIVE_BYTES) {
    throw new Error('5MB 이하의 이전 앱 JSON 백업 파일을 선택해 주세요.');
  }
  const bytes = await file.arrayBuffer();
  const text = new TextDecoder().decode(bytes);
  const payload = JSON.parse(text);
  if (payload?.app !== 'classroom-tools' || !payload?.data || !Array.isArray(payload.data.classes)) {
    throw new Error('지원하지 않는 백업 파일입니다.');
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const classes = payload.data.classes.slice(0, 100);
  const students = Array.isArray(payload.data.students) ? payload.data.students.slice(0, 5000) : [];
  const history = Array.isArray(payload.data.history) ? payload.data.history.slice(0, 10000) : [];
  return {
    payload,
    fingerprint: bytesToHex(digest),
    version: Math.max(1, Math.min(20, Number(payload.version) || 1)),
    classes,
    students,
    history,
    summary: {
      exportedAt: payload.exportedAt || null,
      classCount: classes.length,
      studentCount: students.length,
      historyCount: history.length,
      localStorageKeyCount: payload.localStorage && typeof payload.localStorage === 'object'
        ? Object.keys(payload.localStorage).length
        : 0
    }
  };
}

export function mapLegacyClassToAgit(archive, legacyClassId, agitStudents) {
  const sourceClass = archive.classes.find((item) => String(item.id) === String(legacyClassId));
  if (!sourceClass) throw new Error('옮길 기존 학급을 선택해 주세요.');

  const sourceStudents = archive.students.filter((student) => String(student.classId) === String(legacyClassId));
  const agitByName = new Map();
  agitStudents.forEach((student) => {
    const name = normalizeName(student.name);
    const existing = agitByName.get(name) || [];
    existing.push(student);
    agitByName.set(name, existing);
  });
  const idMap = new Map();
  const groups = {};
  const matchedNames = [];
  const unmatchedNames = [];
  sourceStudents.forEach((student) => {
    const candidates = agitByName.get(normalizeName(student.name)) || [];
    if (candidates.length !== 1 || student.id == null) {
      unmatchedNames.push(student.name);
      return;
    }
    const target = candidates[0];
    idMap.set(String(student.id), String(target.id));
    matchedNames.push(student.name);
    if (student.gender === 'M') groups[target.id] = 'A';
    if (student.gender === 'F') groups[target.id] = 'B';
  });

  const mapPairs = (pairs) => (Array.isArray(pairs) ? pairs : []).map(([left, right]) => [
    idMap.get(String(left)), idMap.get(String(right))
  ]).filter(([left, right]) => left && right && left !== right);

  const sourceSeat = sourceClass.seatSettings || {};
  const sourceRole = sourceClass.roleSettings || {};
  const seat = {
    ...sourceSeat,
    balanceMode: sourceSeat.genderBalance === 'strict' ? 'strict' : 'none',
    forbiddenPairs: mapPairs(sourceSeat.forbiddenPairs),
    fixedSeats: (Array.isArray(sourceSeat.fixedSeats) ? sourceSeat.fixedSeats : []).map((item) => ({
      studentId: idMap.get(String(item.studentId)), row: item.row, col: item.col
    })).filter((item) => item.studentId)
  };
  delete seat.genderBalance;
  const role = {
    ...sourceRole,
    balanceMode: sourceRole.genderBalance === 'strict' ? 'strict' : 'none',
    forbiddenPairs: mapPairs(sourceRole.forbiddenPairs)
  };
  delete role.genderBalance;

  return {
    seat,
    role,
    studentGroups: groups,
    report: { sourceClassName: sourceClass.name, matchedNames, unmatchedNames }
  };
}
