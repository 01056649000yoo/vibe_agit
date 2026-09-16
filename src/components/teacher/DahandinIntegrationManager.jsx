import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../common/Button';
import useNotice from '../common/useNotice';
import { supabase } from '../../lib/supabaseClient';
import { parseRoster } from '../../lib/dahandinRoster';
import {
    getCredentialStatus, saveCredential, deleteCredential,
    getClassSettings, upsertClassSettings,
    getLinks, saveLinks, runSync, getDashboard
} from '../../lib/dahandinApi';

/*
 * 다했니 쿠키 → "다했니 포인트" 연동 (교사 설정 안의 한 항목).
 *
 * 왜 이렇게(2026-09-16):
 *   다했니 API 키는 계정마다 자기 것을 써야 한다(키 하나로 남의 반은 못 본다). 그래서 교사가
 *   자기 키를 넣는다. 키는 서버가 암호화해 보관하고 화면엔 끝자리만 보인다.
 *   쿠키는 누적값이라, 늘어난 만큼(delta)만 포인트로 준다 — 서버가 계산한다.
 *
 * 세 단계 + 대시보드: ① 키 연결 → ② 학생 매칭 → ③ 정산(수동/자동) → 📊 다했어요 대시보드.
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const sectionStyle = {
    background: 'var(--ui-surface)', border: '1px solid var(--ui-border)',
    borderRadius: 'var(--ui-radius-xl)', padding: '18px', marginBottom: '16px'
};
const titleStyle = { margin: '0 0 4px', color: '#172033', fontSize: 'var(--ui-text-lg)' };
const hintStyle = { margin: '0 0 12px', color: '#64748B', fontSize: 'var(--ui-text-sm)', lineHeight: 1.55 };
const labelStyle = { display: 'block', color: '#475569', fontSize: 'var(--ui-text-sm)', marginBottom: '6px', fontWeight: 700 };
const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 'var(--ui-radius-md)',
    border: '1px solid #CBD5E1', fontSize: 'var(--ui-text-md)', background: 'white'
};
const stepBadge = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '22px', height: '22px', borderRadius: '999px', background: '#EEF2FF',
    color: '#4F46E5', fontSize: 'var(--ui-text-xs)', fontWeight: 800, marginRight: '8px'
};

function StatCard({ label, value, sub }) {
    return (
        <div style={{
            flex: '1 1 150px', minWidth: 0, padding: '14px', borderRadius: 'var(--ui-radius-lg)',
            background: '#F8FAFC', border: '1px solid #E2E8F0'
        }}>
            <div style={{ color: '#64748B', fontSize: 'var(--ui-text-xs)', marginBottom: '4px' }}>{label}</div>
            <div style={{ color: '#172033', fontSize: 'var(--ui-text-2xl)', fontWeight: 800 }}>{value}</div>
            {sub && <div style={{ color: '#94A3B8', fontSize: 'var(--ui-text-xs)', marginTop: '2px' }}>{sub}</div>}
        </div>
    );
}

// 의존성 없이 그리는 막대그래프(일자별 지급 포인트).
function DailyBars({ daily }) {
    if (!daily || daily.length === 0) {
        return <p style={{ color: '#94A3B8', fontSize: 'var(--ui-text-sm)' }}>아직 지급 내역이 없어요.</p>;
    }
    const max = Math.max(...daily.map((d) => d.points), 1);
    const W = Math.max(daily.length * 26, 240);
    const H = 120;
    const barW = 16;
    return (
        <svg viewBox={`0 0 ${W} ${H + 24}`} width="100%" height={H + 24} role="img" aria-label="일자별 지급 포인트">
            {daily.map((d, i) => {
                const h = Math.round((d.points / max) * H);
                const x = i * 26 + 4;
                return (
                    <g key={d.day_kst}>
                        <rect x={x} y={H - h} width={barW} height={h} rx="3" fill="#6366F1" />
                        <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize="9" fill="#94A3B8">
                            {String(d.day_kst).slice(5)}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

export default function DahandinIntegrationManager({ activeClass }) {
    const { notify, notice } = useNotice();
    const classId = activeClass?.id ?? null;

    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState(null);      // 자격증명 상태
    const [settings, setSettings] = useState(null);
    const [students, setStudents] = useState([]);
    const [links, setLinks] = useState([]);
    const [dashboard, setDashboard] = useState(null);

    const [apiKeyInput, setApiKeyInput] = useState('');
    const [savingKey, setSavingKey] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [matchRows, setMatchRows] = useState([]);   // [{name, code, studentId}]
    const [savingLinks, setSavingLinks] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [lastRun, setLastRun] = useState(null);
    const [error, setError] = useState('');
    const [tab, setTab] = useState('setup'); // 'setup'(연동) | 'dashboard'(정산·대시보드)

    const loadAll = useCallback(async () => {
        if (!classId) return;
        setLoading(true);
        setError('');
        try {
            const [st, se, links2, dash, studentsRes] = await Promise.all([
                getCredentialStatus().catch(() => null),
                getClassSettings(classId),
                getLinks(classId),
                getDashboard(classId, 30).catch(() => null),
                supabase.from('students').select('id, name').eq('class_id', classId).is('deleted_at', null).order('name')
            ]);
            setStatus(st);
            setSettings(se);
            setLinks(links2);
            setDashboard(dash);
            const roster = studentsRes.data ?? [];
            setStudents(roster);
            // 기존 매칭을 편집표로 되살린다.
            if (links2.length) {
                setMatchRows(links2.map((l) => ({
                    name: roster.find((s) => s.id === l.student_id)?.name ?? '(삭제된 학생)',
                    code: l.dahandin_code,
                    studentId: l.student_id
                })));
            }
        } catch (e) {
            setError(e.message || '불러오지 못했어요.');
        } finally {
            setLoading(false);
        }
    }, [classId]);

    useEffect(() => { loadAll(); }, [loadAll]);

    const keyConnected = status?.connected && status?.keyValid;

    // ── 키 연결 ──
    const handleSaveKey = async () => {
        const key = apiKeyInput.trim();
        if (!key) return;
        setSavingKey(true);
        try {
            const next = await saveCredential(key);
            setStatus(next);
            setApiKeyInput('');
            notify('다했니 키를 연결했어요! 🔑');
        } catch (e) {
            window.alert(e.message || '키를 저장하지 못했어요.');
        } finally {
            setSavingKey(false);
        }
    };
    const handleDeleteKey = async () => {
        if (!window.confirm('다했니 연결을 해제할까요? 저장된 키가 지워집니다.')) return;
        try {
            const next = await deleteCredential();
            setStatus(next);
            notify('연결을 해제했어요.');
        } catch (e) {
            window.alert(e.message || '해제하지 못했어요.');
        }
    };

    // ── 붙여넣기 자동 인식 ──
    const applyPaste = (text) => {
        setPasteText(text);
        const { rows } = parseRoster(text);
        const merged = rows.map((r) => {
            const exact = students.find((s) => s.name.trim() === r.name.trim());
            return { name: r.name, code: r.code, studentId: exact?.id ?? '' };
        });
        setMatchRows(merged);
    };
    const parsedErrors = useMemo(() => parseRoster(pasteText).errors, [pasteText]);

    const setRowStudent = (index, studentId) => {
        setMatchRows((prev) => prev.map((row, i) => (i === index ? { ...row, studentId } : row)));
    };
    const matchedCount = matchRows.filter((r) => r.studentId).length;

    const handleSaveLinks = async () => {
        const valid = matchRows.filter((r) => r.studentId && r.code);
        // 한 학생이 두 코드에 겹치면 막는다.
        const seen = new Set();
        for (const r of valid) {
            if (seen.has(r.studentId)) { window.alert('같은 학생이 두 번 매칭됐어요. 하나만 남겨 주세요.'); return; }
            seen.add(r.studentId);
        }
        setSavingLinks(true);
        try {
            await saveLinks(classId, valid.map((r) => ({ student_id: r.studentId, dahandin_code: r.code })));
            const fresh = await getLinks(classId);
            setLinks(fresh);
            notify(`학생 ${valid.length}명을 매칭했어요.`);
        } catch (e) {
            window.alert(e.message || '매칭을 저장하지 못했어요.');
        } finally {
            setSavingLinks(false);
        }
    };

    // ── 설정 저장 ──
    const patchSettings = (patch) => setSettings((prev) => ({ ...prev, ...patch }));
    const handleSaveSettings = async () => {
        setSavingSettings(true);
        try {
            await upsertClassSettings(classId, {
                enabled: !!settings.enabled,
                points_per_cookie: Math.max(0, Number(settings.points_per_cookie) || 0),
                auto_schedule: settings.auto_schedule || 'off',
                schedule_weekday: settings.auto_schedule === 'weekly' ? (settings.schedule_weekday ?? 1) : null,
                schedule_hour: Number(settings.schedule_hour) || 17
            });
            notify('설정을 저장했어요.');
        } catch (e) {
            window.alert(e.message || '설정을 저장하지 못했어요.');
        } finally {
            setSavingSettings(false);
        }
    };

    // ── 지금 동기화 ──
    const handleRunSync = async () => {
        setSyncing(true);
        setLastRun(null);
        try {
            const result = await runSync(classId);
            setLastRun(result);
            notify(`정산 완료 — ${result.ok_count}명 처리, ${result.points_granted}P 지급`);
            const dash = await getDashboard(classId, 30).catch(() => null);
            setDashboard(dash);
            const fresh = await getLinks(classId);
            setLinks(fresh);
        } catch (e) {
            window.alert(e.message || '정산에 실패했어요.');
        } finally {
            setSyncing(false);
        }
    };

    const exportCsv = () => {
        const rows = dashboard?.per_student ?? [];
        const header = '이름,지급포인트,지급횟수\n';
        const body = rows.map((r) => `${r.name},${r.points},${r.grants}`).join('\n');
        const blob = new Blob(['﻿' + header + body], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `다했니포인트_${activeClass?.name ?? 'class'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!classId) {
        return <p style={{ color: '#64748B', fontSize: 'var(--ui-text-md)' }}>먼저 학급을 선택해 주세요.</p>;
    }
    if (loading) {
        return <p style={{ color: '#94A3B8', fontSize: 'var(--ui-text-md)', padding: '40px', textAlign: 'center' }}>불러오는 중입니다…</p>;
    }

    const summary = dashboard?.summary ?? {};

    return (
        <div style={{ maxWidth: '860px' }}>
            {notice}
            {error && <p style={{ color: '#B91C1C', fontSize: 'var(--ui-text-sm)' }}>{error}</p>}

            {/* 탭: 사이드바를 내리지 않고 한 화면에서 연동/대시보드를 오간다 */}
            <div role="tablist" aria-label="다했니 연동" style={{
                display: 'flex', gap: '6px', padding: '5px', marginBottom: '16px',
                background: '#E9EEF6', borderRadius: 'var(--ui-radius-lg)', width: 'fit-content'
            }}>
                {[
                    { id: 'setup', icon: '🔗', label: '연동 설정' },
                    { id: 'dashboard', icon: '📊', label: '정산·대시보드' }
                ].map((t) => {
                    const active = tab === t.id;
                    return (
                        <button
                            key={t.id} type="button" role="tab" aria-selected={active}
                            onClick={() => setTab(t.id)}
                            style={{
                                padding: '9px 16px', borderRadius: 'var(--ui-radius-md)', cursor: 'pointer',
                                border: active ? '1px solid #C7D7FE' : '1px solid transparent',
                                background: active ? 'white' : 'transparent',
                                color: active ? '#315FC4' : '#64748B',
                                boxShadow: active ? '0 3px 10px rgba(37,99,235,.09)' : 'none',
                                fontSize: 'var(--ui-text-md)', fontWeight: 700
                            }}
                        >
                            {t.icon} {t.label}
                        </button>
                    );
                })}
            </div>

            {tab === 'setup' && (<>
            {/* ① 키 연결 */}
            <section style={sectionStyle}>
                <h3 style={titleStyle}><span style={stepBadge}>1</span>다했니 API 키 연결</h3>
                <p style={hintStyle}>
                    다했니 <strong>선생님용 → API 센터</strong>에서 내 API 키를 복사해 넣어 주세요.
                    키는 안전하게 암호화되어 저장되고, 화면에는 끝자리만 보여요. 키 하나로 <strong>내 반</strong>만 정산할 수 있어요.
                </p>
                {keyConnected ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <span style={{
                            padding: '6px 12px', borderRadius: '999px', background: '#DCFCE7',
                            color: '#166534', fontSize: 'var(--ui-text-sm)', fontWeight: 700
                        }}>
                            ✅ 연결됨 ····{status.keyLast4}
                        </span>
                        <Button type="button" variant="ghost" size="sm" onClick={handleDeleteKey}>연결 해제</Button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div style={{ flex: '1 1 320px' }}>
                            <label style={labelStyle} htmlFor="dahandin-key">API 키</label>
                            <input
                                id="dahandin-key" style={inputStyle} type="text" value={apiKeyInput}
                                onChange={(e) => setApiKeyInput(e.target.value)}
                                placeholder="다했니에서 발급받은 API 키"
                            />
                        </div>
                        <Button type="button" onClick={handleSaveKey} loading={savingKey} disabled={!apiKeyInput.trim()}>
                            연결하고 확인
                        </Button>
                    </div>
                )}
            </section>

            {/* ② 학생 매칭 */}
            <section style={{ ...sectionStyle, opacity: keyConnected ? 1 : 0.55, pointerEvents: keyConnected ? 'auto' : 'none' }}>
                <h3 style={titleStyle}><span style={stepBadge}>2</span>학생 매칭 (붙여넣으면 자동 인식)</h3>
                <p style={hintStyle}>
                    다했니 명단에서 <strong>이름과 학생 코드</strong>를 복사해 아래에 붙여넣으세요.
                    탭·쉼표·여러 칸 공백 어떤 형식이든 자동으로 인식하고, 이름이 같은 아지트 학생과 짝지어요.
                </p>
                <textarea
                    style={{ ...inputStyle, minHeight: '96px', fontFamily: 'inherit', resize: 'vertical' }}
                    value={pasteText}
                    onChange={(e) => applyPaste(e.target.value)}
                    placeholder={'김민수\tABC123\n이영희\tDEF456\n박철수\tGHI789'}
                />
                {(matchRows.length > 0 || parsedErrors.length > 0) && (
                    <div style={{ marginTop: '12px' }}>
                        <div style={{ color: '#475569', fontSize: 'var(--ui-text-sm)', marginBottom: '8px' }}>
                            인식됨 <strong>{matchRows.length}</strong>명 · 매칭됨 <strong>{matchedCount}</strong>명
                            {parsedErrors.length > 0 && <span style={{ color: '#B45309' }}> · 인식 못한 줄 {parsedErrors.length}개</span>}
                        </div>
                        <div style={{ maxHeight: '260px', overflow: 'auto', border: '1px solid #E2E8F0', borderRadius: 'var(--ui-radius-md)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--ui-text-sm)' }}>
                                <thead>
                                    <tr style={{ background: '#F1F5F9', textAlign: 'left' }}>
                                        <th style={{ padding: '8px 10px' }}>다했니 이름</th>
                                        <th style={{ padding: '8px 10px' }}>코드</th>
                                        <th style={{ padding: '8px 10px' }}>아지트 학생</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {matchRows.map((row, i) => (
                                        <tr key={`${row.code}-${i}`} style={{ borderTop: '1px solid #E2E8F0' }}>
                                            <td style={{ padding: '6px 10px', color: '#172033' }}>{row.name}</td>
                                            <td style={{ padding: '6px 10px', color: '#64748B' }}>{row.code}</td>
                                            <td style={{ padding: '6px 10px' }}>
                                                <select
                                                    value={row.studentId}
                                                    onChange={(e) => setRowStudent(i, e.target.value)}
                                                    style={{ ...inputStyle, padding: '6px 8px', fontSize: 'var(--ui-text-sm)' }}
                                                >
                                                    <option value="">— 선택 안 함 —</option>
                                                    {students.map((s) => (
                                                        <option key={s.id} value={s.id}>{s.name}</option>
                                                    ))}
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ marginTop: '10px' }}>
                            <Button type="button" onClick={handleSaveLinks} loading={savingLinks} disabled={matchedCount === 0}>
                                매칭 저장 ({matchedCount}명)
                            </Button>
                        </div>
                    </div>
                )}
                {links.length > 0 && matchRows.length === 0 && (
                    <p style={{ color: '#64748B', fontSize: 'var(--ui-text-sm)' }}>현재 {links.length}명이 매칭되어 있어요.</p>
                )}
            </section>

            {/* ③ 정산 설정 + 실행 */}
            <section style={{ ...sectionStyle, opacity: keyConnected ? 1 : 0.55, pointerEvents: keyConnected ? 'auto' : 'none' }}>
                <h3 style={titleStyle}><span style={stepBadge}>3</span>정산 설정 · 실행</h3>
                <p style={hintStyle}>쿠키가 늘어난 만큼만 <strong>다했니 포인트</strong>로 지급돼요(중복 지급 없음).</p>

                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '14px' }}>
                    <div style={{ flex: '1 1 160px' }}>
                        <label style={labelStyle} htmlFor="ppc">쿠키 1개 = 몇 포인트</label>
                        <input
                            id="ppc" type="number" min="0" style={inputStyle}
                            value={settings.points_per_cookie}
                            onChange={(e) => patchSettings({ points_per_cookie: e.target.value })}
                        />
                    </div>
                    <div style={{ flex: '1 1 160px' }}>
                        <label style={labelStyle} htmlFor="autosched">자동 정산 주기</label>
                        <select
                            id="autosched" style={inputStyle} value={settings.auto_schedule}
                            onChange={(e) => patchSettings({ auto_schedule: e.target.value })}
                        >
                            <option value="off">끔 (수동만)</option>
                            <option value="daily">매일</option>
                            <option value="weekly">매주</option>
                        </select>
                    </div>
                    {settings.auto_schedule === 'weekly' && (
                        <div style={{ flex: '1 1 120px' }}>
                            <label style={labelStyle} htmlFor="wd">요일</label>
                            <select
                                id="wd" style={inputStyle} value={settings.schedule_weekday ?? 1}
                                onChange={(e) => patchSettings({ schedule_weekday: Number(e.target.value) })}
                            >
                                {WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}요일</option>)}
                            </select>
                        </div>
                    )}
                    {settings.auto_schedule !== 'off' && (
                        <div style={{ flex: '1 1 120px' }}>
                            <label style={labelStyle} htmlFor="hr">시각 (시)</label>
                            <select
                                id="hr" style={inputStyle} value={settings.schedule_hour}
                                onChange={(e) => patchSettings({ schedule_hour: Number(e.target.value) })}
                            >
                                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}시</option>)}
                            </select>
                        </div>
                    )}
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', cursor: 'pointer' }}>
                    <input
                        type="checkbox" checked={!!settings.enabled}
                        onChange={(e) => patchSettings({ enabled: e.target.checked })}
                    />
                    <span style={{ color: '#172033', fontSize: 'var(--ui-text-md)' }}>이 학급에 다했니 연동 켜기</span>
                </label>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <Button type="button" variant="secondary" onClick={handleSaveSettings} loading={savingSettings}>설정 저장</Button>
                    <Button
                        type="button" onClick={handleRunSync} loading={syncing}
                        disabled={!settings.enabled || links.length === 0}
                        title={links.length === 0 ? '먼저 학생을 매칭해 주세요.' : ''}
                    >
                        🍪 지금 동기화
                    </Button>
                </div>

                {lastRun && (
                    <div style={{ marginTop: '12px', padding: '12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 'var(--ui-radius-md)' }}>
                        <div style={{ color: '#166534', fontSize: 'var(--ui-text-sm)', fontWeight: 700, marginBottom: '6px' }}>
                            처리 {lastRun.ok_count}명 · 실패 {lastRun.fail_count}명 · 지급 {lastRun.points_granted}P
                        </div>
                        {Array.isArray(lastRun.items) && lastRun.items.some((it) => it.status === 'fail') && (
                            <ul style={{ margin: 0, paddingLeft: '18px', color: '#B45309', fontSize: 'var(--ui-text-xs)' }}>
                                {lastRun.items.filter((it) => it.status === 'fail').slice(0, 8).map((it, i) => (
                                    <li key={i}>{it.dahandin_code}: {it.message}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </section>
            </>)}

            {tab === 'dashboard' && (
            /* 📊 정산 실행 결과 · 다했어요 대시보드 */
            <section style={sectionStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <h3 style={{ ...titleStyle, marginBottom: 0 }}>📊 다했어요 대시보드</h3>
                    <Button type="button" variant="ghost" size="sm" onClick={exportCsv} disabled={!(dashboard?.per_student?.length)}>
                        CSV 내려받기
                    </Button>
                </div>
                <p style={hintStyle}>최근 30일 다했니 포인트 지급 현황이에요.</p>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
                    <StatCard label="지급 포인트(30일)" value={`${summary.total_points ?? 0}P`} />
                    <StatCard label="지급 횟수" value={summary.total_grants ?? 0} />
                    <StatCard label="받은 학생" value={`${summary.student_count ?? 0}명`} />
                    <StatCard label="매칭된 학생" value={`${summary.linked_count ?? 0}명`} />
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <div style={labelStyle}>일자별 지급 포인트</div>
                    <DailyBars daily={dashboard?.daily} />
                </div>

                {dashboard?.per_student?.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                        <div style={labelStyle}>학생별 지급 순위</div>
                        <div style={{ maxHeight: '220px', overflow: 'auto' }}>
                            {dashboard.per_student.map((r, i) => {
                                const max = dashboard.per_student[0].points || 1;
                                return (
                                    <div key={r.student_id ?? i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                        <span style={{ width: '84px', color: '#172033', fontSize: 'var(--ui-text-sm)', flexShrink: 0 }}>{r.name}</span>
                                        <div style={{ flex: 1, background: '#EEF2FF', borderRadius: '6px', overflow: 'hidden', height: '14px' }}>
                                            <div style={{ width: `${Math.round((r.points / max) * 100)}%`, height: '100%', background: '#6366F1' }} />
                                        </div>
                                        <span style={{ width: '64px', textAlign: 'right', color: '#475569', fontSize: 'var(--ui-text-sm)' }}>{r.points}P</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {dashboard?.recent_runs?.length > 0 && (
                    <div>
                        <div style={labelStyle}>최근 정산</div>
                        <div style={{ maxHeight: '180px', overflow: 'auto', fontSize: 'var(--ui-text-xs)', color: '#64748B' }}>
                            {dashboard.recent_runs.map((run) => (
                                <div key={run.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '4px 0', borderBottom: '1px solid #F1F5F9' }}>
                                    <span>{new Date(run.started_at).toLocaleString('ko-KR')} · {run.trigger === 'auto' ? '자동' : '수동'}</span>
                                    <span>{run.total_points_granted}P · {run.ok_count}명{run.fail_count ? ` · 실패 ${run.fail_count}` : ''}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </section>
            )}
        </div>
    );
}
