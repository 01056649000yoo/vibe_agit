import React, { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import SelectableTeacherTable from './SelectableTeacherTable';
import useRowSelection from '../../hooks/useRowSelection';
import {
    PanelHeader, SectionCard,
    formatDate, formatRelativeTime
} from './adminUsageUi';

/**
 * 장기 미접속·휴면계정 선생님 패널.
 * 90~364일과 365일 이상을 논리적으로 나눠 보되 데이터는 옮기거나 삭제하지 않는다.
 * 이 목록은 삭제 근거가 아니므로 "승인 취소(비활성화)"까지만 제공한다.
 */
const AdminDormantPanel = ({
    longInactiveTeachers,
    dormantAccounts,
    dormantDays,
    dormantAccountDays,
    loading,
    onRefresh
}) => {
    const [groupId, setGroupId] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [working, setWorking] = useState(false);

    const rows = useMemo(() => {
        const sourceRows = groupId === 'LONG_INACTIVE'
            ? longInactiveTeachers
            : groupId === 'DORMANT'
                ? dormantAccounts
                : [...longInactiveTeachers, ...dormantAccounts];
        const keyword = searchTerm.trim().toLowerCase();
        const filtered = keyword
            ? sourceRows.filter(row =>
                `${row.display_name} ${row.school_name} ${row.email}`.toLowerCase().includes(keyword))
            : sourceRows;
        return [...filtered].sort((a, b) => (b.days_since_login || 0) - (a.days_since_login || 0));
    }, [longInactiveTeachers, dormantAccounts, groupId, searchTerm]);

    const availableIds = useMemo(() => rows.map(row => row.teacher_id), [rows]);
    const { selectedIds, toggle, toggleAll, clear } = useRowSelection(availableIds);

    const handleBulkApproval = async (isApproved) => {
        if (!selectedIds.length) return;

        const actionLabel = isApproved ? '승인 복구' : '승인 취소(비활성화)';
        if (!confirm(`선택한 ${selectedIds.length}명의 선생님을 ${actionLabel} 하시겠습니까?\n\n학급과 학생 데이터는 그대로 남습니다.`)) return;

        setWorking(true);
        try {
            const { data, error } = await supabase.rpc('admin_bulk_set_teacher_approval', {
                p_teacher_ids: selectedIds,
                p_is_approved: isApproved
            });
            if (error) throw error;

            alert(`✅ ${actionLabel} 완료: ${data?.updated_count ?? 0}명`);
            clear();
            await onRefresh({ showLoading: false });
        } catch (err) {
            alert('처리 실패: ' + err.message);
        } finally {
            setWorking(false);
        }
    };

    const columns = [
        {
            key: 'inactivity_status',
            label: '미접속 분류',
            render: (row) => (Number(row.days_since_login) >= dormantAccountDays
                ? <span style={{ color: '#4A5568', fontWeight: 800, background: '#EDF2F7', borderRadius: '999px', padding: '4px 9px' }}>휴면계정</span>
                : <span style={{ color: '#B7791F', fontWeight: 800, background: '#FFFAF0', borderRadius: '999px', padding: '4px 9px' }}>장기 미접속</span>)
        },
        {
            key: 'last_login',
            label: '마지막 접속',
            render: (row) => (
                <>
                    <div style={{ fontWeight: 700, color: '#B7791F' }}>{formatRelativeTime(row.last_login_at)}</div>
                    <div style={{ fontSize: '0.72rem', color: '#A0AEC0' }}>
                        {row.last_login_at ? `${row.days_since_login}일째 미접속` : `가입 후 ${row.days_since_signup}일`}
                    </div>
                </>
            )
        },
        { key: 'classes', label: '학급', render: (row) => `${row.class_count}개` },
        { key: 'students', label: '학생', render: (row) => `${row.student_count}명` },
        { key: 'posts', label: '학생 글', render: (row) => `${row.post_count}개` },
        {
            key: 'last_activity',
            label: '마지막 학생 활동',
            render: (row) => formatRelativeTime(row.last_student_activity_at)
        },
        { key: 'created', label: '가입일', render: (row) => formatDate(row.created_at) },
        {
            key: 'approved',
            label: '상태',
            render: (row) => (row.is_approved
                ? <span style={{ color: '#38A169', fontWeight: 700 }}>승인됨</span>
                : <span style={{ color: '#A0AEC0' }}>비활성</span>)
        }
    ];

    return (
        <SectionCard>
            <PanelHeader
                title="😴 장기 미접속·휴면계정"
                description={`${dormantDays}~${dormantAccountDays - 1}일은 장기 미접속, ${dormantAccountDays}일(1년) 이상은 휴면계정으로 표시합니다. 분류만으로 데이터가 이동·삭제되지는 않으며 다시 로그인하면 자동 해제됩니다.`}
                right={(
                    <input
                        type="text"
                        placeholder="🔍 이름·학교·이메일 검색"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        disabled={working}
                        style={{
                            padding: '8px 14px', borderRadius: '20px', border: '1px solid #CBD5E0',
                            width: '240px', fontSize: '0.85rem', outline: 'none'
                        }}
                    />
                )}
            />

            <div style={{
                display: 'flex', gap: '8px', padding: '14px 20px',
                borderBottom: '1px solid #EDF2F7', flexWrap: 'wrap'
            }}>
                {[
                    { id: 'ALL', label: '전체', count: longInactiveTeachers.length + dormantAccounts.length },
                    { id: 'LONG_INACTIVE', label: `장기 미접속 ${dormantDays}~${dormantAccountDays - 1}일`, count: longInactiveTeachers.length },
                    { id: 'DORMANT', label: '휴면계정 1년 이상', count: dormantAccounts.length }
                ].map(group => {
                    const isActive = groupId === group.id;
                    return (
                        <button
                            key={group.id}
                            type="button"
                            onClick={() => setGroupId(group.id)}
                            style={{
                                padding: '7px 14px', borderRadius: '20px', cursor: 'pointer',
                                fontSize: '0.83rem', fontWeight: isActive ? 800 : 600,
                                border: `1px solid ${isActive ? '#B7791F' : '#E2E8F0'}`,
                                background: isActive ? '#FFFAF0' : 'white',
                                color: isActive ? '#975A16' : '#4A5568'
                            }}
                        >
                            {group.label} {group.count}
                        </button>
                    );
                })}
            </div>

            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
                flexWrap: 'wrap', padding: '14px 20px', borderBottom: '1px solid #EDF2F7', background: '#FFFDF7'
            }}>
                <div style={{ fontSize: '0.88rem', color: '#4A5568' }}>
                    대상 <strong style={{ color: '#D69E2E' }}>{rows.length}명</strong>
                    {selectedIds.length > 0 && (
                        <span style={{ marginLeft: '10px', color: '#2B6CB0' }}>· 선택 {selectedIds.length}명</span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button
                        size="sm"
                        onClick={() => handleBulkApproval(false)}
                        disabled={!selectedIds.length || working}
                        style={{
                            background: 'white', color: '#DD6B20', border: '1px solid #FBD38D',
                            boxShadow: 'none', padding: '8px 14px', fontSize: '0.85rem'
                        }}
                    >
                        선택 승인 취소
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => handleBulkApproval(true)}
                        disabled={!selectedIds.length || working}
                        style={{
                            background: 'white', color: '#38A169', border: '1px solid #9AE6B4',
                            boxShadow: 'none', padding: '8px 14px', fontSize: '0.85rem'
                        }}
                    >
                        선택 승인 복구
                    </Button>
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
                    emptyMessage={groupId === 'DORMANT'
                        ? '1년 이상 미접속한 휴면계정이 없습니다.'
                        : '조건에 맞는 장기 미접속 계정이 없습니다. 🎉'}
                />
            )}
        </SectionCard>
    );
};

export default AdminDormantPanel;
