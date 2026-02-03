import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';
import AdminFeedbackList from './AdminFeedbackList';
import AdminAnnouncementManager from './AdminAnnouncementManager';

// --- Components ---

const StatCard = ({ label, value, color, icon }) => (
    <div style={{
        background: 'white', borderRadius: '12px', padding: '20px',
        border: '1px solid #E9ECEF', boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
        display: 'flex', alignItems: 'center', gap: '16px', flex: 1
    }}>
        <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: `${color}15`, color: color,
            display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.5rem'
        }}>
            {icon}
        </div>
        <div>
            <div style={{ fontSize: '0.85rem', color: '#7F8C8D', fontWeight: 'bold' }}>{label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#2C3E50' }}>{value}</div>
        </div>
    </div>
);

const TeacherItem = ({ profile, onAction, actionLabel, actionColor, isRevoke, onForceWithdrawal, onToggleApiMode }) => {
    const teacherInfo = Array.isArray(profile.teachers) ? profile.teachers[0] : profile.teachers;
    const displayName = teacherInfo?.name || profile.full_name || '이름 없음';
    const schoolName = teacherInfo?.school_name || '학교 정보 없음';
    const displayPhone = teacherInfo?.phone || '-';
    // API 모드 (기본값 SYSTEM)
    const apiMode = profile.api_mode || 'SYSTEM';

    return (
        <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '20px', background: 'white', borderRadius: '12px',
            border: '1px solid #E9ECEF', marginBottom: '12px',
            transition: 'transform 0.2s, box-shadow 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: '900', color: '#2C3E50' }}>{displayName}</span>
                    <span style={{ fontSize: '0.8rem', color: '#546E7A', background: '#ECEFF1', padding: '2px 8px', borderRadius: '4px', border: '1px solid #CFD8DC' }}>
                        {schoolName}
                    </span>

                    {/* API 모드 배지 */}
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleApiMode && onToggleApiMode(); }}
                        title="클릭하여 AI API 모드 변경"
                        style={{
                            fontSize: '0.75rem', fontWeight: 'bold',
                            padding: '4px 10px', borderRadius: '20px', cursor: 'pointer',
                            border: apiMode === 'PERSONAL' ? '1px solid #A5D6A7' : '1px solid #90CAF9',
                            background: apiMode === 'PERSONAL' ? '#E8F5E9' : '#E3F2FD',
                            color: apiMode === 'PERSONAL' ? '#2E7D32' : '#1976D2',
                            display: 'flex', alignItems: 'center', gap: '4px'
                        }}
                    >
                        {apiMode === 'PERSONAL' ? '🔑 개인 키' : '🌐 공용 키'}
                    </button>
                </div>
                <div style={{ fontSize: '0.9rem', color: '#78909C', lineHeight: '1.5' }}>
                    <span style={{ display: 'inline-block', marginRight: '12px' }}>📧 {profile.email}</span>
                    <span style={{ display: 'inline-block' }}>📞 {displayPhone}</span>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexDirection: 'column', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <Button
                        onClick={onAction}
                        size="sm"
                        style={{
                            background: isRevoke ? 'white' : actionColor,
                            color: isRevoke ? actionColor : 'white',
                            border: isRevoke ? `1px solid ${actionColor}` : 'none',
                            fontWeight: 'bold', borderRadius: '6px', fontSize: '0.8rem', padding: '6px 12px'
                        }}
                    >
                        {actionLabel}
                    </Button>

                    {isRevoke && (
                        <Button
                            onClick={onForceWithdrawal}
                            size="sm"
                            style={{
                                background: '#FFF5F5', color: '#C0392B',
                                border: '1px solid #FFCDD2',
                                fontWeight: 'bold', borderRadius: '6px', fontSize: '0.8rem', padding: '6px 12px'
                            }}
                        >
                            강제 탈퇴
                        </Button>
                    )}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#B0BEC5' }}>
                    가입: {new Date(profile.created_at).toLocaleDateString()}
                </div>
            </div>
        </div>
    );
};

// --- Main Container ---

