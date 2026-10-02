import { useCallback, useEffect, useState } from 'react';
import ClawCelebration from './ClawCelebration';
import ClawPlayScreen from './ClawPlayScreen';
import ClawPrizeSettings from './ClawPrizeSettings';
import {
    CLAW_CLASS_SETTING_OPTIONS, CLAW_DEFAULT_PRIZE_SETTINGS, normalizeClawClassSettings, normalizeClawPrizeSettings,
    sumClawPrizeSettings
} from './prizeTable';
import { buildSpellingQuizPool, SPELLING_QUIZ_LEVELS, spellingSourcesFromEntries } from './quiz/spellingQuizBuilder';
import { clawPrizeText, createLocalClawSession, previewStudentFromRoster } from './clawSession';
import { CLAW_PLUSHES } from './plushCatalog';
import { DRAGON_DECOR_ITEMS } from '../dragon/decorCatalog';
import { getReaderLevel, getWriterLevel } from '../../../constants/writerLevels';
import { getElementarySpellingEntries } from '../../writing/tools/spelling-lookup/elementarySpellingEntries';
import { supabase } from '../../../lib/supabaseClient';
import { resolveActivityNotification } from '../../notifications/registry';
import './clawTestBench.css';

/*
 * 수호룡의 인형뽑기 교사 화면(2026-10-02 학생 공개). 학생 노출 켜기/끄기는 놀이터 공통 스위치(enabled_modules)가 맡는다.
 *   🛠️ 교사 관리  학급 설정·상품 설정 — **저장 단추**로 서버에 저장한다(선생님 결정). 저장 전 값은 학생에게 가지 않는다.
 *   📜 뽑기 내역  우리 반 상품 원장 — 이 탭이 보이는 동안만 12초마다 새로 고친다(숨은 탭·다른 탭에서는 멈춤).
 *   🧒 학생 화면  학생이 보는 그대로 미리 해 보기 — 이 브라우저 안에서만 흉내(포인트·아이템 지급 없음). 저장 전 설정으로도 본다.
 * 학급이 없을 때(실험실)는 설정을 이 화면에만 두고, 내역은 미리보기에서 뽑은 것만 보인다.
 */
const TABS = [
    { id: 'manage', icon: '🛠️', label: '교사 관리' },
    { id: 'history', icon: '📜', label: '뽑기 내역' },
    { id: 'preview', icon: '🧒', label: '학생 화면 미리보기' }
];
const TAB_KEY = 'spelling-claw-teacher-tab-v2';
const readTab = () => { try { const saved = window.localStorage.getItem(TAB_KEY); return TABS.some((item) => item.id === saved) ? saved : 'manage'; } catch { return 'manage'; } };
const saveTab = (id) => { try { window.localStorage.setItem(TAB_KEY, id); } catch { /* 다음에 교사 관리부터 보일 뿐 */ } };
const HISTORY_POLL_MS = 12000;
const HISTORY_MAX_BACKOFF_MS = 120000;

const SAMPLE_STUDENTS = [
    { id: 'sample-egg', name: '견본 · 알', speciesId: 'star', writerLevel: 1, readerLevel: 1, owned: [] },
    { id: 'sample-hatch', name: '견본 · 해츨링', speciesId: 'forest', writerLevel: 4, readerLevel: 2, owned: [] },
    { id: 'sample-grown', name: '견본 · 자란 수호룡', speciesId: 'ember', writerLevel: 8, readerLevel: 4, owned: [] }
];
const levelOf = (raw) => ({
    writerLevel: getWriterLevel(raw.writer_total_chars, raw.writer_completed_posts, raw.writer_level_override).level,
    readerLevel: getReaderLevel(raw.reader_score, raw.reader_level_override).level
});
// 미리보기 문제는 기본 사전에서 낸다(학생에게는 서버가 공통 자료·우리 반 자료까지 섞는다). 처음 쓸 때 한 번만 만든다.
let previewPool = null;
const getPreviewPool = () => {
    if (!previewPool) previewPool = buildSpellingQuizPool(spellingSourcesFromEntries(getElementarySpellingEntries()));
    return previewPool;
};
const snapshot = (classDraft, prizeDraft) => JSON.stringify([normalizeClawClassSettings(classDraft), normalizeClawPrizeSettings(prizeDraft)]);
const messageOf = (error, fallback) => (error?.message && !/Failed to fetch/i.test(error.message) ? error.message : fallback);

