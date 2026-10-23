import { useCallback, useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import SetPreview from './SetPreview.jsx';

const SOURCE_LABELS = { manual: '직접', default: '기본에서', ai: 'AI', copy: '복사' };

/** 내 세트: 저장한 세트를 카드로 보고, 문제 보기·공유 켜기/끄기·삭제(한 번 더 확인)를 한다. */
export default function MySetsTab({ api, reloadKey }) {
    const [state, setState] = useState({ status: 'loading', sets: [], message: '' });
    const [opened, setOpened] = useState(null);
    const [confirmId, setConfirmId] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const [notice, setNotice] = useState('');

    const load = useCallback(async () => {
        try {
            const sets = await api.listMySets();
            setState({ status: 'ready', sets: Array.isArray(sets) ? sets : [], message: '' });
        } catch (error) {
            setState({ status: 'error', sets: [], message: error.message || '내 세트를 불러오지 못했어요' });
        }
    }, [api]);
    // 외부 저장소(DB)와 동기화하는 첫 읽기 — 이 탭이 열릴 때와 가져오기 뒤에만 부른다.
    useEffect(() => { load(); }, [load, reloadKey]);

    const open = async (set) => {
        setNotice('');
        try {
            const full = await api.getSet(set.id);
            setOpened({ ...set, questions: full.questions ?? [] });
        } catch (error) { setNotice(error.message || '문제를 불러오지 못했어요'); }
    };
    const toggleShare = async (set) => {
        setBusyId(set.id); setNotice('');
        try {
            await api.setVisibility(set.id, set.visibility === 'shared' ? 'private' : 'shared');
            await load();
        } catch (error) { setNotice(error.message || '공유 설정을 바꾸지 못했어요'); } finally { setBusyId(null); }
    };
    const remove = async (set) => {
        setBusyId(set.id); setNotice('');
        try {
            await api.deleteSet(set.id);
            setConfirmId(null);
            if (opened?.id === set.id) setOpened(null);
            await load();
        } catch (error) { setNotice(error.message || '지우지 못했어요'); } finally { setBusyId(null); }
    };

    if (state.status === 'loading') return <p role="status" style={{ color: 'var(--ui-ink-muted)' }}>내 세트를 불러오는 중이에요…</p>;
    if (state.status === 'error') return <p role="alert" style={{ color: 'var(--ui-danger)' }}>{state.message}</p>;
    if (state.sets.length === 0) return <p style={{ color: 'var(--ui-ink-muted)' }}>아직 저장한 세트가 없어요. `기본 세트`에서 가져오거나 `새로 만들기`로 시작해 보세요.</p>;

    return (
        <div style={{ display: 'grid', gap: 'var(--ui-space-3)' }}>
            {notice && <p role="alert" style={{ margin: 0, color: 'var(--ui-danger)', fontSize: 'var(--ui-text-sm)' }}>{notice}</p>}
            {opened && <SetPreview set={opened} onClose={() => setOpened(null)} />}
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--ui-space-3)' }}>
                {state.sets.map((set) => (
                    <li key={set.id} style={{ display: 'grid', gap: 'var(--ui-space-2)', padding: 'var(--ui-space-3)', border: '1px solid var(--ui-border)', borderRadius: 'var(--ui-radius-md)', background: 'var(--ui-surface)' }}>
                        <strong style={{ color: 'var(--ui-ink-strong)' }}>{set.title}</strong>
                        <span style={{ color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)' }}>
                            {set.question_count}문제 · {SOURCE_LABELS[set.source] ?? set.source}{set.grade ? ` · ${set.grade}학년` : ''}{set.unit ? ` · ${set.unit}` : ''}
                        </span>
                        <span style={{ fontSize: 'var(--ui-text-sm)', color: set.visibility === 'shared' ? 'var(--ui-success)' : 'var(--ui-ink-muted)', fontWeight: 800 }}>
                            {set.visibility === 'shared' ? '🌐 공유방에 올림' : '🔒 나만 보기'}
                        </span>
                        {confirmId === set.id ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ui-space-2)', alignItems: 'center' }}>
                                <span style={{ fontSize: 'var(--ui-text-sm)', color: 'var(--ui-danger)', fontWeight: 800 }}>정말 지울까요?</span>
                                <Button type="button" variant="danger" size="sm" loading={busyId === set.id} onClick={() => remove(set)}>지우기</Button>
                                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmId(null)}>취소</Button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ui-space-2)' }}>
                                <Button type="button" variant="outline" size="sm" onClick={() => open(set)}>문제 보기</Button>
                                <Button type="button" variant="outline" size="sm" loading={busyId === set.id} onClick={() => toggleShare(set)}>{set.visibility === 'shared' ? '공유 끄기' : '공유방에 올리기'}</Button>
                                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmId(set.id)}>삭제</Button>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
