import React, { useMemo, useState } from 'react';
import Button from '../common/Button';
import Modal from '../common/Modal';
import AdminStudentActivityPanel from './AdminStudentActivityPanel';
import { ACTIVITY_DAY_OPTIONS, USAGE_STATUS } from '../../hooks/useAdminUsage';
import {
    CountCell, DayRangeSelect, EmptyState, PanelHeader, SectionCard, UsageStatusBadge,
    formatDate, formatRelativeTime, tableStyle, tdLeftStyle, tdStyle, theadRowStyle, thLeftStyle, thStyle
} from './adminUsageUi';

const STATUS_FILTERS = [
    { id: 'ALL', label: '전체' },
    { id: USAGE_STATUS.ACTIVE, label: '활동 중' },
    { id: USAGE_STATUS.IDLE, label: '조용함' },
    { id: USAGE_STATUS.DORMANT, label: '장기 미접속' },
    { id: USAGE_STATUS.NO_STUDENT, label: '학생 미등록' },
    { id: USAGE_STATUS.NEVER_STARTED, label: '학급 미개설' }
];

const SORT_OPTIONS = [
    { id: 'last_login', label: '최근 접속 순' },
    { id: 'recent_posts', label: '최근 글 많은 순' },
    { id: 'students', label: '학생 많은 순' },
    { id: 'signup', label: '최근 가입 순' },
    { id: 'idle', label: '오래 안 온 순' }
];

const sortRows = (rows, sortBy) => {
    const time = (value) => (value ? new Date(value).getTime() : 0);
    const sorted = [...rows];

    switch (sortBy) {
        case 'recent_posts':
            return sorted.sort((a, b) => (b.recent_post_count || 0) - (a.recent_post_count || 0));
        case 'students':
            return sorted.sort((a, b) => (b.student_count || 0) - (a.student_count || 0));
        case 'signup':
            return sorted.sort((a, b) => time(b.created_at) - time(a.created_at));
        case 'idle':
            return sorted.sort((a, b) => (b.days_since_login || 0) - (a.days_since_login || 0));
        default:
            return sorted.sort((a, b) => time(b.last_login_at) - time(a.last_login_at));
    }
};

/**
 * 교사별 사용량 표.
 * "가입은 했는데 실제로 쓰고 있는가"를 한 줄로 판단할 수 있게
 * 학급·학생·미션·글·최근 활동을 한 화면에 놓는다.
 */
