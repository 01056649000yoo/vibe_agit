import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import {
    CountCell,
    EmptyState,
    PanelHeader,
    SectionCard,
    tableStyle,
    tdLeftStyle,
    tdStyle,
    theadRowStyle,
    thLeftStyle,
    thStyle
} from './adminUsageUi';

const EMPTY_STATS = {
    teacher_count: 0,
    class_count: 0,
    room_count: 0,
    active_room_count: 0,
    student_session_count: 0,
    completed_session_count: 0
};

const LabStatStrip = ({ stats }) => {
    const items = [
        { label: '연구소 교사', value: `${stats.teacher_count ?? 0}명` },
        { label: '학급', value: `${stats.class_count ?? 0}개` },
        { label: '활동 방', value: `${stats.room_count ?? 0}개` },
        { label: '활성 방', value: `${stats.active_room_count ?? 0}개` },
        { label: '학생 세션', value: `${stats.student_session_count ?? 0}개` },
        { label: '완료 결과', value: `${stats.completed_session_count ?? 0}개` }
    ];

    return (
        <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
            gap: '1px', background: '#EDF2F7', borderBottom: '1px solid #EDF2F7'
        }}>
            {items.map(item => (
                <div key={item.label} style={{ background: 'white', padding: '16px 18px' }}>
                    <div style={{ fontSize: '0.78rem', color: '#718096', fontWeight: 700, marginBottom: '6px' }}>
                        {item.label}
                    </div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#2C5282' }}>{item.value}</div>
                </div>
            ))}
        </div>
    );
};

const StatusBadge = ({ active, approved }) => {
    const status = !active
        ? { label: '연동 중지', color: '#9B2C2C', background: '#FFF5F5', border: '#FEB2B2' }
        : !approved
            ? { label: '아지트 승인 필요', color: '#975A16', background: '#FFFAF0', border: '#FBD38D' }
            : { label: 'AI 연동 가능', color: '#276749', background: '#F0FFF4', border: '#9AE6B4' };

    return (
        <span style={{
            display: 'inline-block', padding: '4px 10px', borderRadius: '20px',
            fontSize: '0.75rem', fontWeight: 800,
            color: status.color, background: status.background, border: `1px solid ${status.border}`
        }}>
            {status.label}
        </span>
    );
};

