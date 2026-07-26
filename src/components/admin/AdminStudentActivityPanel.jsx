import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { ACTIVITY_DAY_OPTIONS } from '../../hooks/useAdminUsage';
import {
    CountCell, DayRangeSelect, EmptyState, PanelHeader, SectionCard,
    formatDate, formatRelativeTime, tableStyle, tdLeftStyle, tdStyle, theadRowStyle, thLeftStyle, thStyle
} from './adminUsageUi';

/**
 * 학생 학습 활동 패널.
 * teacherId를 주면 그 선생님 학급 학생만, 없으면 전체에서 활동이 많은 순으로 본다.
 */
const AdminStudentActivityPanel = ({ teacherId = null, teacherLabel = null, defaultActivityDays = 30 }) => {
    const [rows, setRows] = useState([]);
    const [activityDays, setActivityDays] = useState(defaultActivityDays);
    const [searchTerm, setSearchTerm] = useState('');
    const [onlyInactive, setOnlyInactive] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchActivity = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: rpcError } = await supabase.rpc('admin_get_student_activity', {
                p_teacher_id: teacherId,
                p_activity_days: activityDays,
                p_limit: 500
            });
            if (rpcError) throw rpcError;
            setRows(data || []);
        } catch (err) {
            setError(err.message || '학생 활동을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, [teacherId, activityDays]);

    useEffect(() => {
        fetchActivity();
    }, [fetchActivity]);

    const filteredRows = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return rows.filter(row => {
            if (onlyInactive && row.recent_post_count > 0) return false;
            if (!keyword) return true;
            const text = `${row.student_name} ${row.class_name} ${row.teacher_name} ${row.school_name}`.toLowerCase();
            return text.includes(keyword);
        });
    }, [rows, searchTerm, onlyInactive]);

    const summary = useMemo(() => {
        const active = rows.filter(row => row.recent_post_count > 0).length;
        const submitted = rows.reduce((sum, row) => sum + (row.submitted_count || 0), 0);
        return { total: rows.length, active, submitted };
    }, [rows]);

    return (
        <SectionCard>
            <PanelHeader
                title={teacherLabel ? `🧑‍🎓 ${teacherLabel} 선생님 학급의 학생 활동` : '🧑‍🎓 학생 학습 활동'}
                description={`최근 ${activityDays}일 동안 글을 쓴 학생과, 등록만 되고 활동이 없는 학생을 함께 봅니다. 활동이 많은 순으로 최대 500명까지 표시합니다.`}
                right={(
                    <>
                        <DayRangeSelect
                            label="활동 기준"
                            value={activityDays}
                            options={ACTIVITY_DAY_OPTIONS}
                            onChange={setActivityDays}
                            disabled={loading}
                        />
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#4A5568' }}>
                            <input
                                type="checkbox"
                                checked={onlyInactive}
                                onChange={(e) => setOnlyInactive(e.target.checked)}
                            />
                            활동 없는 학생만
                        </label>
                        <input
                            type="text"
                            placeholder="🔍 학생·학급·학교 검색"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                padding: '8px 14px', borderRadius: '20px', border: '1px solid #CBD5E0',
                                width: '240px', fontSize: '0.85rem', outline: 'none'
                            }}
                        />
                    </>
                )}
            />

            <div style={{
                display: 'flex', gap: '20px', padding: '14px 20px',
                borderBottom: '1px solid #EDF2F7', fontSize: '0.85rem', color: '#4A5568', flexWrap: 'wrap'
            }}>
                <span>전체 학생 <strong style={{ color: '#2D3748' }}>{summary.total}명</strong></span>
                <span>최근 {activityDays}일 활동 <strong style={{ color: '#38A169' }}>{summary.active}명</strong></span>
                <span>활동 없음 <strong style={{ color: '#E53E3E' }}>{summary.total - summary.active}명</strong></span>
                <span>누적 제출 글 <strong style={{ color: '#2C5282' }}>{summary.submitted}개</strong></span>
            </div>

            {error && (
                <div style={{ padding: '16px 20px', color: '#C53030', background: '#FFF5F5', fontSize: '0.88rem' }}>
                    ⚠️ {error}
                </div>
            )}

            {loading ? (
                <EmptyState>학생 활동을 불러오는 중...</EmptyState>
            ) : filteredRows.length === 0 ? (
                <EmptyState>조건에 맞는 학생이 없습니다.</EmptyState>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={tableStyle}>
                        <thead>
                            <tr style={theadRowStyle}>
                                <th style={thLeftStyle}>학생</th>
                                <th style={thLeftStyle}>학급</th>
                                {!teacherId && <th style={thLeftStyle}>담당 선생님</th>}
                                <th style={thStyle}>최근 {activityDays}일 글</th>
                                <th style={thStyle}>누적 글</th>
                                <th style={thStyle}>제출</th>
                                <th style={thStyle}>포인트</th>
                                <th style={thStyle}>마지막 활동</th>
                                <th style={thStyle}>등록일</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.map(row => (
                                <tr key={row.student_id} style={{ borderBottom: '1px solid #F1F3F5' }}>
                                    <td
                                        lang="ko"
                                        translate="no"
                                        className="notranslate"
                                        style={{ ...tdLeftStyle, fontWeight: 'bold', color: '#2C3E50' }}
                                    >
                                        {row.student_name}
                                    </td>
                                    <td style={tdLeftStyle}>{row.class_name}</td>
                                    {!teacherId && (
                                        <td style={tdLeftStyle}>
                                            {row.teacher_name}
                                            {row.school_name && (
                                                <span style={{ color: '#A0AEC0', marginLeft: '6px', fontSize: '0.8rem' }}>
                                                    {row.school_name}
                                                </span>
                                            )}
                                        </td>
                                    )}
                                    <CountCell value={row.recent_post_count} highlightZero />
                                    <CountCell value={row.post_count} />
                                    <CountCell value={row.submitted_count} />
                                    <td style={{ ...tdStyle, color: '#B7791F', fontWeight: 700 }}>{row.total_points || 0}P</td>
                                    <td style={tdStyle}>{formatRelativeTime(row.last_activity_at)}</td>
                                    <td style={tdStyle}>{formatDate(row.joined_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </SectionCard>
    );
};

export default AdminStudentActivityPanel;