const AdminUsagePanel = ({
    teachers, loading, error,
    dormantDays, dormantAccountDays, activityDays, setActivityDays, onRefresh
}) => {
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [sortBy, setSortBy] = useState('last_login');
    const [searchTerm, setSearchTerm] = useState('');
    const [detailTeacher, setDetailTeacher] = useState(null);

    const visibleRows = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        const filtered = teachers.filter(row => {
            if (statusFilter !== 'ALL' && row.usage_status !== statusFilter) return false;
            if (!keyword) return true;
            const text = `${row.display_name} ${row.school_name} ${row.email}`.toLowerCase();
            return text.includes(keyword);
        });
        return sortRows(filtered, sortBy);
    }, [teachers, statusFilter, sortBy, searchTerm]);

    const statusCounts = useMemo(() => {
        const counts = new Map();
        teachers.forEach(row => {
            counts.set(row.usage_status, (counts.get(row.usage_status) || 0) + 1);
        });
        return counts;
    }, [teachers]);

    return (
        <>
            <SectionCard>
                <PanelHeader
                    title="📊 선생님별 사용량"
                    description={`학급 개설·학생 등록·미션·학생 글까지 한 줄로 봅니다. 활동 여부는 최근 ${activityDays}일, 장기 미접속은 ${dormantDays}일, 휴면계정은 ${dormantAccountDays}일 기준입니다.`}
                    right={(
                        <>
                            <DayRangeSelect
                                label="활동 기준"
                                value={activityDays}
                                options={ACTIVITY_DAY_OPTIONS}
                                onChange={setActivityDays}
                                disabled={loading}
                            />
                            <Button
                                size="sm"
                                onClick={() => onRefresh()}
                                disabled={loading}
                                style={{ background: '#EDF2F7', color: '#2D3748', boxShadow: 'none', padding: '8px 14px', fontSize: '0.85rem' }}
                            >
                                🔄 새로고침
                            </Button>
                        </>
                    )}
                />

                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    gap: '12px', flexWrap: 'wrap', padding: '16px 20px', borderBottom: '1px solid #EDF2F7'
                }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {STATUS_FILTERS.map(filter => {
                            const isActive = statusFilter === filter.id;
                            const count = filter.id === 'ALL' ? teachers.length : (statusCounts.get(filter.id) || 0);
                            return (
                                <button
                                    key={filter.id}
                                    onClick={() => setStatusFilter(filter.id)}
                                    style={{
                                        padding: '7px 14px', borderRadius: '20px', cursor: 'pointer',
                                        fontSize: '0.83rem', fontWeight: isActive ? 800 : 500,
                                        border: `1px solid ${isActive ? '#2B6CB0' : '#E2E8F0'}`,
                                        background: isActive ? '#2B6CB0' : 'white',
                                        color: isActive ? 'white' : '#4A5568'
                                    }}
                                >
                                    {filter.label} {count}
                                </button>
                            );
                        })}
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            style={{
                                padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E0',
                                fontSize: '0.85rem', background: 'white', color: '#2D3748'
                            }}
                        >
                            {SORT_OPTIONS.map(option => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                            ))}
                        </select>
                        <input
                            type="text"
                            placeholder="🔍 이름·학교·이메일 검색"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                padding: '8px 14px', borderRadius: '20px', border: '1px solid #CBD5E0',
                                width: '240px', fontSize: '0.85rem', outline: 'none'
                            }}
                        />
                    </div>
                </div>

                {error && (
                    <div style={{ padding: '16px 20px', color: '#C53030', background: '#FFF5F5', fontSize: '0.88rem' }}>
                        ⚠️ {error}
                    </div>
                )}

                {loading ? (
                    <EmptyState>사용량을 집계하는 중...</EmptyState>
                ) : visibleRows.length === 0 ? (
                    <EmptyState>조건에 맞는 선생님이 없습니다.</EmptyState>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={theadRowStyle}>
                                    <th style={thLeftStyle}>선생님</th>
                                    <th style={thStyle}>상태</th>
                                    <th style={thStyle}>최근 접속</th>
                                    <th style={thStyle}>학급</th>
                                    <th style={thStyle}>학생</th>
                                    <th style={thStyle}>미션</th>
                                    <th style={thStyle}>학생 글(제출)</th>
                                    <th style={thStyle}>최근 {activityDays}일 글</th>
                                    <th style={thStyle}>글쓰기 학생</th>
                                    <th style={thStyle}>마지막 학생 활동</th>
                                    <th style={thStyle}>가입일</th>
                                    <th style={thStyle}>상세</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map(row => (
                                    <tr key={row.teacher_id} style={{ borderBottom: '1px solid #F1F3F5' }}>
                                        <td style={tdLeftStyle}>
                                            <div
                                                lang="ko"
                                                translate="no"
                                                className="notranslate"
                                                style={{ fontWeight: 'bold', color: '#2C3E50' }}
                                            >
                                                {row.display_name}
                                                {!row.is_approved && (
                                                    <span style={{
                                                        marginLeft: '6px', fontSize: '0.7rem', color: '#DD6B20',
                                                        background: '#FFFAF0', border: '1px solid #FBD38D',
                                                        borderRadius: '4px', padding: '1px 6px'
                                                    }}>
                                                        승인 대기
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: '#A0AEC0', marginTop: '3px' }}>
                                                {row.school_name || '학교 정보 없음'} · {row.email}
                                            </div>
                                        </td>
                                        <td style={tdStyle}><UsageStatusBadge status={row.usage_status} /></td>
                                        <td style={tdStyle}>
                                            {formatRelativeTime(row.last_login_at)}
                                            {row.last_login_at && (
                                                <div style={{ fontSize: '0.72rem', color: '#CBD5E0' }}>
                                                    {row.days_since_login}일째
                                                </div>
                                            )}
                                        </td>
                                        <CountCell value={row.class_count} highlightZero />
                                        <CountCell value={row.student_count} highlightZero />
                                        <CountCell value={row.mission_count} />
                                        <td style={{ ...tdStyle, fontWeight: 700, color: row.post_count ? '#2C5282' : '#CBD5E0' }}>
                                            {row.post_count || 0}
                                            <span style={{ color: '#A0AEC0', fontWeight: 500 }}>
                                                {' '}({row.submitted_post_count || 0})
                                            </span>
                                        </td>
                                        <CountCell value={row.recent_post_count} />
                                        <CountCell value={row.active_student_count} />
                                        <td style={tdStyle}>{formatRelativeTime(row.last_student_activity_at)}</td>
                                        <td style={tdStyle}>{formatDate(row.created_at)}</td>
                                        <td style={tdStyle}>
                                            <Button
                                                size="sm"
                                                onClick={() => setDetailTeacher(row)}
                                                disabled={!row.student_count}
                                                style={{
                                                    background: 'white', color: '#2B6CB0', border: '1px solid #BEE3F8',
                                                    boxShadow: 'none', padding: '6px 12px', fontSize: '0.8rem'
                                                }}
                                            >
                                                학생 활동
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>

            <Modal
                isOpen={!!detailTeacher}
                onClose={() => setDetailTeacher(null)}
                title={detailTeacher ? `${detailTeacher.display_name} 선생님 학급 활동` : ''}
                maxWidth="1100px"
            >
                {detailTeacher && (
                    <AdminStudentActivityPanel
                        teacherId={detailTeacher.teacher_id}
                        teacherLabel={detailTeacher.display_name}
                        defaultActivityDays={activityDays}
                    />
                )}
            </Modal>
        </>
    );
};

export default AdminUsagePanel;