export default function SpellingClawTeacherManager({ activeClass }) {
    const classId = activeClass?.id || null;
    const [tab, setTab] = useState(readTab);

    // ── 설정(저장 단추)
    const [classDraft, setClassDraft] = useState(() => normalizeClawClassSettings({}));
    const [prizeDraft, setPrizeDraft] = useState(() => structuredClone(CLAW_DEFAULT_PRIZE_SETTINGS));
    const [saved, setSaved] = useState({ snapshot: snapshot({}, CLAW_DEFAULT_PRIZE_SETTINGS), updatedAt: null, classDraft: null, prizeDraft: null });
    const [settingsState, setSettingsState] = useState(classId ? 'loading' : 'local');
    const [saveMessage, setSaveMessage] = useState(null);

    const loadSettings = useCallback(async () => {
        if (!classId) return;
        const { data, error } = await supabase.rpc('get_teacher_spelling_claw_settings_v1', { p_class_id: classId });
        if (error) { setSettingsState('error'); setSaveMessage({ tone: 'error', text: messageOf(error, '설정을 불러오지 못했어요.') }); return; }
        const nextClass = normalizeClawClassSettings(data?.settings);
        const nextPrize = normalizeClawPrizeSettings(data?.prize_settings ?? undefined);
        setClassDraft(nextClass);
        setPrizeDraft(nextPrize);
        setSaved({ snapshot: snapshot(nextClass, nextPrize), updatedAt: data?.updated_at || null, classDraft: nextClass, prizeDraft: nextPrize });
        setSettingsState('ready');
    }, [classId]);

    useEffect(() => {
        const timer = setTimeout(loadSettings, 0);
        return () => clearTimeout(timer);
    }, [loadSettings]);

    const dirty = snapshot(classDraft, prizeDraft) !== saved.snapshot;
    const prizeTotal = sumClawPrizeSettings(prizeDraft).total;
    const setField = (key, value) => setClassDraft((current) => ({ ...current, [key]: value }));
    const save = async () => {
        if (!classId || !dirty || prizeTotal !== 100) return;
        setSettingsState('saving');
        setSaveMessage(null);
        const nextClass = normalizeClawClassSettings(classDraft);
        const nextPrize = normalizeClawPrizeSettings(prizeDraft);
        const { data, error } = await supabase.rpc('save_teacher_spelling_claw_settings_v1', {
            p_class_id: classId, p_settings: nextClass, p_prize_settings: nextPrize, p_expected_updated_at: saved.updatedAt
        });
        if (error) {
            setSettingsState('ready');
            setSaveMessage({ tone: 'error', conflict: error.code === '40001', text: messageOf(error, '저장하지 못했어요. 잠시 뒤 다시 해 주세요.') });
            return;
        }
        setSaved({ snapshot: snapshot(nextClass, nextPrize), updatedAt: data?.updated_at || null, classDraft: nextClass, prizeDraft: nextPrize });
        setSettingsState('ready');
        setSaveMessage({ tone: 'ok', text: '저장했어요. 학생 화면에 바로 적용돼요.' });
    };
    const revert = () => {
        if (!saved.classDraft) return;
        setClassDraft(saved.classDraft);
        setPrizeDraft(saved.prizeDraft);
        setSaveMessage(null);
    };

    // 저장하지 않은 변경이 있으면 창을 닫을 때 브라우저가 한 번 묻는다.
    useEffect(() => {
        if (!classId || !dirty) return undefined;
        const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [classId, dirty]);

    // ── 뽑기 내역(보이는 동안만 12초)
    const [history, setHistory] = useState({ rows: [], today: null, error: '' });
    const [localRows, setLocalRows] = useState([]);
    const [historyFilter, setHistoryFilter] = useState('all');
    useEffect(() => {
        if (!classId || tab !== 'history') return undefined;
        let stopped = false;
        let timer = null;
        let failures = 0;
        let inFlight = false;
        const run = async () => {
            if (stopped || inFlight || document.visibilityState !== 'visible') return;
            inFlight = true;
            const { data, error } = await supabase.rpc('get_teacher_spelling_claw_history_v1', { p_class_id: classId, p_limit: 100 });
            inFlight = false;
            if (stopped) return;
            if (error) {
                failures += 1;
                setHistory((current) => ({ ...current, error: '내역을 불러오지 못했어요. 잠시 뒤 다시 해 볼게요.' }));
            } else {
                failures = 0;
                setHistory({ rows: data?.rows || [], today: data?.today || null, error: '' });
            }
            timer = setTimeout(run, failures ? Math.min(HISTORY_MAX_BACKOFF_MS, 30000 * (2 ** Math.min(2, failures - 1))) : HISTORY_POLL_MS);
        };
        const onVisible = () => { if (document.visibilityState === 'visible') { clearTimeout(timer); run(); } };
        run();
        document.addEventListener('visibilitychange', onVisible);
        return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
    }, [classId, tab]);
    const historyRows = classId ? history.rows : localRows;
    const prizeRows = historyRows.flatMap((row) => (row.prizes?.length ? row.prizes : [{ kind: 'consolation', points: row.consolation_points }])
        .map((prize, index) => ({ key: `${row.play_id}-${index}`, at: new Date(row.finished_at), studentName: row.student_name, prize })));
    const countKind = (kind) => prizeRows.filter((row) => row.prize.kind === kind).length;

    // ── 학생 화면 미리보기(이 브라우저 안에서만)
    const [students, setStudents] = useState(classId ? [] : SAMPLE_STUDENTS);
    const [studentsNote, setStudentsNote] = useState(classId ? '학생 수호룡을 불러오는 중…' : '');
    const [studentId, setStudentId] = useState(classId ? '' : SAMPLE_STUDENTS[1].id);
    const [quality, setQuality] = useState('auto');
    const [perf, setPerf] = useState(null);
    const [preview, setPreview] = useState({ key: 0, session: null });
    const [refreshKey, setRefreshKey] = useState(0);
    const [celebrationSample, setCelebrationSample] = useState(null);
    const [notificationPreview, setNotificationPreview] = useState(null);

    useEffect(() => {
        if (!classId) return undefined;
        let cancelled = false;
        supabase.rpc('get_teacher_dragon_growth_dashboard', { p_class_id: classId }).then(({ data, error }) => {
            if (cancelled) return;
            const list = error ? [] : (data?.students || []).slice(0, 100).map((raw) => previewStudentFromRoster(raw, levelOf));
            setStudents(list.length ? list : SAMPLE_STUDENTS);
            setStudentsNote(error ? '학생 수호룡을 불러오지 못해 견본으로 보여요.' : list.length ? '' : '학생이 없어 견본으로 보여요.');
            setStudentId((list[0] || SAMPLE_STUDENTS[1]).id);
            // 명단이 오기 전에 견본으로 시작한 미리보기는 접는다(학생을 고르고 다시 시작).
            setPreview((current) => ({ key: current.key + 1, session: null }));
        });
        return () => { cancelled = true; };
    }, [classId]);

    const student = students.find((item) => item.id === studentId) || students[0] || SAMPLE_STUDENTS[1];
    const startPreview = (target) => {
        setPreview((current) => ({
            key: current.key + 1,
            session: createLocalClawSession({
                student: target, classSettings: classDraft, prizeSettings: prizeDraft,
                catalog: DRAGON_DECOR_ITEMS, quizPool: getPreviewPool()
            })
        }));
        setNotificationPreview(null);
    };
    // 미리보기 탭을 열 때·학생을 바꿀 때 지금 설정(저장 전 포함)으로 새로 시작한다.
    const changeTab = (next) => {
        setTab(next); saveTab(next);
        if (next === 'preview' && !preview.session) startPreview(student);
    };

    const onPlayResult = (done) => {
        const row = {
            play_id: `local-${Date.now()}`, finished_at: new Date().toISOString(), student_name: done.studentName,
            prizes: done.prizes, consolation_points: done.consolationPoints
        };
        if (done.prizes.length || done.consolationPoints) setLocalRows((rows) => [row, ...rows].slice(0, 100));
        const first = done.prizes[0];
        if (done.consolationPoints) {
            setNotificationPreview({ ...resolveActivityNotification({ event_type: 'spelling-claw.consolation_awarded',
                payload: { points: done.consolationPoints, plays: normalizeClawClassSettings(classDraft).dailyPlays } }), audience: `${done.studentName}의 학생 홈 활동 알림으로 이렇게 가요` });
        } else if (first) {
            const own = resolveActivityNotification({ event_type: 'spelling-claw.prize_awarded', payload: { ...first } });
            setNotificationPreview(first.kind === 'gift' && classDraft.announceGifts
                ? { ...resolveActivityNotification({ event_type: 'spelling-claw.class_gift_won', payload: { winner_name: done.studentName, gift_name: first.gift_name } }),
                    audience: `반 친구 모두에게 이렇게 가요 · ${done.studentName}에게는 “${own.message}”` }
                : { ...own, audience: `${done.studentName}의 학생 홈 활동 알림으로 이렇게 가요` });
        }
    };

    const settingsLocked = settingsState === 'loading' || settingsState === 'saving';
    const selectField = (key, label, hint, format) => <label><span>{label} <small>{hint}</small></span>
        <select value={Reflect.get(classDraft, key)} disabled={settingsLocked} onChange={(event) => setField(key, typeof Reflect.get(classDraft, key) === 'number' ? Number(event.target.value) : event.target.value)}>
            {Reflect.get(CLAW_CLASS_SETTING_OPTIONS, key).map((option) => <option key={option} value={option}>{format(option)}</option>)}
        </select>
    </label>;

    return <div className="claw-bench">
        {celebrationSample && <ClawCelebration prize={celebrationSample} plushName="시바견" onClose={() => setCelebrationSample(null)} />}

        <div className="claw-bench__topbar">
            <div className="claw-bench__tabs" role="tablist" aria-label="인형뽑기 화면 선택">
                {TABS.map((item, position) => <button key={item.id} id={`claw-bench-tab-${item.id}`} type="button" role="tab"
                    aria-selected={tab === item.id} aria-controls={`claw-bench-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1}
                    className={tab === item.id ? 'is-active' : ''} onClick={() => changeTab(item.id)}
                    onKeyDown={(event) => {
                        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                        event.preventDefault();
                        const last = TABS.length - 1;
                        const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? last
                            : event.key === 'ArrowRight' ? (position === last ? 0 : position + 1) : (position === 0 ? last : position - 1);
                        const nextTab = TABS.at(nextIndex).id;
                        changeTab(nextTab);
                        event.currentTarget.parentElement?.querySelector(`#claw-bench-tab-${nextTab}`)?.focus();
                    }}>
                    <span aria-hidden="true">{item.icon}</span>{item.label}
                </button>)}
            </div>
            {tab === 'preview' && <section className="claw-bench__preview-tools" aria-label="학생 화면 미리보기 도구">
                <label>대상 학생 <select value={student.id} onChange={(event) => {
                    const next = students.find((item) => item.id === event.target.value) || student;
                    setStudentId(next.id);
                    startPreview(next);
                }}>
                    {students.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select></label>
                <label>화질 <select value={quality} onChange={(event) => setQuality(event.target.value)}>
                    <option value="auto">보통</option><option value="low">가볍게(태블릿)</option>
                </select></label>
                {perf && <span className="claw-bench__perf">{perf.fps}fps</span>}
                <button type="button" onClick={() => { preview.session?.addCoin(); setRefreshKey((value) => value + 1); }}>코인 +1 (미리보기)</button>
                <button type="button" onClick={() => setCelebrationSample(Math.random() < 0.5
                    ? { kind: 'gift', gift: { name: '자리 고르기권' } } : { kind: 'decor', item: { name: '구름 받침' } })}>큰 상품 축하 보기</button>
                <button type="button" onClick={() => startPreview(student)}>하루 새로 시작</button>
                {studentsNote && <p className="claw-bench__note">{studentsNote}</p>}
            </section>}
        </div>

        <div id="claw-bench-panel-manage" role="tabpanel" aria-labelledby="claw-bench-tab-manage" className="claw-bench__manage" hidden={tab !== 'manage'}>
            <section className="claw-bench__panel" aria-label="학급 설정">
                <header><b>학급 설정</b><span>우리 반 학생 모두에게 같이 적용돼요</span></header>
                <div className="claw-bench__fields">
                    {selectField('passCount', '목표', '문제 10개 중 이만큼 맞히면 코인 1개', (n) => `${n}/10`)}
                    {selectField('dailyPlays', '하루 기회', '하루에 받을 수 있는 코인(뽑기) 수', (n) => `${n}번`)}
                    {selectField('quizLevel', '난이도', '직접 고쳐 쓰는 문제 수', (id) => `${Reflect.get(SPELLING_QUIZ_LEVELS, id).label}(주관식 ${Reflect.get(SPELLING_QUIZ_LEVELS, id).writeCount})`)}
                    {selectField('minPoints', '최소 포인트', '기회를 다 쓰고 하나도 못 뽑았을 때', (n) => `${n}P`)}
                    {selectField('grip', '집게 힘', '튼튼할수록 잘 잡혀요', (id) => Reflect.get({ easy: '튼튼', normal: '보통', hard: '흐물' }, id))}
                    <label className="claw-bench__check"><span>선물 알림 <small>선생님 선물이 나오면 반 친구 모두에게 알려요</small></span>
                        <input type="checkbox" checked={classDraft.announceGifts} disabled={settingsLocked}
                            onChange={(event) => setField('announceGifts', event.target.checked)} />
                    </label>
                </div>
            </section>

            <section className="claw-bench__panel claw-bench__prizes" aria-label="상품 설정">
                <header><b>상품 설정</b><span>인형 하나를 뽑았을 때 각 상품이 나올 확률 · 합계 100% · 학생은 처음 안내의 ‘상품이 나올 확률 보기’로 봐요</span></header>
                <ClawPrizeSettings draft={prizeDraft} onChange={setPrizeDraft} />
            </section>

            <div className={`claw-bench__savebar${dirty ? ' is-dirty' : ''}`} role="status">
                <span>{!classId ? '실험실이라 이 화면에만 두고 저장하지 않아요.'
                    : settingsState === 'loading' ? '설정을 불러오는 중…'
                        : saveMessage?.text || (dirty ? '저장 안 된 변경이 있어요. 저장해야 학생에게 적용돼요.' : '저장된 설정이 학생에게 적용되고 있어요.')}
                {dirty && prizeTotal !== 100 && ` 상품 확률 합계가 ${prizeTotal}%예요 — 100%로 맞춰야 저장할 수 있어요.`}</span>
                {classId && saveMessage?.conflict && <button type="button" className="is-secondary" onClick={loadSettings}>새로 불러오기</button>}
                {classId && dirty && <button type="button" className="is-secondary" onClick={revert} disabled={settingsLocked}>되돌리기</button>}
                {classId && <button type="button" onClick={save} disabled={!dirty || settingsLocked || prizeTotal !== 100}>
                    {settingsState === 'saving' ? '저장 중…' : '저장'}
                </button>}
            </div>
        </div>

        <div id="claw-bench-panel-history" role="tabpanel" aria-labelledby="claw-bench-tab-history" className="claw-bench__history" hidden={tab !== 'history'}>
            <section className="claw-bench__panel" aria-label="뽑기 내역">
                <header><b>뽑기 내역</b><span>누가 언제 무엇을 받았는지 한곳에서 봐요 · 선생님 선물은 여기서 보고 챙겨 주세요</span></header>
                <div className="claw-bench__history-summary">
                    <div><small>{classId ? '오늘 뽑은 판' : '뽑은 상품'}</small><strong>{classId ? (history.today?.plays ?? 0) : prizeRows.length}</strong></div>
                    <div><small>🎁 선생님 선물</small><strong>{classId ? (history.today?.gifts ?? 0) : countKind('gift')}</strong></div>
                    <div><small>🐉 수호룡 아이템</small><strong>{classId ? (history.today?.decor ?? 0) : countKind('decor')}</strong></div>
                    <div><small>포인트</small><strong>{classId ? (history.today?.points ?? 0) : countKind('points')}</strong></div>
                </div>
                <div className="claw-bench__history-filter" role="group" aria-label="내역 거르기">
                    {[['all', '전체'], ['gift', '🎁 선물만'], ['decor', '🐉 수호룡 아이템만'], ['points', '포인트만']].map(([id, label]) => (
                        <button key={id} type="button" aria-pressed={historyFilter === id} onClick={() => setHistoryFilter(id)}>{label}</button>
                    ))}
                </div>
                {history.error && classId && <p className="claw-bench__error" role="alert">{history.error}</p>}
                {prizeRows.length === 0 ? <p className="claw-bench__note-muted">{classId ? '아직 우리 반 뽑기 내역이 없어요.' : '아직 뽑은 내역이 없어요. 학생 화면 미리보기 탭에서 뽑아 보면 여기에 쌓여요.'}</p>
                    : <table className="claw-bench__history-table">
                        <thead><tr><th>시각</th><th>학생</th><th>뽑은 인형</th><th>상품</th></tr></thead>
                        <tbody>
                            {prizeRows.filter((row) => historyFilter === 'all' || row.prize.kind === historyFilter).map((row) => <tr key={row.key} className={`is-${row.prize.kind}`}>
                                <td>{row.at.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                <td>{row.studentName}</td>
                                <td>{row.prize.kind === 'consolation' ? '—' : (row.prize.plush_name || CLAW_PLUSHES.find((plush) => plush.id === row.prize.plush_id)?.name || '')}</td>
                                <td><b>{row.prize.kind === 'consolation' ? `${row.prize.points}P (기회를 다 쓰고 못 뽑음)` : clawPrizeText(row.prize)}</b></td>
                            </tr>)}
                        </tbody>
                    </table>}
                <p className="claw-bench__note-muted">{classId
                    ? '최근 100건 · 이 탭을 보고 있는 동안 12초마다 저절로 새로 고쳐져요.'
                    : '실험실이라 미리보기에서 뽑은 것만 보여요.'}</p>
            </section>
        </div>

        <div id="claw-bench-panel-preview" role="tabpanel" aria-labelledby="claw-bench-tab-preview" hidden={tab !== 'preview'}>
            <p className="claw-bench__note-muted">미리보기예요 — 이 브라우저 안에서만 돌아서 포인트·아이템은 실제로 주지 않아요. 교사 관리 탭의 지금 값(저장 전 포함)으로 보여요.</p>
            {tab === 'preview' && !preview.session && <button type="button" className="claw-bench__next" onClick={() => startPreview(student)}>{student.name}(으)로 미리보기 시작</button>}
            {tab === 'preview' && preview.session && <ClawPlayScreen key={preview.key} session={preview.session} quality={quality}
                refreshKey={refreshKey} onPerf={setPerf} onPlayResult={onPlayResult} />}
            {notificationPreview && <section className="claw-bench__notice-preview" aria-label="학생 홈 알림 미리보기">
                <small>{notificationPreview.audience} (미리보기라 실제로는 보내지 않아요)</small>
                <div>
                    <span aria-hidden="true">{notificationPreview.icon}</span>
                    <p><b>{notificationPreview.title}</b>{notificationPreview.message}</p>
                    <button type="button" onClick={() => setNotificationPreview(null)}>{notificationPreview.actionLabel}</button>
                </div>
            </section>}
        </div>
    </div>;
}
