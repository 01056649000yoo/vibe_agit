import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ArrangementSettings from './ArrangementSettings';
import RoleArrangement from './RoleArrangement';
import SeatArrangement from './SeatArrangement';
import { arrangementSfx } from './arrangementSfx';
import { DEFAULT_ROLE_SETTINGS, DEFAULT_SEAT_SETTINGS, normalizeRoleSettings, normalizeSeatSettings } from './arrangementEngine';
import { classroomArrangementApi } from './classroomArrangementApi';
import { mapLegacyClassToAgit, readSurvivalArchive } from './legacyImport';
import './classroomArrangement.css';

const TABS = [
  { id: 'seat', label: '자리 배치' },
  { id: 'role', label: '역할 나누기' },
  { id: 'history', label: '지난 기록' },
  { id: 'settings', label: '설정·자료 이전' }
];

const formatDate = (value) => new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

function HistoryView({ history, onDelete }) {
  const [selected, setSelected] = useState(null);
  return <div className="arrange-history">
    {history.length === 0 ? <div className="arrange-empty">아직 저장된 자리·역할 기록이 없습니다.</div> : history.map((item) => <article key={item.id}>
      <button type="button" className="arrange-history-open" onClick={() => setSelected(item)}><span>{item.kind === 'seat' ? '🪑' : '🎯'}</span><div><strong>{item.title}</strong><small>{formatDate(item.createdAt)}</small></div><em>{item.payload?.violations ? `조건 점수 ${item.payload.violations}` : '조건 충족'}</em></button>
      <button type="button" className="arrange-history-delete" aria-label={`${item.title} 삭제`} onClick={() => onDelete(item)}>삭제</button>
    </article>)}
    {selected ? <div className="arrange-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section className="arrange-history-modal" role="dialog" aria-modal="true" aria-labelledby="arrangement-history-title">
        <header><div><h3 id="arrangement-history-title">{selected.title}</h3><p>{formatDate(selected.createdAt)}</p></div><button type="button" aria-label="닫기" onClick={() => setSelected(null)}>×</button></header>
        <div className="arrange-history-result">
          {(selected.payload?.assignments || []).map((assignment, index) => <div key={`${assignment.studentId}-${index}`}><span>{selected.kind === 'seat' ? `${assignment.seatKey?.replace(',', '행 ')}열` : assignment.roleName || assignment.role}</span><strong>{assignment.studentName}</strong></div>)}
        </div>
      </section>
    </div> : null}
  </div>;
}