const AdminDashboard = ({ session, onLogout, onSwitchToTeacherMode }) => {
    const [pendingTeachers, setPendingTeachers] = useState([]);
    const [approvedTeachers, setApprovedTeachers] = useState([]);
    const [autoApproval, setAutoApproval] = useState(false);
    const [pendingFeedbackCount, setPendingFeedbackCount] = useState(0);

    // States for UI
    const [currentTab, setCurrentTab] = useState('active'); // 'active', 'pending', 'settings', 'feedback', 'announcements'
    const [searchTerm, setSearchTerm] = useState('');

    const [loading, setLoading] = useState(true);
    const [settingsLoading, setSettingsLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchTeachers();
        fetchSettings();
        fetchFeedbackCount();
    }, []);

    const fetchFeedbackCount = async () => {
        try {
            const { count, error } = await supabase
                .from('feedback_reports')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'open');

            if (!error) setPendingFeedbackCount(count || 0);
        } catch (err) {
            console.error('피드백 개수 확인 실패:', err);
        }
    };

    const fetchSettings = async () => {
        try {
            const { data } = await supabase.from('system_settings').select('*').eq('key', 'auto_approval').single();
            if (data) setAutoApproval(data.value === true);
        } catch (err) { console.error('설정 로드 실패:', err); }
    };

    const handleToggleAutoApproval = async () => {
        setSettingsLoading(true);
        const newValue = !autoApproval;
        try {
            const { error } = await supabase.from('system_settings').upsert({ key: 'auto_approval', value: newValue });
            if (error) throw error;
            setAutoApproval(newValue);
            alert(`교사 가입 방식이 ${newValue ? '자동 승인' : '관리자 직접 승인'}으로 변경되었습니다.`);
        } catch (err) {
            alert('설정 변경 중 오류가 발생했습니다: ' + err.message);
        } finally {
            setSettingsLoading(false);
        }
    };

    const fetchTeachers = async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: fetchError } = await supabase
                .from('profiles')
                .select(`*, teachers!left (name, school_name, phone)`)
                .eq('role', 'TEACHER')
                .order('created_at', { ascending: false });

            if (fetchError) throw fetchError;

            setPendingTeachers(data.filter(p => p.is_approved !== true));
            setApprovedTeachers(data.filter(p => p.is_approved === true));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (teacherId, teacherName) => {
        if (!confirm(`'${teacherName}' 선생님의 가입을 승인하시겠습니까?`)) return;
        try {
            const { error } = await supabase.from('profiles').update({ is_approved: true }).eq('id', teacherId);
            if (error) throw error;
            alert(`✅ '${teacherName}' 선생님이 승인되었습니다!`);
            fetchTeachers();
        } catch (err) { alert('오류: ' + err.message); }
    };

    const handleRevoke = async (teacherId, teacherName) => {
        if (!confirm(`'${teacherName}' 선생님의 승인을 취소하시겠습니까?`)) return;
        try {
            const { error } = await supabase.from('profiles').update({ is_approved: false }).eq('id', teacherId);
            if (error) throw error;
            alert(`🚫 승인 취소 완료`);
            fetchTeachers();
        } catch (err) { alert('오류: ' + err.message); }
    };

    const handleToggleApiMode = async (teacherId, teacherName, currentMode) => {
        const newMode = currentMode === 'PERSONAL' ? 'SYSTEM' : 'PERSONAL';
        const modeLabel = newMode === 'PERSONAL' ? '교사 개인 키' : '시스템 공용 키';

        if (!confirm(`'${teacherName}' 선생님의 모드를 [${modeLabel}]로 변경하시겠습니까?`)) return;

        try {
            const { error } = await supabase.from('profiles').update({ api_mode: newMode }).eq('id', teacherId);
            if (error) throw error;

            // UI Optimistic Update
            const updater = list => list.map(item => item.id === teacherId ? { ...item, api_mode: newMode } : item);
            setApprovedTeachers(prev => updater(prev));
            setPendingTeachers(prev => updater(prev));

            alert(`✅ 변경 완료: ${modeLabel}`);
        } catch (err) { alert('변경 실패: ' + err.message); }
    };

    const handleForceWithdrawal = async (teacherId, teacherName) => {
        if (!confirm(`🚨 경고: '${teacherName}' 선생님을 삭제하시겠습니까?\n모든 데이터가 영구 삭제됩니다.`)) return;
        if (!confirm(`⚠️ 정말로 삭제하시겠습니까?`)) return;

        try {
            await supabase.from('teachers').delete().eq('id', teacherId);
            await supabase.from('profiles').delete().eq('id', teacherId);
            alert(`🗑️ 삭제 완료`);
            fetchTeachers();
        } catch (err) { alert('삭제 실패: ' + err.message); }
    };

    // --- Search & Filter Logic ---
    const filterList = (list) => {
        if (!searchTerm) return list;
        return list.filter(t => {
            const info = Array.isArray(t.teachers) ? t.teachers[0] : t.teachers;
            const text = `${t.full_name} ${info?.name} ${info?.school_name} ${t.email}`.toLowerCase();
            return text.includes(searchTerm.toLowerCase());
        });
    };

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 20px', fontFamily: "'Pretendard', sans-serif" }}>
            {/* Header */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.8rem', color: '#1A202C', fontWeight: '800' }}>🛡️ 관리자 대시보드</h1>
                    <p style={{ margin: '6px 0 0 0', color: '#718096' }}>전체 선생님 및 시스템 설정 관리</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <Button onClick={onSwitchToTeacherMode} variant="primary" style={{ background: '#4299E1', border: 'none', borderRadius: '8px' }}>
                        🏫 교사 모드 전환
                    </Button>
                    <Button onClick={onLogout} variant="ghost" style={{ color: '#E53E3E' }}>로그아웃</Button>
                </div>
            </header>

            {/* Stats Row */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '40px', flexWrap: 'wrap' }}>
                <StatCard
                    label="승인 대기" value={`${pendingTeachers.length}명`}
                    color="#F6AD55" icon="⏳"
                />
                <StatCard
                    label="활동 중인 선생님" value={`${approvedTeachers.length}명`}
                    color="#48BB78" icon="✅"
                />
                <StatCard
                    label="전체 회원" value={`${pendingTeachers.length + approvedTeachers.length}명`}
                    color="#4299E1" icon="👥"
                />
            </div>

            {/* Main Content Area */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Tabs & Controls */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #E2E8F0', paddingBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '24px' }}>
                        {[
                            { id: 'active', label: '✅ 활동 중인 선생님' },
                            { id: 'pending', label: `⏳ 승인 대기 (${pendingTeachers.length})` },
                            {
                                id: 'feedback',
                                label: (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        📢 의견 및 제보
                                        {pendingFeedbackCount > 0 && (
                                            <span style={{
                                                background: '#E53E3E', color: 'white', fontSize: '0.7rem',
                                                padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold'
                                            }}>
                                                {pendingFeedbackCount}
                                            </span>
                                        )}
                                    </span>
                                )
                            },
                            {
                                id: 'announcements',
                                label: '📢 공지사항 관리'
                            },
                            { id: 'settings', label: '⚙️ 시스템 설정' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setCurrentTab(tab.id)}
                                style={{
                                    border: 'none', background: 'none', cursor: 'pointer',
                                    fontWeight: currentTab === tab.id ? 'bold' : 'normal',
                                    color: currentTab === tab.id ? '#2B6CB0' : '#718096',
                                    fontSize: '1rem', padding: '0 4px',
                                    position: 'relative'
                                }}
                            >
                                {tab.label}
                                {currentTab === tab.id && (
                                    <div style={{ position: 'absolute', bottom: '-18px', left: 0, right: 0, height: '3px', background: '#2B6CB0' }} />
                                )}
                            </button>
                        ))}
                    </div>

                    {currentTab !== 'settings' && (
                        <input
                            type="text"
                            placeholder="🔍 선생님 검색 (이름, 학교, 이메일)"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                padding: '10px 16px', borderRadius: '20px', border: '1px solid #CBD5E0',
                                width: '300px', fontSize: '0.9rem', outline: 'none'
                            }}
                        />
                    )}
                </div>

                {/* Tab Content */}
                <div style={{ minHeight: '400px' }}>
                    {loading && <div style={{ padding: '40px', textAlign: 'center', color: '#A0AEC0' }}>데이터 불러오는 중...</div>}

                    {!loading && currentTab === 'active' && (
                        <div style={{ overflowX: 'auto', background: 'white', borderRadius: '12px', border: '1px solid #E9ECEF', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            {approvedTeachers.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px', color: '#A0AEC0' }}>활동 중인 선생님이 없습니다.</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', minWidth: '800px' }}>
                                    <thead>
                                        <tr style={{ background: '#F8F9FA', borderBottom: '2px solid #E9ECEF', color: '#546E7A' }}>
                                            <th style={{ padding: '16px', textAlign: 'left', fontWeight: 'bold' }}>이름</th>
                                            <th style={{ padding: '16px', textAlign: 'left', fontWeight: 'bold' }}>학교</th>
                                            <th style={{ padding: '16px', textAlign: 'center', fontWeight: 'bold' }}>API 사용 권한</th>
                                            <th style={{ padding: '16px', textAlign: 'left', fontWeight: 'bold' }}>이메일</th>
                                            <th style={{ padding: '16px', textAlign: 'left', fontWeight: 'bold' }}>전화번호</th>
                                            <th style={{ padding: '16px', textAlign: 'center', fontWeight: 'bold' }}>관리</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filterList(approvedTeachers).map((profile, index) => {
                                            const teacherInfo = Array.isArray(profile.teachers) ? profile.teachers[0] : profile.teachers;
                                            const displayName = teacherInfo?.name || profile.full_name || '이름 없음';
                                            const schoolName = teacherInfo?.school_name || '-';
                                            const displayPhone = teacherInfo?.phone || '-';
                                            const apiMode = profile.api_mode || 'SYSTEM';

                                            return (
                                                <tr key={profile.id} style={{ borderBottom: '1px solid #F1F3F5', transition: 'background 0.2s', background: 'white' }}>
                                                    <td style={{ padding: '16px', fontWeight: 'bold', color: '#2C3E50' }}>{displayName}</td>
                                                    <td style={{ padding: '16px', color: '#455A64' }}>{schoolName}</td>
                                                    <td style={{ padding: '16px', textAlign: 'center' }}>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleToggleApiMode(profile.id, displayName, apiMode); }}
                                                            title="클릭하여 모드 변경"
                                                            style={{
                                                                fontSize: '0.8rem', fontWeight: 'bold',
                                                                padding: '6px 12px', borderRadius: '20px', cursor: 'pointer',
                                                                border: apiMode === 'PERSONAL' ? '1px solid #A5D6A7' : '1px solid #90CAF9',
                                                                background: apiMode === 'PERSONAL' ? '#E8F5E9' : '#E3F2FD',
                                                                color: apiMode === 'PERSONAL' ? '#2E7D32' : '#1976D2',
                                                                display: 'inline-flex', alignItems: 'center', gap: '6px'
                                                            }}
                                                        >
                                                            {apiMode === 'PERSONAL' ? '🔑 개인 키' : '🌐 공용 키'}
                                                        </button>
                                                    </td>
                                                    <td style={{ padding: '16px', color: '#546E7A' }}>{profile.email}</td>
                                                    <td style={{ padding: '16px', color: '#546E7A' }}>{displayPhone}</td>
                                                    <td style={{ padding: '16px', textAlign: 'center' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                                                            <Button
                                                                onClick={() => handleRevoke(profile.id, displayName)}
                                                                size="sm"
                                                                style={{
                                                                    background: 'white', color: '#E53E3E',
                                                                    border: '1px solid #FEB2B2',
                                                                    fontWeight: 'bold', borderRadius: '6px', padding: '6px 10px', fontSize: '0.8rem'
                                                                }}
                                                            >
                                                                승인 취소
                                                            </Button>
                                                            <Button
                                                                onClick={() => handleForceWithdrawal(profile.id, displayName)}
                                                                size="sm"
                                                                style={{
                                                                    background: '#FFF5F5', color: '#C0392B',
                                                                    border: '1px solid #FC8181',
                                                                    fontWeight: 'bold', borderRadius: '6px', padding: '6px 10px', fontSize: '0.8rem'
                                                                }}
                                                            >
                                                                강제 탈퇴
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {!loading && currentTab === 'pending' && (
                        <div>
                            {pendingTeachers.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px', color: '#A0AEC0' }}>승인 대기 중인 요청이 없습니다. 🎉</div>
                            ) : (
                                filterList(pendingTeachers).map(profile => (
                                    <TeacherItem
                                        key={profile.id}
                                        profile={profile}
                                        onAction={() => handleApprove(profile.id, profile.teachers?.name || profile.full_name)}
                                        actionLabel="가입 승인"
                                        actionColor="#38A169"
                                        onToggleApiMode={() => handleToggleApiMode(profile.id, profile.teachers?.name || profile.full_name, profile.api_mode)}
                                    />
                                ))
                            )}
                        </div>
                    )}

                    {!loading && currentTab === 'settings' && (
                        <Card style={{ padding: '30px', borderLeft: '5px solid #4299E1' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: '#2D3748' }}>⚙️ 교사 가입 승인 정책</h3>
                                    <p style={{ margin: 0, color: '#718096' }}>
                                        신규 교사가 회원가입을 요청했을 때의 처리 방식을 설정합니다.
                                    </p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <span style={{ fontWeight: 'bold', color: autoApproval ? '#38A169' : '#718096' }}>
                                        {autoApproval ? '자동 승인 (즉시 가입)' : '수동 승인 (관리자 확인)'}
                                    </span>
                                    <label style={{ position: 'relative', display: 'inline-block', width: '56px', height: '30px' }}>
                                        <input
                                            type="checkbox"
                                            checked={autoApproval}
                                            onChange={handleToggleAutoApproval}
                                            disabled={settingsLoading}
                                            style={{ opacity: 0, width: 0, height: 0 }}
                                        />
                                        <span style={{
                                            position: 'absolute', cursor: 'pointer',
                                            top: 0, left: 0, right: 0, bottom: 0,
                                            backgroundColor: autoApproval ? '#48BB78' : '#CBD5E0',
                                            transition: '.4s', borderRadius: '34px'
                                        }}>
                                            <span style={{
                                                position: 'absolute', content: '""',
                                                height: '22px', width: '22px',
                                                left: autoApproval ? '30px' : '4px', bottom: '4px',
                                                backgroundColor: 'white', transition: '.4s', borderRadius: '50%'
                                            }}></span>
                                        </span>
                                    </label>
                                </div>
                            </div>
                        </Card>
                    )}

                    {!loading && currentTab === 'feedback' && (
                        <AdminFeedbackList />
                    )}

                    {!loading && currentTab === 'announcements' && (
                        <AdminAnnouncementManager />
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