const AdminLabManagementPanel = () => {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [updatingTeacherId, setUpdatingTeacherId] = useState(null);

    const loadSummary = useCallback(async () => {
        setLoading(true);
        setError('');

        const { data, error: requestError } = await supabase.rpc('admin_get_lab_service_summary_v1');
        if (requestError) {
            setError(requestError.message || '연구소 현황을 불러오지 못했습니다.');
            setLoading(false);
            return;
        }

        setSummary(data);
        setLoading(false);
    }, []);

    useEffect(() => {
        let cancelled = false;

        void supabase.rpc('admin_get_lab_service_summary_v1').then(({ data, error: requestError }) => {
            if (cancelled) return;
            if (requestError) {
                setError(requestError.message || '연구소 현황을 불러오지 못했습니다.');
                setLoading(false);
                return;
            }

            setSummary(data);
            setLoading(false);
        });

        return () => {
            cancelled = true;
        };
    }, []);

    const handleToggleAccess = async (teacher) => {
        const nextActive = !teacher.active;
        const actionLabel = nextActive ? '다시 연결' : '연동 중지';
        if (!window.confirm(`${teacher.name} 선생님의 연구소 AI 연동을 ${actionLabel}할까요?\n기존 연구소 자료는 삭제되지 않습니다.`)) {
            return;
        }

        setUpdatingTeacherId(teacher.agit_user_id);
        setError('');

        const { error: requestError } = await supabase.rpc('admin_set_lab_teacher_access_v1', {
            p_agit_user_id: teacher.agit_user_id,
            p_active: nextActive
        });

        if (requestError) {
            setError(requestError.message || '연구소 연동 상태를 변경하지 못했습니다.');
            setUpdatingTeacherId(null);
            return;
        }

        setSummary(current => ({
            ...current,
            linked_teachers: (current?.linked_teachers ?? []).map(row => (
                row.agit_user_id === teacher.agit_user_id
                    ? { ...row, active: nextActive, can_use_ai: nextActive && row.is_approved }
                    : row
            ))
        }));
        setUpdatingTeacherId(null);
    };

    const stats = summary?.stats ?? EMPTY_STATS;
    const linkedTeachers = summary?.linked_teachers ?? [];

    return (
        <SectionCard>
            <PanelHeader
                title="🧪 글쓰기 연구소"
                description="별도 서비스 관리자 화면 대신 아지트 관리자 모드에서 연구소 현황과 AI 연동 상태를 관리합니다. 통합 DB에 보존된 자료 기준이며, 연구소 DB 전환 뒤에는 같은 화면에 운영 자료가 바로 반영됩니다."
                right={(
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={loadSummary}
                        disabled={loading}
                    >
                        🔄 새로고침
                    </Button>
                )}
            />

            {error && (
                <div role="alert" style={{ padding: '14px 20px', color: '#C53030', background: '#FFF5F5', fontSize: '0.88rem' }}>
                    ⚠️ {error}
                </div>
            )}

            {loading ? (
                <EmptyState>연구소 현황을 불러오는 중...</EmptyState>
            ) : (
                <>
                    <LabStatStrip stats={stats} />
                    <div style={{ padding: '18px 20px 10px' }}>
                        <h4 style={{ margin: 0, color: '#2D3748', fontSize: '1rem' }}>연결된 교사</h4>
                        <p style={{ margin: '6px 0 0', color: '#718096', fontSize: '0.84rem', lineHeight: 1.5 }}>
                            연동을 중지하면 해당 교사의 연구소 AI 요청만 차단되며 학급·활동·학생 결과는 그대로 유지됩니다.
                        </p>
                    </div>

                    {linkedTeachers.length === 0 ? (
                        <EmptyState>아지트 계정과 연결된 연구소 교사가 없습니다.</EmptyState>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ ...tableStyle, minWidth: '720px' }}>
                                <thead>
                                    <tr style={theadRowStyle}>
                                        <th style={thLeftStyle}>선생님</th>
                                        <th style={thStyle}>아지트 승인</th>
                                        <th style={thStyle}>연구소 학급</th>
                                        <th style={thStyle}>활동 방</th>
                                        <th style={thStyle}>연동 상태</th>
                                        <th style={thStyle}>관리</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {linkedTeachers.map(teacher => (
                                        <tr key={teacher.agit_user_id} style={{ borderBottom: '1px solid #F1F3F5' }}>
                                            <td style={tdLeftStyle}>
                                                <div style={{ fontWeight: 800, color: '#2D3748' }}>{teacher.name}</div>
                                                <div style={{ marginTop: '3px', color: '#718096', fontSize: '0.8rem' }}>{teacher.email || '-'}</div>
                                            </td>
                                            <td style={tdStyle}>{teacher.is_approved ? '승인됨' : '승인 필요'}</td>
                                            <CountCell value={teacher.class_count} />
                                            <CountCell value={teacher.room_count} />
                                            <td style={tdStyle}>
                                                <StatusBadge active={teacher.active} approved={teacher.is_approved} />
                                            </td>
                                            <td style={tdStyle}>
                                                <Button
                                                    type="button"
                                                    size="xs"
                                                    variant={teacher.active ? 'danger' : 'outline'}
                                                    loading={updatingTeacherId === teacher.agit_user_id}
                                                    loadingText="변경 중..."
                                                    onClick={() => handleToggleAccess(teacher)}
                                                >
                                                    {teacher.active ? '연동 중지' : '다시 연결'}
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </SectionCard>
    );
};

export default AdminLabManagementPanel;
