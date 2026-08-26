import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TeacherGuideButton from '../../../components/teacher/TeacherGuideButton';
import MealFullscreen from './MealFullscreen';
import SchoolChangeModal from './SchoolChangeModal';
import StudentNoteModal from './StudentNoteModal';
import {
  findUniqueSchoolMatch,
  formatMealDate,
  getSeoulDateString,
  summarizeRoster
} from './mealBoardEngine';
import { mealBoardApi } from './mealBoardApi';
import { searchSchools } from '../../../utils/schoolApi';
import './mealBoard.css';

const FILTERS = [
  { id: 'all', label: '전체' },
  { id: 'has_note', label: '비고 있음' },
  { id: 'no_note', label: '비고 없음' }
];

function noteStatus(student) {
  return student.note
    ? { tone: 'registered', text: student.note }
    : { tone: 'empty', text: '비고 없음' };
}

const normalizeWorkspace = (result) => ({
  school: result?.school || null,
  allergens: Array.isArray(result?.allergens) ? result.allergens : [],
  students: Array.isArray(result?.students) ? result.students : []
});

export default function MealBoardTeacherEntry({ activeClass, teacherInfo, onTeacherSchoolChange }) {
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [date, setDate] = useState(() => getSeoulDateString());
  const [mealData, setMealData] = useState(null);
  const [mealLoading, setMealLoading] = useState(false);
  const [mealError, setMealError] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [savingStudent, setSavingStudent] = useState(false);
  const [schoolModalOpen, setSchoolModalOpen] = useState(false);
  const [savingSchool, setSavingSchool] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [schoolAutoLinking, setSchoolAutoLinking] = useState(false);
  const [schoolAutoLinkHint, setSchoolAutoLinkHint] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const autoLinkAttemptRef = useRef('');
  const closeStudentNote = useCallback(() => setSelectedStudent(null), []);

  const loadWorkspace = useCallback(async () => {
    if (!activeClass?.id) return;
    setLoading(true);
    setError('');
    try {
      const result = await mealBoardApi.getWorkspace(activeClass.id);
      setWorkspace(normalizeWorkspace(result));
    } catch (loadError) {
      setError(loadError.message || '급식 작업공간을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [activeClass?.id]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  const activeClassId = activeClass?.id || '';
  const teacherSchoolName = String(teacherInfo?.school_name || '').trim();
  const workspaceReady = workspace !== null;
  const linkedOfficeCode = workspace?.school?.officeCode || '';
  const linkedSchoolCode = workspace?.school?.schoolCode || '';

  useEffect(() => {
    if (!workspaceReady || !activeClassId || linkedOfficeCode || linkedSchoolCode) return undefined;
    if (teacherSchoolName.length < 2) {
      setSchoolAutoLinkHint('교사 프로필에서 학교를 검색해 연결해 주세요.');
      return undefined;
    }

    const attemptKey = `${activeClassId}:${teacherSchoolName}`;
    if (autoLinkAttemptRef.current === attemptKey) return undefined;
    autoLinkAttemptRef.current = attemptKey;
    let active = true;

    const linkTeacherSchool = async () => {
      setSchoolAutoLinking(true);
      setSchoolAutoLinkHint('');
      try {
        const schools = await searchSchools(teacherSchoolName);
        if (!active) return;
        const matchedSchool = findUniqueSchoolMatch(teacherSchoolName, schools);
        if (!matchedSchool) {
          setSchoolAutoLinkHint(schools.length > 0
            ? '같은 이름의 학교가 여러 곳일 수 있어 학교 설정에서 지역을 확인해 주세요.'
            : '교사 프로필의 학교를 자동으로 찾지 못했어요. 학교 설정에서 선택해 주세요.');
          return;
        }

        await mealBoardApi.saveSchool(activeClassId, 'default', matchedSchool);
        const result = await mealBoardApi.getWorkspace(activeClassId);
        if (!active) return;
        setWorkspace(normalizeWorkspace(result));
        onTeacherSchoolChange?.(matchedSchool);
        setNotice(`${matchedSchool.schoolName}을(를) 교사 기본 학교로 자동 연결했습니다.`);
      } catch (linkError) {
        if (active) setSchoolAutoLinkHint(linkError.message || '교사 학교를 자동으로 연결하지 못했습니다.');
      } finally {
        if (active) setSchoolAutoLinking(false);
      }
    };

    void linkTeacherSchool();
    return () => { active = false; };
  }, [activeClassId, linkedOfficeCode, linkedSchoolCode, onTeacherSchoolChange, teacherSchoolName, workspaceReady]);

  useEffect(() => {
    const school = workspace?.school;
    if (!school?.officeCode || !school?.schoolCode) {
      setMealData(null);
      setMealError('');
      return undefined;
    }
    let active = true;
    setMealLoading(true);
    setMealError('');
    mealBoardApi.getMeal({
      officeCode: school.officeCode,
      schoolCode: school.schoolCode,
      date,
      forceRefresh: refreshToken > 0
    }).then((result) => {
      if (active) setMealData(result || { meals: [] });
    }).catch((loadError) => {
      if (active) {
        setMealData(null);
        setMealError(loadError.message || '급식 정보를 불러오지 못했습니다.');
      }
    }).finally(() => {
      if (active) setMealLoading(false);
    });
    return () => { active = false; };
  }, [date, refreshToken, workspace?.school]);

  const allergens = useMemo(() => workspace?.allergens || [], [workspace?.allergens]);
  const allergenMap = useMemo(
    () => new Map(allergens.map((item) => [Number(item.code), item.label])),
    [allergens]
  );
  const meals = useMemo(() => Array.isArray(mealData?.meals) ? mealData.meals : [], [mealData?.meals]);
  const summary = useMemo(
    () => summarizeRoster(workspace?.students || []),
    [workspace?.students]
  );
  const roster = useMemo(() => (workspace?.students || []).map((student) => ({
    ...student,
    status: noteStatus(student)
  })).filter((student) => {
    if (filter === 'has_note') return Boolean(student.note);
    if (filter === 'no_note') return !student.note;
    return true;
  }), [filter, workspace?.students]);

  const saveNote = async (note) => {
    if (!selectedStudent || !activeClass?.id) return;
    setSavingStudent(true);
    setError('');
    try {
      const saved = await mealBoardApi.saveStudentNote(
        activeClass.id,
        selectedStudent.id,
        note
      );
      setWorkspace((current) => ({
        ...current,
        students: current.students.map((student) => student.id === selectedStudent.id
          ? { ...student, ...saved }
          : student)
      }));
      setSelectedStudent(null);
      setNotice(saved.note
        ? `${selectedStudent.name} 학생의 비고를 저장했습니다.`
        : `${selectedStudent.name} 학생의 비고를 삭제했습니다.`);
    } catch (saveError) {
      setError(saveError.message || '학생 비고를 저장하지 못했습니다.');
    } finally {
      setSavingStudent(false);
    }
  };

  const saveSchool = async (scope, school) => {
    if (!activeClass?.id) return;
    setSavingSchool(true);
    setError('');
    try {
      await mealBoardApi.saveSchool(activeClass.id, scope, school);
      if (scope === 'default') onTeacherSchoolChange?.(school);
      setSchoolModalOpen(false);
      setRefreshToken(0);
      await loadWorkspace();
      setNotice(scope === 'default' ? '내 기본 학교와 현재 학급에 적용했습니다.' : '현재 학급의 급식 학교를 변경했습니다.');
    } catch (saveError) {
      setError(saveError.message || '급식 학교를 저장하지 못했습니다.');
    } finally {
      setSavingSchool(false);
    }
  };

  const useDefaultSchool = async () => {
    if (!activeClass?.id) return;
    setSavingSchool(true);
    setError('');
    try {
      await mealBoardApi.saveSchool(activeClass.id, 'use_default');
      setSchoolModalOpen(false);
      setRefreshToken(0);
      await loadWorkspace();
      setNotice('가입할 때 선택한 기본 학교를 사용합니다.');
    } catch (saveError) {
      setError(saveError.message || '기본 학교로 되돌리지 못했습니다.');
    } finally {
      setSavingSchool(false);
    }
  };

  if (!activeClass?.id) return <section className="meal-board meal-board-empty">
    <span aria-hidden="true">🍱</span>
    <h2>먼저 학급을 선택해 주세요</h2>
    <p>학급 학생 명단과 급식 정보를 함께 확인하는 도구예요.</p>
  </section>;

  if (loading) return <section className="meal-board meal-board-empty" aria-live="polite">
    <span className="meal-loading-dot" aria-hidden="true" />
    <h2>급식판을 준비하고 있어요</h2>
  </section>;

  if (error && !workspace) return <section className="meal-board meal-board-empty">
    <span aria-hidden="true">🥄</span><h2>급식판을 열지 못했어요</h2><p>{error}</p>
    <button type="button" className="meal-button is-primary" onClick={loadWorkspace}>다시 불러오기</button>
  </section>;

  return <section className="meal-board">
    <header className="meal-board-header">
      <div>
        <span className="meal-kicker">수업 도구 · 급식 확인</span>
        <h2>얘들아, 밥 먹자! <span aria-hidden="true">🍱</span></h2>
        <p>오늘 급식과 우리 반 학생별 비고를 확인해요</p>
      </div>
      <TeacherGuideButton tabId="meal-board" variant="help" />
    </header>

    {error ? <div className="meal-alert is-error" role="alert"><span>!</span>{error}<button type="button" onClick={() => setError('')}>닫기</button></div> : null}
    {notice ? <div className="meal-alert is-success" role="status"><span>✓</span>{notice}<button type="button" onClick={() => setNotice('')}>닫기</button></div> : null}

    <div className="meal-board-layout">
      <article className="meal-panel meal-today-panel">
        <div className="meal-panel-heading">
          <div>
            <span className="meal-kicker">{formatMealDate(date)}</span>
            <h3>{workspace?.school?.schoolName || '급식 학교를 설정해 주세요'}</h3>
            {workspace?.school ? <p>{workspace.school.source === 'class_override' ? '현재 학급에만 적용한 학교' : '가입 정보와 자동 연동된 학교'}</p> : <p>나이스 학교 검색으로 한 번만 연결하면 돼요.</p>}
          </div>
          <button type="button" className="meal-text-button" onClick={() => setSchoolModalOpen(true)}>학교 설정</button>
        </div>

        <div className="meal-date-toolbar">
          <input type="date" value={date} onChange={(event) => { setDate(event.target.value); setRefreshToken(0); }} aria-label="급식 날짜" />
          <button type="button" className="meal-text-button" onClick={() => { setDate(getSeoulDateString()); setRefreshToken(0); }}>오늘</button>
          <button type="button" className="meal-icon-button" aria-label="급식 새로고침" disabled={!workspace?.school || mealLoading} onClick={() => setRefreshToken((value) => value + 1)}>↻</button>
        </div>

        {!workspace?.school ? <div className="meal-state-card">
          {schoolAutoLinking ? <span className="meal-loading-dot" aria-hidden="true" /> : <span aria-hidden="true">🏫</span>}
          <h4>{schoolAutoLinking ? '교사 학교를 자동으로 연결하고 있어요' : '급식 학교 연결이 필요해요'}</h4>
          <p>{schoolAutoLinking ? `${teacherSchoolName}의 나이스 학교 정보를 확인하는 중입니다.` : schoolAutoLinkHint || '학교 설정에서 나이스 검색 결과를 선택해 주세요.'}</p>
          <button type="button" className="meal-button is-primary" onClick={() => setSchoolModalOpen(true)}>학교 찾기</button>
        </div> : mealLoading ? <div className="meal-state-card"><span className="meal-loading-dot" aria-hidden="true" /><h4>급식을 불러오는 중이에요</h4></div>
          : mealError ? <div className="meal-state-card is-error"><span aria-hidden="true">🥣</span><h4>급식을 불러오지 못했어요</h4><p>{mealError}</p><button type="button" className="meal-button is-secondary" onClick={() => setRefreshToken((value) => value + 1)}>다시 시도</button></div>
            : meals.length === 0 ? <div className="meal-state-card"><span aria-hidden="true">🍽️</span><h4>등록된 급식이 없어요</h4><p>방학·휴일이거나 아직 학교에서 등록하지 않았을 수 있어요.</p></div>
              : <div className="meal-card-list">{meals.map((meal, index) => <section className="meal-menu-card" key={`${meal.mealType}-${index}`}>
                <div className="meal-menu-title"><strong>{meal.mealType || '급식'}</strong>{meal.calories ? <span>{meal.calories}</span> : null}</div>
                <ul>{(meal.dishes || []).map((dish, dishIndex) => <li key={`${dish.name}-${dishIndex}`}>
                  <span>{dish.name}</span>
                  {dish.allergenCodes?.length ? <small>{dish.allergenCodes.map((code) => allergenMap.get(Number(code)) || code).join(' · ')}</small> : null}
                </li>)}</ul>
              </section>)}</div>}

        <div className="meal-public-actions">
          <p>{mealData?.warning || '나이스 학교 급식 정보를 사용합니다.'}</p>
          <button type="button" className="meal-button is-dark" disabled={!workspace?.school || mealLoading} onClick={() => setFullscreenOpen(true)}>전체화면 보기</button>
        </div>
      </article>

      <article className="meal-panel meal-roster-panel">
        <div className="meal-panel-heading">
          <div><span className="meal-kicker">교사 전용 · 비공개</span><h3>우리 반 비고</h3><p>필요한 학생만 선택해 짧게 기록할 수 있어요.</p></div>
          <div className="meal-roster-heading-actions">
            <span className="meal-roster-count">{summary.total}명</span>
            <button
              type="button"
              className="meal-collapse-button"
              aria-expanded={notesExpanded}
              aria-controls="meal-roster-content"
              onClick={() => setNotesExpanded((expanded) => !expanded)}
            >
              {notesExpanded ? '접기' : '펼치기'} <span aria-hidden="true">{notesExpanded ? '⌃' : '⌄'}</span>
            </button>
          </div>
        </div>

        {notesExpanded ? <div id="meal-roster-content">
          <div className="meal-note-guidance">학급 운영에 필요한 간단한 메모만 남겨 주세요. 알레르기·질병 등 민감한 건강정보는 입력하지 않습니다.</div>
          <div className="meal-summary-grid">
            <div><strong>{summary.total}</strong><span>전체 학생</span></div>
            <div><strong>{summary.withNote}</strong><span>비고 있음</span></div>
            <div><strong>{summary.withoutNote}</strong><span>비고 없음</span></div>
          </div>
          <div className="meal-filter-row" role="group" aria-label="학생 비고 필터">
            {FILTERS.map((item) => <button type="button" key={item.id} className={filter === item.id ? 'is-active' : ''} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}
          </div>
          <div className="meal-roster-list">
            {roster.length === 0 ? <div className="meal-roster-empty">이 조건에 해당하는 학생이 없습니다.</div> : roster.map((student) => <button type="button" className="meal-student-row" key={student.id} onClick={() => setSelectedStudent(student)}>
              <span className={`meal-status-dot is-${student.status.tone}`} aria-hidden="true" />
              <span className="meal-student-name">{student.name}</span>
              <span className={`meal-student-status is-${student.status.tone}`}>{student.status.text}</span>
              <span className="meal-student-edit">{student.note ? '수정' : '비고 입력'}</span>
            </button>)}
          </div>
        </div> : null}
      </article>
    </div>

    {selectedStudent ? <StudentNoteModal student={selectedStudent} saving={savingStudent} onClose={closeStudentNote} onSave={saveNote} /> : null}
    {schoolModalOpen ? <SchoolChangeModal currentSchool={workspace?.school} initialSchoolName={teacherSchoolName} saving={savingSchool} onClose={() => setSchoolModalOpen(false)} onSave={saveSchool} onUseDefault={useDefaultSchool} /> : null}
    {fullscreenOpen ? <MealFullscreen school={workspace?.school} date={date} meals={meals} allergenMap={allergenMap} onClose={() => setFullscreenOpen(false)} /> : null}
  </section>;
}
