import React, { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import SelectableTeacherTable from './SelectableTeacherTable';
import useRowSelection from '../../hooks/useRowSelection';
import { USAGE_STATUS } from '../../hooks/useAdminUsage';
import { PanelHeader, SectionCard, formatDate, formatRelativeTime } from './adminUsageUi';

const GRACE_DAY_OPTIONS = [0, 7, 14, 30, 90];

const GROUPS = [
    {
        id: USAGE_STATUS.NEVER_STARTED,
        label: '학급 미개설',
        description: '가입만 하고 학급을 한 번도 만들지 않은 계정입니다. 지울 데이터가 없어 계정만 정리하면 됩니다.',
        deletable: true
    },
    {
        id: USAGE_STATUS.NO_STUDENT,
        label: '학생 미등록',
        description: '학급은 만들었지만 학생을 한 명도 등록하지 않은 계정입니다. 빈 학급은 함께 정리되고, 학생 글은 애초에 존재하지 않습니다.',
        deletable: true
    }
];

/**
 * 유령 계정 정리 패널.
 *
 * 삭제는 되돌릴 수 없으므로 두 단계로 좁힌다.
 *  1) 학생 0명이면서 학생 글도 0건인 계정만 삭제 대상으로 본다
 *     (서버 admin_bulk_force_teacher_withdrawal 이 p_only_empty 로 한 번 더 막는다)
 *  2) 가입 직후 계정을 실수로 지우지 않도록 "가입 후 N일 지난 계정"만 보여준다
 *
 * 삭제는 빈 학급 → 프로필 → 로그인 계정(auth.users)까지 지우는 완전 탈퇴다.
 * 로그인 계정을 남기면 재로그인 시 프로필이 다시 만들어져 되살아나므로 함께 지운다.
 */
const AdminCleanupPanel = ({ cleanupCandidates, loading, onRefresh }) => {
    const [groupId, setGroupId] = useState(USAGE_STATUS.NEVER_STARTED);
    const [graceDays, setGraceDays] = useState(14);
    const [working, setWorking] = useState(false);
    const [lastResult, setLastResult] = useState(null);

    const activeGroup = GROUPS.find(group => group.id === groupId) || GROUPS[0];

    const rows = useMemo(() => {
        return cleanupCandidates
            .filter(row => row.usage_status === groupId)
            .filter(row => (row.days_since_signup || 0) >= graceDays)
            .sort((a, b) => (b.days_since_signup || 0) - (a.days_since_signup || 0));
    }, [cleanupCandidates, groupId, graceDays]);

    const groupCounts = useMemo(() => {
        const counts = new Map();
        cleanupCandidates.forEach(row => {
            counts.set(row.usage_status, (counts.get(row.usage_status) || 0) + 1);
        });
        return counts;
    }, [cleanupCandidates]);

    const availableIds = useMemo(() => rows.map(row => row.teacher_id), [rows]);
    const { selectedIds, toggle, toggleAll, clear } = useRowSelection(availableIds);

    const selectedNames = useMemo(
        () => rows.filter(row => selectedIds.includes(row.teacher_id)).map(row => row.display_name),
        [rows, selectedIds]
    );

    const handleRevoke = async () => {
        if (!selectedIds.length) return;
        if (!confirm(`선택한 ${selectedIds.length}명의 승인을 취소하시겠습니까?\n\n계정은 남고 로그인 후 사용만 막힙니다. 언제든 다시 승인할 수 있습니다.`)) return;

        setWorking(true);
        setLastResult(null);
        try {
            const { data, error } = await supabase.rpc('admin_bulk_set_teacher_approval', {
                p_teacher_ids: selectedIds,
                p_is_approved: false
            });
            if (error) throw error;

            setLastResult({ type: 'revoke', updated: data?.updated_count ?? 0 });
            clear();
            await onRefresh({ showLoading: false });
        } catch (err) {
            alert('처리 실패: ' + err.message);
        } finally {
            setWorking(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedIds.length) return;

        const preview = selectedNames.slice(0, 10).join(', ');
        const more = selectedNames.length > 10 ? ` 외 ${selectedNames.length - 10}명` : '';

        if (!confirm(`🚨 선택한 ${selectedIds.length}개 계정을 영구 삭제합니다.\n\n${preview}${more}\n\n빈 학급과 로그인 계정까지 함께 지워집니다(완전 탈퇴).\n되돌릴 수 없습니다. 계속할까요?`)) return;
        if (!confirm(`⚠️ 마지막 확인입니다.\n\n학생이나 학생 글이 하나라도 있는 계정은 서버에서 자동으로 제외됩니다.\n정말 삭제하시겠습니까?`)) return;

        setWorking(true);
        setLastResult(null);
        try {
            const { data, error } = await supabase.rpc('admin_bulk_force_teacher_withdrawal', {
                p_teacher_ids: selectedIds,
                p_only_empty: true
            });
            if (error) throw error;

            setLastResult({
                type: 'delete',
                deleted: data?.deleted_count ?? 0,
                skipped: data?.skipped_count ?? 0,
                removedClasses: data?.removed_classes ?? 0
            });
            clear();
            await onRefresh({ showLoading: false });
        } catch (err) {
            alert('삭제 실패: ' + err.message);
        } finally {
            setWorking(false);
        }
    };

    const columns = [
        {
            key: 'signup',
            label: '가입일',
            render: (row) => (
                <>
                    <div>{formatDate(row.created_at)}</div>
                    <div style={{ fontSize: '0.72rem', color: '#A0AEC0' }}>{row.days_since_signup}일 경과</div>
                </>
            )
        },
        {
            key: 'login',
            label: '최근 접속',
            render: (row) => (row.last_login_at
                ? formatRelativeTime(row.last_login_at)
                : <span style={{ color: '#E53E3E', fontWeight: 700 }}>로그인 기록 없음</span>)
        },
        { key: 'classes', label: '학급', render: (row) => `${row.class_count}개` },
        { key: 'students', label: '학생', render: (row) => `${row.student_count}명` },
        { key: 'missions', label: '미션', render: (row) => `${row.mission_count}개` },
        {
            key: 'approved',
            label: '승인 상태',
            render: (row) => (row.is_approved
                ? <span style={{ color: '#38A169', fontWeight: 700 }}>승인됨</span>
                : <span style={{ color: '#A0AEC0' }}>대기/비활성</span>)
        }
    ];

    return (
        <SectionCard>
            <PanelHeader
                title="🧹 미사용 계정 정리"
                description={activeGroup.description}
                right={(
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#4A5568' }}>
                        가입 후 경과
                        <select
                            value={graceDays}
                            disabled={loading || working}
                            onChange={(e) => setGraceDays(Number(e.target.value))}
                            style={{
                                padding: '6px 10px', borderRadius: '8px', border: '1px solid #CBD5E0',
                                fontSize: '0.85rem', background: 'white', color: '#2D3748'
                            }}
                        >
                            {GRACE_DAY_OPTIONS.map(day => (
                                <option key={day} value={day}>{day === 0 ? '전체' : `${day}일 이상`}</option>
                            ))}
                        </select>
                    </label>
                )}
            />

            <div style={{ display: 'flex', gap: '8px', padding: '14px 20px', borderBottom: '1px solid #EDF2F7', flexWrap: 'wrap' }}>
                {GROUPS.map(group => {
                    const isActive = group.id === groupId;
                    return (
                        <button
                            key={group.id}
                            onClick={() => setGroupId(group.id)}
                            style={{
                                padding: '8px 16px', borderRadius: '20px', cursor: 'pointer',
                                fontSize: '0.85rem', fontWeight: isActive ? 800 : 500,
                                border: `1px solid ${isActive ? '#C53030' : '#E2E8F0'}`,
                                background: isActive ? '#C53030' : 'white',
                                color: isActive ? 'white' : '#4A5568'
                            }}
                        >
                            {group.label} {groupCounts.get(group.id) || 0}
                        </button>
                    );
                })}
            </div>

            {lastResult && (
                <div style={{ padding: '14px 20px', background: '#F0FFF4', color: '#276749', fontSize: '0.88rem', borderBottom: '1px solid #C6F6D5' }}>
                    {lastResult.type === 'revoke'
                        ? `✅ ${lastResult.updated}명의 승인을 취소했습니다. 본인이 정보를 다시 저장해도 되살아나지 않습니다.`
                        : `✅ ${lastResult.deleted}개 계정을 탈퇴 처리했습니다. (빈 학급 ${lastResult.removedClasses}개 함께 정리)${lastResult.skipped ? ` · 학생·글이 있어 제외됨 ${lastResult.skipped}개` : ''}`}
                </div>
            )}

            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
                flexWrap: 'wrap', padding: '14px 20px', borderBottom: '1px solid #EDF2F7', background: '#FFF9F9'
            }}>
                <div style={{ fontSize: '0.88rem', color: '#4A5568' }}>
                    대상 <strong style={{ color: '#C53030' }}>{rows.length}명</strong>
                    {selectedIds.length > 0 && (
                        <span style={{ marginLeft: '10px', color: '#2B6CB0' }}>· 선택 {selectedIds.length}명</span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button
                        size="sm"
                        onClick={handleRevoke}
                        disabled={!selectedIds.length || working}
                        style={{
                            background: 'white', color: '#DD6B20', border: '1px solid #FBD38D',
                            boxShadow: 'none', padding: '8px 14px', fontSize: '0.85rem'
                        }}
                    >
                        선택 승인 취소
                    </Button>
                    {activeGroup.deletable && (
                        <Button
                            size="sm"
                            onClick={handleDelete}
                            disabled={!selectedIds.length || working}
                            style={{
                                background: '#C53030', color: 'white', border: 'none',
                                boxShadow: 'none', padding: '8px 14px', fontSize: '0.85rem'
                            }}
                        >
                            선택 계정 영구 삭제
                        </Button>
                    )}
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#A0AEC0' }}>불러오는 중...</div>
            ) : (
                <SelectableTeacherTable
                    rows={rows}
                    columns={columns}
                    selectedIds={selectedIds}
                    onToggle={toggle}
                    onToggleAll={toggleAll}
                    emptyMessage="정리할 계정이 없습니다. 🎉"
                />
            )}
        </SectionCard>
    );
};

export default AdminCleanupPanel;
