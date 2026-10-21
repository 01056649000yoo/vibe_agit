import React, { useCallback, useEffect, useState } from 'react';
import Button from '../common/Button';
import { PanelHeader, SectionCard, formatDate } from './adminUsageUi';
import { confirmMatches, findTeachers, listTeacherTransfers, previewTeacherTransfer, runTeacherTransfer } from './teacherTransferApi';

/**
 * 교사 계정 이관(2026-10-21). 교육청이 구글 계정을 지워 로그인할 수 없게 된 선생님의 자료를 새 계정으로 옮긴다.
 *   1) 옛 계정·새 계정을 찾아 고른다  2) 사전 점검(아무것도 바꾸지 않는다)  3) 옛 계정 이메일을 입력해 실행
 * 옮기는 것은 학급·과제·학생 기록·점수 지급·댓글 같은 소유 자료이고, 이력(로그)·연동 키·약관 동의는 옛 계정에 남는다.
 * 새 계정이 먼저 로그인해 승인되고 교사 정보를 입력해 둬야 한다.
 */
const Picker = ({ title, hint, selected, onSelect }) => {
    const [query, setQuery] = useState('');
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const search = async (event) => {
        event.preventDefault();
        setBusy(true); setError('');
        try { setRows(await findTeachers(query)); } catch (reason) { setError(reason.message); setRows(null); }
        setBusy(false);
    };
    return (
        <div style={{ flex: '1 1 320px', minWidth: 0, display: 'grid', gap: '10px', alignContent: 'start' }}>
            <h4 style={{ margin: 0, fontSize: '1rem', color: '#2D3748' }}>{title}</h4>
            <p style={{ margin: 0, color: '#718096', fontSize: '0.85rem' }}>{hint}</p>
            <form onSubmit={search} style={{ display: 'flex', gap: '8px' }}>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름이나 이메일(두 글자 이상)" maxLength={80}
                    style={{ flex: 1, minWidth: 0, padding: '10px 12px', border: '1px solid #CBD5E0', borderRadius: '8px', fontSize: '0.95rem' }} />
                <Button type="submit" variant="outline" disabled={busy || query.trim().length < 2}>{busy ? '찾는 중…' : '찾기'}</Button>
            </form>
            {error && <p role="alert" style={{ margin: 0, color: '#C53030', fontSize: '0.88rem' }}>{error}</p>}
            {selected && (
                <div style={{ padding: '10px 12px', background: '#EBF8FF', border: '1px solid #90CDF4', borderRadius: '8px', fontSize: '0.9rem' }}>
                    <strong>{selected.name || '(이름 없음)'}</strong> · {selected.email || '이메일 없음'}
                    <div style={{ color: '#4A5568', fontSize: '0.82rem' }}>{selected.school || '학교 정보 없음'} · 학급 {selected.class_count}개</div>
                </div>
            )}
            {rows && (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '6px' }}>
                    {rows.length === 0 && <li style={{ color: '#718096', fontSize: '0.88rem' }}>찾은 선생님이 없어요.</li>}
                    {rows.map((row) => (
                        <li key={row.id}>
                            <button type="button" onClick={() => onSelect(row)} aria-pressed={selected?.id === row.id}
                                style={{ width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: '8px', border: selected?.id === row.id ? '2px solid #3182CE' : '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', font: 'inherit' }}>
                                <strong>{row.name || '(이름 없음)'}</strong> · {row.email || '이메일 없음'}
                                <div style={{ color: '#718096', fontSize: '0.8rem' }}>
                                    {row.school || '학교 없음'} · 학급 {row.class_count}개 · {row.approved ? '승인됨' : '승인 안 됨'}
                                    {row.already_transferred ? ' · 이미 이관함' : ''}{!row.has_teacher_info ? ' · 교사 정보 없음' : ''}
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

/** 옛 계정이 지금도 쓰는 계정이 아닌지 눈에 띄게 알린다(관리자가 옛·새 계정을 바꿔 고르거나 다른 선생님을 고른 실수를 막는 마지막 확인). */
const ActiveWarning = ({ old }) => {
    if (!old || !(old.approved || old.recently_active)) return null;
    return (
        <div role="alert" style={{ padding: '12px 14px', background: '#FFFAF0', border: '2px solid #ED8936', borderRadius: '8px', color: '#7B341E' }}>
            <strong>⚠️ 옛 계정이 지금도 쓰는 계정일 수 있어요.</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '0.88rem' }}>
                {old.approved && <li>승인된 상태예요(이관하면 승인이 취소돼 로그인할 수 없게 돼요).</li>}
                {old.recently_active && <li>최근 30일 안에 로그인했어요(마지막 접속 {formatDate(old.last_login_at)}).</li>}
            </ul>
            <div style={{ marginTop: '6px', fontSize: '0.85rem' }}>옛 계정과 새 계정을 서로 바꿔 골랐거나 다른 선생님을 고른 것은 아닌지 이름과 이메일을 다시 확인해 주세요.</div>
        </div>
    );
};

const Result = ({ result }) => (
    <div style={{ display: 'grid', gap: '12px' }}>
        {!result.applied && <ActiveWarning old={result.old} />}
        {result.conflicts?.length > 0 && (
            <div role="alert" style={{ padding: '12px 14px', background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: '8px', color: '#9B2C2C' }}>
                <strong>충돌이 있어 이관할 수 없어요.</strong> 아래를 먼저 해결해 주세요(새 계정에 같은 자료가 이미 있는 경우 등).
                <ul style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
                    {result.conflicts.map((item) => <li key={`${item.table}.${item.column}`}><code>{item.table}.{item.column}</code> ({item.rows}행) — {item.error}</li>)}
                </ul>
            </div>
        )}
        <div>
            <strong>{result.applied ? '옮긴 자료' : '옮겨질 자료'}</strong> · 모두 {Number(result.total_rows).toLocaleString('ko-KR')}행
            <div style={{ overflowX: 'auto', marginTop: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                    <thead><tr style={{ background: '#F7FAFC', textAlign: 'left' }}><th style={{ padding: '8px' }}>자료</th><th style={{ padding: '8px' }}>표·열</th><th style={{ padding: '8px', textAlign: 'right' }}>행 수</th></tr></thead>
                    <tbody>
                        {result.moved.map((item) => (
                            <tr key={`${item.table}.${item.column}`} style={{ borderTop: '1px solid #EDF2F7' }}>
                                <td style={{ padding: '8px' }}>{item.reason}</td>
                                <td style={{ padding: '8px', color: '#718096' }}><code>{item.table}.{item.column}</code></td>
                                <td style={{ padding: '8px', textAlign: 'right' }}>{Number(item.rows).toLocaleString('ko-KR')}</td>
                            </tr>
                        ))}
                        {result.moved.length === 0 && <tr><td colSpan={3} style={{ padding: '10px', color: '#718096' }}>옮길 자료가 없어요.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
        {result.kept?.length > 0 && (
            <details>
                <summary style={{ cursor: 'pointer', color: '#4A5568' }}>옛 계정에 그대로 남는 기록 {result.kept.length}종(이력·연동 정보)</summary>
                <ul style={{ margin: '8px 0 0', paddingLeft: '18px', color: '#4A5568', fontSize: '0.85rem' }}>
                    {result.kept.map((item) => <li key={`${item.table}.${item.column}`}>{item.reason} — <code>{item.table}.{item.column}</code> ({Number(item.rows).toLocaleString('ko-KR')}행)</li>)}
                </ul>
            </details>
        )}
    </div>
);

const AdminTeacherTransferPanel = () => {
    const [oldTeacher, setOldTeacher] = useState(null);
    const [newTeacher, setNewTeacher] = useState(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [typed, setTyped] = useState('');
    const [history, setHistory] = useState([]);

    const loadHistory = useCallback(() => listTeacherTransfers().then(setHistory).catch(() => setHistory([])), []);
    useEffect(() => {
        let alive = true;
        listTeacherTransfers().then((rows) => { if (alive) setHistory(rows); }).catch(() => {});
        return () => { alive = false; };
    }, []);

    const pick = (setter) => (row) => { setter(row); setResult(null); setError(''); setTyped(''); };
    const ready = Boolean(oldTeacher && newTeacher && oldTeacher.id !== newTeacher.id);

    const preview = async () => {
        setBusy(true); setError(''); setResult(null); setTyped('');
        try { setResult(await previewTeacherTransfer(oldTeacher.id, newTeacher.id)); } catch (reason) { setError(reason.message); }
        setBusy(false);
    };
    const run = async () => {
        setBusy(true); setError('');
        try {
            setResult(await runTeacherTransfer(oldTeacher.id, newTeacher.id, typed));
            setTyped(''); loadHistory();
        } catch (reason) { setError(reason.message); }
        setBusy(false);
    };

    const canRun = result && !result.applied && result.can_apply && result.total_rows > 0 && confirmMatches(typed, result.old?.email) && !busy;
    return (
        <div style={{ display: 'grid', gap: '16px' }}>
            <SectionCard>
                <PanelHeader
                    title="교사 계정 이관"
                    description="구글 계정을 쓸 수 없게 된 선생님의 학급·과제·학생 기록 등을 새 계정으로 옮겨요. 새 계정은 먼저 로그인해 승인되고 교사 정보를 입력해 둬야 해요."
                />
                <div style={{ padding: '20px', display: 'grid', gap: '20px' }}>
                    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                        <Picker title="① 옛 계정(쓸 수 없게 된 계정)" hint="자료를 가져올 계정" selected={oldTeacher} onSelect={pick(setOldTeacher)} />
                        <Picker title="② 새 계정" hint="자료를 이어받을 계정(로그인·승인·교사 정보 입력이 끝나 있어야 해요)" selected={newTeacher} onSelect={pick(setNewTeacher)} />
                    </div>
                    {oldTeacher && newTeacher && oldTeacher.id === newTeacher.id && <p role="alert" style={{ margin: 0, color: '#C53030' }}>옛 계정과 새 계정이 같은 선생님이에요.</p>}
                    <div><Button variant="primary" disabled={!ready || busy} onClick={preview}>{busy && !result ? '점검 중…' : '③ 사전 점검(아무것도 바꾸지 않아요)'}</Button></div>
                    {error && <p role="alert" style={{ margin: 0, color: '#C53030', fontWeight: 700 }}>{error}</p>}
                    {result && <Result result={result} />}
                    {result && !result.applied && result.can_apply && (
                        <div style={{ display: 'grid', gap: '10px', padding: '14px', border: '2px solid #FC8181', borderRadius: '10px', background: '#FFF5F5' }}>
                            <strong style={{ color: '#9B2C2C' }}>④ 이관 실행 — 되돌리기 어려운 작업이에요</strong>
                            <p style={{ margin: 0, fontSize: '0.88rem', color: '#4A5568' }}>
                                위 자료의 주인이 <b>{result.old.name || result.old.email}</b> → <b>{result.new.name || result.new.email}</b> 로 바뀌고, 옛 계정은 승인이 취소돼 로그인할 수 없게 돼요(지워지지는 않아요).
                                확인하려면 옛 계정의 이메일 <code>{result.old.email}</code> 을 그대로 입력해 주세요.
                            </p>
                            <input value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="옛 계정 이메일" aria-label="확인용 옛 계정 이메일" autoComplete="off"
                                style={{ padding: '10px 12px', border: '1px solid #FEB2B2', borderRadius: '8px', fontSize: '0.95rem' }} />
                            <div><Button variant="danger" disabled={!canRun} onClick={run}>{busy ? '이관 중…' : '이관 실행'}</Button></div>
                        </div>
                    )}
                    {result?.applied && <p role="status" style={{ margin: 0, color: '#276749', fontWeight: 800 }}>✅ 이관을 마쳤어요. 새 계정으로 로그인해 학급이 보이는지 확인해 주세요. 다했니 연동·개인 API 키·약관 동의는 새 계정에서 다시 해야 해요.</p>}
                </div>
            </SectionCard>
            <SectionCard>
                <PanelHeader title="이관 기록" description="지금까지 한 이관(최근 50건)" />
                <div style={{ padding: '16px 20px' }}>
                    {history.length === 0 ? <p style={{ margin: 0, color: '#718096' }}>아직 이관한 기록이 없어요.</p> : (
                        <ul style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '4px', fontSize: '0.9rem' }}>
                            {history.map((item) => <li key={item.id}>{formatDate(item.created_at)} · {item.old_email || '(이메일 없음)'} → {item.new_email || '(이메일 없음)'} · {Number(item.total_rows).toLocaleString('ko-KR')}행</li>)}
                        </ul>
                    )}
                </div>
            </SectionCard>
        </div>
    );
};

export default AdminTeacherTransferPanel;