export default function ClassroomArrangementTeacherEntry({ activeClass, previewWorkspace = null }) {
  const [tab, setTab] = useState('seat');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [students, setStudents] = useState([]);
  const [seat, setSeat] = useState(DEFAULT_SEAT_SETTINGS);
  const [role, setRole] = useState(DEFAULT_ROLE_SETTINGS);
  const [studentGroups, setStudentGroups] = useState({});
  const [history, setHistory] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [legacyArchive, setLegacyArchive] = useState(null);
  const [legacyClassId, setLegacyClassId] = useState('');
  const [importing, setImporting] = useState(false);
  const [sound, setSound] = useState(() => arrangementSfx.settings);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    if (!activeClass?.id) return;
    setLoading(true);
    setError('');
    try {
      const workspace = previewWorkspace || await classroomArrangementApi.getWorkspace(activeClass.id, 50);
      setStudents(Array.isArray(workspace?.students) ? workspace.students : []);
      setSeat(normalizeSeatSettings(workspace?.settings?.seat));
      setRole(normalizeRoleSettings(workspace?.settings?.role));
      setStudentGroups(workspace?.settings?.studentGroups || {});
      setHistory(Array.isArray(workspace?.history) ? workspace.history : []);
      setDirty(false);
    } catch (loadError) {
      setError(loadError.message || '자리·역할 도구를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [activeClass?.id, previewWorkspace]);

  useEffect(() => { void load(); }, [load]);
  const groupedStudents = useMemo(() => students.map((student) => ({ ...student, group: studentGroups[student.id] || null })), [students, studentGroups]);

  const updateSeat = (next) => { setSeat(normalizeSeatSettings(next)); setDirty(true); setNotice(''); };
  const updateRole = (next) => { setRole(normalizeRoleSettings(next)); setDirty(true); setNotice(''); };
  const updateGroups = (next) => { setStudentGroups(Object.fromEntries(Object.entries(next).filter(([, value]) => value === 'A' || value === 'B'))); setDirty(true); setNotice(''); };

  const saveSettings = useCallback(async (overrides = null) => {
    if (!activeClass?.id) return;
    setSaving(true);
    setNotice('');
    const next = overrides || { seat, role, studentGroups };
    try {
      if (!previewWorkspace) await classroomArrangementApi.saveSettings(activeClass.id, next);
      setDirty(false);
      setNotice('설정을 저장했습니다.');
    } catch (saveError) {
      setError(saveError.message || '설정을 저장하지 못했습니다.');
      throw saveError;
    } finally {
      setSaving(false);
    }
  }, [activeClass?.id, previewWorkspace, role, seat, studentGroups]);

  const createHistory = useCallback(async (kind, title, payload) => {
    try {
      if (dirty) await saveSettings();
      const created = previewWorkspace
        ? { id: `preview-${Date.now()}`, createdAt: new Date().toISOString() }
        : await classroomArrangementApi.createHistory(activeClass.id, kind, title, payload);
      setHistory((current) => [{ id: created.id, kind, title, payload, createdAt: created.createdAt }, ...current].slice(0, 50));
    } catch (historyError) {
      setError(historyError.message || '배치 결과를 기록하지 못했습니다.');
    }
  }, [activeClass?.id, dirty, previewWorkspace, saveSettings]);

  const deleteHistory = async (item) => {
    if (!window.confirm(`${item.title} 기록을 삭제할까요?`)) return;
    try {
      if (!previewWorkspace) await classroomArrangementApi.deleteHistory(item.id);
      setHistory((current) => current.filter((historyItem) => historyItem.id !== item.id));
    } catch (deleteError) {
      setError(deleteError.message || '기록을 삭제하지 못했습니다.');
    }
  };

  const selectArchive = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const archive = await readSurvivalArchive(file);
      setLegacyArchive(archive);
      setLegacyClassId(archive.classes.length === 1 ? String(archive.classes[0].id) : '');
      setNotice(`기존 학급 ${archive.summary.classCount}개와 기록 ${archive.summary.historyCount}개를 확인했습니다.`);
    } catch (archiveError) {
      setError(archiveError.message || '백업 파일을 읽지 못했습니다.');
    } finally {
      event.target.value = '';
    }
  };

  const importArchive = async () => {
    if (!legacyArchive || !legacyClassId) return;
    setImporting(true);
    setError('');
    try {
      const mapped = mapLegacyClassToAgit(legacyArchive, legacyClassId, students);
      const next = {
        seat: normalizeSeatSettings(mapped.seat),
        role: normalizeRoleSettings(mapped.role),
        studentGroups: mapped.studentGroups
      };
      await classroomArrangementApi.importLegacyArchive({
        fingerprint: legacyArchive.fingerprint,
        version: legacyArchive.version,
        summary: { ...legacyArchive.summary, activeClassId: activeClass.id, sourceClassName: mapped.report.sourceClassName },
        payload: legacyArchive.payload
      });
      await saveSettings(next);
      setSeat(next.seat);
      setRole(next.role);
      setStudentGroups(next.studentGroups);
      setLegacyArchive(null);
      setLegacyClassId('');
      setNotice(`기존 자료를 보관하고 ${mapped.report.matchedNames.length}명의 설정을 연결했습니다.${mapped.report.unmatchedNames.length ? ` 이름이 맞지 않은 ${mapped.report.unmatchedNames.length}명은 연결하지 않았습니다.` : ''}`);
    } catch (importError) {
      setError(importError.message || '기존 자료를 이전하지 못했습니다.');
    } finally {
      setImporting(false);
    }
  };

  const changeSound = (next) => {
    const value = { ...sound, ...next };
    arrangementSfx.setSettings(value);
    setSound(value);
    if (!value.muted) arrangementSfx.pick();
  };

  if (!activeClass?.id) return <div className="arrange-empty">먼저 운영할 학급을 선택해 주세요.</div>;
  if (loading) return <div className="arrange-empty">자리·역할 도구를 불러오는 중입니다...</div>;

  return <section className="classroom-arrangement">
    <header className="arrange-header">
      <div><span className="arrange-eyebrow">수업 도구 · {activeClass.name}</span><h2>자리·역할 배치</h2><p>서바이벌의 자리 배치와 역할 나누기를 아지트 학급 명부로 사용합니다.</p></div>
      <div className="arrange-save-area"><span className={dirty ? 'is-dirty' : ''}>{dirty ? '저장하지 않은 설정이 있습니다.' : '설정이 저장되어 있습니다.'}</span><button type="button" disabled={!dirty || saving} onClick={() => void saveSettings()}>{saving ? '저장 중…' : '설정 저장'}</button></div>
    </header>
    {error ? <div className="arrange-alert is-error" role="alert">{error}<button type="button" aria-label="오류 닫기" onClick={() => setError('')}>×</button></div> : null}
    {notice ? <div className="arrange-alert is-success" role="status">{notice}<button type="button" aria-label="안내 닫기" onClick={() => setNotice('')}>×</button></div> : null}
    <nav className="arrange-tabs" role="tablist" aria-label="자리·역할 배치 메뉴">{TABS.map((item) => <button type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'is-active' : ''} key={item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
    <div>
      {tab === 'seat' ? <SeatArrangement key={activeClass.id} students={groupedStudents} settings={seat} history={history} onSettingsChange={updateSeat} onCreateHistory={createHistory} /> : null}
      {tab === 'role' ? <RoleArrangement key={activeClass.id} students={groupedStudents} settings={role} history={history} onSettingsChange={updateRole} onCreateHistory={createHistory} /> : null}
      {tab === 'history' ? <HistoryView key={activeClass.id} history={history} onDelete={deleteHistory} /> : null}
      {tab === 'settings' ? <>
        <ArrangementSettings students={students} seat={seat} role={role} studentGroups={studentGroups} onSeatChange={updateSeat} onRoleChange={updateRole} onGroupsChange={updateGroups} />
        <section className="arrange-transfer-card"><div><h3>기존 서바이벌 자료 이전</h3><p>서바이벌 안내 페이지에서 내려받은 JSON 파일을 보관하고, 선택한 학급의 자리·역할 설정을 현재 아지트 학급과 이름으로 연결합니다.</p></div><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={selectArchive} /><button type="button" className="arrange-secondary" onClick={() => fileRef.current?.click()}>백업 파일 선택</button>
          {legacyArchive ? <div className="arrange-import-box"><select value={legacyClassId} onChange={(event) => setLegacyClassId(event.target.value)}><option value="">옮길 기존 학급 선택</option>{legacyArchive.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" className="arrange-primary" disabled={!legacyClassId || importing} onClick={importArchive}>{importing ? '이전 중…' : '현재 학급으로 이전'}</button></div> : null}
        </section>
        <section className="arrange-sound-card"><div><h3>추첨 효과음</h3><p>자리와 역할 추첨 애니메이션의 소리를 이 브라우저에 저장합니다.</p></div><label><input type="checkbox" checked={!sound.muted} onChange={(event) => changeSound({ muted: !event.target.checked })} /> 소리 켜기</label><input aria-label="효과음 크기" type="range" min="0" max="1" step="0.05" value={sound.volume} onChange={(event) => changeSound({ volume: Number(event.target.value) })} /></section>
      </> : null}
    </div>
  </section>;
}
