import { useEffect, useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import SetPreview from './SetPreview.jsx';
import { importArgsOf } from './quizArenaApi.js';

const GROUPS = [
    { id: 'vocab-3', label: '어휘 3학년', match: (set) => set.kind === 'vocab' && set.grade === 3 },
    { id: 'vocab-4', label: '어휘 4학년', match: (set) => set.kind === 'vocab' && set.grade === 4 },
    { id: 'vocab-5', label: '어휘 5학년', match: (set) => set.kind === 'vocab' && set.grade === 5 },
    { id: 'vocab-6', label: '어휘 6학년', match: (set) => set.kind === 'vocab' && set.grade === 6 },
    { id: 'spelling-low', label: '맞춤법 하(쉬움)', match: (set) => set.id.startsWith('official-spelling-low-') },
    { id: 'spelling-mid', label: '맞춤법 중(보통)', match: (set) => set.id.startsWith('official-spelling-mid-') },
    { id: 'spelling-high', label: '맞춤법 상(어려움)', match: (set) => set.id.startsWith('official-spelling-high-') }
];

const chip = (active) => ({
    padding: 'var(--ui-space-2) var(--ui-space-3)', borderRadius: 'var(--ui-radius-sm)', cursor: 'pointer', fontSize: 'var(--ui-text-sm)', fontWeight: 800,
    border: `1px solid ${active ? 'var(--ui-primary)' : 'var(--ui-border-strong)'}`, background: active ? 'var(--ui-primary-soft)' : 'var(--ui-surface)', color: active ? 'var(--ui-primary)' : 'var(--ui-ink)'
});

/** 기본(공식) 세트: 관리자가 만든 고정 세트. 모든 교사가 볼 수 있고, 고치려면 `내 세트로 가져오기` 로 복사한다. */
export default function OfficialSetsTab({ api, onImported }) {
    const [state, setState] = useState({ status: 'loading', sets: [], message: '' });
    const [groupId, setGroupId] = useState(GROUPS.at(0).id);
    const [openId, setOpenId] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const [notice, setNotice] = useState('');

    useEffect(() => {
        let alive = true;
        api.loadOfficialSets()
            .then((sets) => { if (alive) setState({ status: 'ready', sets, message: '' }); })
            .catch((error) => { if (alive) setState({ status: 'error', sets: [], message: error.message }); });
        return () => { alive = false; };
    }, [api]);

    const group = GROUPS.find((item) => item.id === groupId);
    const visible = useMemo(() => state.sets.filter(group.match), [state.sets, group]);
    const opened = state.sets.find((set) => set.id === openId);

    const importSet = async (set) => {
        setBusyId(set.id); setNotice('');
        try {
            await api.saveSet(importArgsOf(set));
            setNotice(`‘${set.title}’을(를) 내 세트로 가져왔어요.`);
            onImported?.();
        } catch (error) {
            setNotice(error.message || '가져오지 못했어요');
        } finally { setBusyId(null); }
    };

    if (state.status === 'loading') return <p role="status" style={{ color: 'var(--ui-ink-muted)' }}>기본 세트를 불러오는 중이에요…</p>;
    if (state.status === 'error') return <p role="alert" style={{ color: 'var(--ui-danger)' }}>{state.message}</p>;

    return (
        <div style={{ display: 'grid', gap: 'var(--ui-space-3)' }}>
            <p style={{ margin: 0, color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)' }}>
                관리자가 정성껏 만든 세트예요(총 {state.sets.length}세트). 마음에 들면 `내 세트로 가져오기`로 복사해서 고쳐 쓸 수 있어요.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ui-space-2)' }} role="tablist" aria-label="기본 세트 종류">
                {GROUPS.map((item) => (
                    <button key={item.id} type="button" role="tab" aria-selected={item.id === groupId} onClick={() => { setGroupId(item.id); setOpenId(null); }} style={chip(item.id === groupId)}>{item.label}</button>
                ))}
            </div>
            {notice && <p role="status" style={{ margin: 0, color: 'var(--ui-success)', fontSize: 'var(--ui-text-sm)' }}>{notice}</p>}
            {opened && <SetPreview set={opened} onClose={() => setOpenId(null)} />}
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--ui-space-3)' }}>
                {visible.map((set) => (
                    <li key={set.id} style={{ display: 'grid', gap: 'var(--ui-space-2)', padding: 'var(--ui-space-3)', border: `1px solid ${set.id === openId ? 'var(--ui-primary)' : 'var(--ui-border)'}`, borderRadius: 'var(--ui-radius-md)', background: 'var(--ui-surface)' }}>
                        <strong style={{ color: 'var(--ui-ink-strong)' }}>{set.title}</strong>
                        <span style={{ color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)' }}>{set.questions.length}문제 · {set.kind === 'vocab' ? '4지선다' : 'O/X'}</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ui-space-2)' }}>
                            <Button type="button" variant="outline" size="sm" onClick={() => setOpenId(set.id === openId ? null : set.id)}>{set.id === openId ? '접기' : '문제 보기'}</Button>
                            <Button type="button" size="sm" loading={busyId === set.id} onClick={() => importSet(set)}>내 세트로 가져오기</Button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
