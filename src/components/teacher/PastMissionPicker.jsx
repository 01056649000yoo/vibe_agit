import React, { useState } from 'react';
import CenteredDialog from '../common/CenteredDialog';
import Button from '../common/Button';
import useMyPastMissions from '../../hooks/useMyPastMissions';
import { getGenreMissionType } from '../../modules/writing/mission-types/registry';
import { isReusablePastMission, pastMissionKind } from '../../modules/writing/mission-form/pastMission';

const formatDate = (value) => (value
    ? new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date(value))
    : '');

const kindLabel = (mission) => {
    const kind = pastMissionKind(mission);
    if (kind === 'freeform') return `📝 ${mission.genre || '기본 글쓰기'}`;
    const type = getGenreMissionType(kind);
    return `${type?.icon || '🧩'} ${type?.label || mission.genre || kind}`;
};

/**
 * `📂 내가 낸 과제 다시 내기` 창 — 고르면 폼만 채운다(저장해야 새 과제가 생긴다).
 * 다른 학급·보관한 과제도 나온다. 🗑️로 완전히 지운 과제는 남아 있지 않다.
 */
const PastMissionPicker = ({ isOpen, onClose, onPick, activeClassId }) => {
    const [search, setSearch] = useState('');
    const past = useMyPastMissions({ enabled: isOpen, search });
    const rows = past.items.filter(isReusablePastMission);

    return (
        <CenteredDialog
            isOpen={isOpen}
            onClose={onClose}
            title="📂 내가 낸 과제 다시 내기"
            description="고르면 과제 만들기 칸이 그 내용으로 채워집니다. 고친 뒤 저장해야 지금 학급에 새 과제로 올라가요. 학생 글·포인트·공개 날짜는 따라오지 않습니다."
            maxWidth="760px"
            closeLabel="내가 낸 과제 창 닫기"
        >
            <div style={{ display: 'grid', gap: 'var(--ui-space-3)' }}>
                <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="🔍 제목이나 안내 글로 찾기"
                    aria-label="내가 낸 과제 찾기"
                    style={{
                        padding: '10px 14px', borderRadius: 'var(--ui-radius-md)', border: '1px solid var(--ui-border)',
                        fontSize: 'var(--ui-text-sm)', width: '100%', boxSizing: 'border-box'
                    }}
                />
                {past.error && <p role="alert" style={{ margin: 0, color: '#C53030', fontSize: 'var(--ui-text-sm)' }}>⚠️ {past.error}</p>}
                {past.loading && <p style={{ margin: 0, color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)' }}>불러오는 중…</p>}
                {!past.loading && !past.error && rows.length === 0 && (
                    <p style={{ margin: 0, padding: 'var(--ui-space-6)', textAlign: 'center', color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)' }}>
                        {search.trim() ? '찾는 과제가 없어요.' : '아직 낸 과제가 없어요.'}
                    </p>
                )}
                {!past.loading && rows.length > 0 && (
                    <ul aria-label="내가 낸 과제" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--ui-space-2)' }}>
                        {rows.map((mission) => {
                            const className = mission.classes?.name
                                ? (mission.class_id === activeClassId ? `${mission.classes.name}(지금 학급)` : mission.classes.name)
                                : '지운 학급';
                            return (
                                <li key={mission.id}>
                                    <button
                                        type="button"
                                        onClick={() => onPick(mission)}
                                        style={{
                                            width: '100%', textAlign: 'left', cursor: 'pointer', display: 'grid', gap: '4px',
                                            padding: '12px 14px', borderRadius: 'var(--ui-radius-md)',
                                            border: '1px solid var(--ui-border)', background: 'var(--ui-surface)'
                                        }}
                                    >
                                        <span style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                                            <strong style={{ color: 'var(--ui-ink-strong)', fontSize: 'var(--ui-text-md)', overflowWrap: 'anywhere' }}>{mission.title}</strong>
                                            {mission.is_archived && <span style={{ color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-xs)' }}>보관함</span>}
                                        </span>
                                        <span style={{ color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-xs)' }}>
                                            {kindLabel(mission)} · {className} · {formatDate(mission.created_at)}
                                        </span>
                                        {mission.guide && (
                                            <span style={{
                                                color: 'var(--ui-ink)', fontSize: 'var(--ui-text-sm)', overflow: 'hidden',
                                                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
                                            }}>{mission.guide}</span>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
                {past.pageCount > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--ui-space-3)' }}>
                        <Button size="sm" variant="secondary" disabled={past.page <= 1 || past.loading} onClick={() => past.setPage(past.page - 1)}>‹ 이전</Button>
                        <span style={{ color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)' }}>{past.page} / {past.pageCount}</span>
                        <Button size="sm" variant="secondary" disabled={past.page >= past.pageCount || past.loading} onClick={() => past.setPage(past.page + 1)}>다음 ›</Button>
                    </div>
                )}
            </div>
        </CenteredDialog>
    );
};

export default PastMissionPicker;
