import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';
import AdminFeedbackList from './AdminFeedbackList';
import AdminAnnouncementManager from './AdminAnnouncementManager';

const TEACHER_REFRESH_INTERVAL_MS = 30000;

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
    // teachers.name을 최우선 사용, 없으면 full_name에서 이메일 형태가 아닌 경우만 사용
    const rawFullName = profile.full_name || '';
    const isEmailLike = rawFullName.includes('@');
    const displayName = teacherInfo?.name || (!isEmailLike ? rawFullName : '') || '이름 없음';
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
                    <span
                        lang="ko"
                        translate="no"
                        className="notranslate"
                        style={{
                            fontSize: '1.1rem',
                            fontWeight: '900',
                            color: '#2C3E50'
                        }}
                    >
                        {displayName}
                    </span>
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

const formatLastLogin = (dateString) => {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';

        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (minutes < 1) return '방금 전';
        if (minutes < 60) return `${minutes}분 전`;
        if (hours < 24) return `${hours}시간 전`;
        if (days < 5) return `${days}일 전`;

        return date.toLocaleDateString('ko-KR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (_e) {
        return '-';
    }
};

// --- Main Container ---

const AdminDashboard = ({ session: _session, onLogout, onSwitchToTeacherMode }) => {
    const [pendingTeachers, setPendingTeachers] = useState([]);
    const [approvedTeachers, setApprovedTeachers] = useState([]);
    const [registeredStudentCount, setRegisteredStudentCount] = useState(0);
    const [teacherStudentCounts, setTeacherStudentCounts] = useState({});
    const [autoApproval, setAutoApproval] = useState(false);
    const [publicAiEnabled, setPublicAiEnabled] = useState(true);
    const [pendingFeedbackCount, setPendingFeedbackCount] = useState(0);

    // States for UI
    const [currentTab, setCurrentTab] = useState('active'); // 'active', 'pending', 'settings', 'feedback', 'announcements'
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    const [loading, setLoading] = useState(true);
    const [settingsLoading, setSettingsLoading] = useState(false);
    const [_error, setError] = useState(null);

    const sortTeachersByRecentLogin = (list) => {
        return [...list].sort((a, b) => {
            const aLastLogin = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
            const bLastLogin = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;

            if (aLastLogin !== bLastLogin) {
                return bLastLogin - aLastLogin;
            }

            const aCreatedAt = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bCreatedAt = b.created_at ? new Date(b.created_at).getTime() : 0;
            return bCreatedAt - aCreatedAt;
        });
    };

    const fetchFeedbackCount = async () => {
        try {
            // count: 'exact'와 head: true를 사용하여 406 에러 방지 및 효율적인 조회
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
            const { data: settings } = await supabase.from('system_settings').select('key, value');
            if (settings) {
                const auto = settings.find(s => s.key === 'auto_approval');
                if (auto) setAutoApproval(auto.value === true);
                
                const ai = settings.find(s => s.key === 'public_api_enabled');
                if (ai) setPublicAiEnabled(ai.value === true);
            }
        } catch (err) { console.error('설정 로드 실패:', err); }
    };

    const fetchRegisteredStudentCount = async () => {
        try {
            const { count, error } = await supabase
                .from('students')
                .select('id', { count: 'exact', head: true })
                .is('deleted_at', null);

            if (error) throw error;
            setRegisteredStudentCount(count || 0);
        } catch (err) {
            console.error('등록 학생 수 조회 실패:', err);
        }
    };

    const fetchTeacherStudentCounts = async () => {
        try {
            const { data: classes, error: classError } = await supabase
                .from('classes')
                .select('id, teacher_id');

            if (classError) throw classError;

            if (!classes || classes.length === 0) {
                setTeacherStudentCounts({});
                return;
            }

            const classTeacherMap = new Map(classes.map(item => [item.id, item.teacher_id]));
            const classIds = classes.map(item => item.id);

            const { data: students, error: studentError } = await supabase
                .from('students')
                .select('class_id')
                .in('class_id', classIds)
                .is('deleted_at', null);

            if (studentError) throw studentError;

            const counts = {};
            (students || []).forEach(student => {
                const teacherId = classTeacherMap.get(student.class_id);
                if (!teacherId) return;
                counts[teacherId] = (counts[teacherId] || 0) + 1;
            });

            setTeacherStudentCounts(counts);
        } catch (err) {
            console.error('교사별 등록 학생 수 조회 실패:', err);
        }
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

    const handleTogglePublicAi = async () => {
        setSettingsLoading(true);
        const newValue = !publicAiEnabled;
        try {
            const { error } = await supabase.from('system_settings').upsert({ key: 'public_api_enabled', value: newValue });
            if (error) throw error;
            setPublicAiEnabled(newValue);
            alert(`시스템 공용 AI 서비스가 ${newValue ? '활성화' : '비활성화'} 되었습니다.`);
        } catch (err) {
            alert('설정 변경 중 오류가 발생했습니다: ' + err.message);
        } finally {
            setSettingsLoading(false);
        }
    };

    const fetchTeachers = async ({ showLoading = true } = {}) => {
        if (showLoading) {
            setLoading(true);
        }
        setError(null);
        try {
            const { data, error: fetchError } = await supabase
                .from('profiles')
                // [보안] select('*') 대신 필요한 컬럼만 명시 → personal_openai_api_key 등 민감정보 미노출
                .select(`id, role, email, full_name, is_approved, api_mode, created_at, last_login_at, teachers!left(name, school_name, phone)`)
                .in('role', ['TEACHER', 'ADMIN'])
                .order('last_login_at', { ascending: false, nullsFirst: false })
                .order('created_at', { ascending: false });

            if (fetchError) throw fetchError;

            setPendingTeachers(data.filter(p => p.is_approved !== true));
            setApprovedTeachers(sortTeachersByRecentLogin(data.filter(p => p.is_approved === true)));
        } catch (err) {
            setError(err.message);
        } finally {
            if (showLoading) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        fetchTeachers();
        fetchSettings();
        fetchFeedbackCount();
        fetchRegisteredStudentCount();
        fetchTeacherStudentCounts();

        const refreshTeachers = () => {
            fetchTeachers({ showLoading: false });
            fetchRegisteredStudentCount();
            fetchTeacherStudentCounts();
        };

        const intervalId = window.setInterval(refreshTeachers, TEACHER_REFRESH_INTERVAL_MS);
        const handleFocus = () => refreshTeachers();
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                refreshTeachers();
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    // 탭이나 검색어가 바뀔 때 페이지 리셋
    useEffect(() => {
        setCurrentPage(1);
    }, [currentTab, searchTerm]);

    const handleApprove = async (teacherId, teacherName) => {
        if (_session?.user?.id === teacherId) {
            alert('자신에 대해서는 이 작업을 수행할 수 없습니다.');
            return;
        }
        if (!confirm(`'${teacherName}' 선생님의 가입을 승인하시겠습니까?`)) return;
        try {
            const { error } = await supabase.rpc('admin_set_teacher_approval', {
                p_teacher_id: teacherId,
                p_is_approved: true
            });
            if (error) throw error;
            alert(`✅ '${teacherName}' 선생님이 승인되었습니다!`);
            fetchTeachers();
        } catch (err) { alert('오류: ' + err.message); }
    };

    const handleRevoke = async (teacherId, teacherName) => {
        if (_session?.user?.id === teacherId) {
            alert('자신의 승인을 관리자 화면에서 취소할 수 없습니다.');
            return;
        }
        if (!confirm(`'${teacherName}' 선생님의 승인을 취소하시겠습니까?`)) return;
        try {
            const { error } = await supabase.rpc('admin_set_teacher_approval', {
                p_teacher_id: teacherId,
                p_is_approved: false
            });
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
            const { error } = await supabase.rpc('admin_set_teacher_api_mode', {
                p_teacher_id: teacherId,
                p_api_mode: newMode
            });
            if (error) throw error;

            // UI Optimistic Update
            const updater = list => sortTeachersByRecentLogin(list.map(item => item.id === teacherId ? { ...item, api_mode: newMode } : item));
            setApprovedTeachers(prev => updater(prev));
            setPendingTeachers(prev => updater(prev));

            alert(`✅ 변경 완료: ${modeLabel}`);
        } catch (err) { alert('변경 실패: ' + err.message); }
    };

    const handleForceWithdrawal = async (teacherId, teacherName) => {
        if (_session?.user?.id === teacherId) {
            alert('관리자 대시보드에서 본인을 삭제할 수 없습니다. 대신 회원 탈퇴 설정을 이용해주세요.');
            return;
        }
        if (!confirm(`🚨 경고: '${teacherName}' 선생님을 삭제하시겠습니까?\n모든 데이터가 영구 삭제됩니다.`)) return;
        if (!confirm(`⚠️ 정말로 삭제하시겠습니까?`)) return;

        try {
            // [최적화] 여러 테이블의 삭제를 병렬로 처리
            const { error } = await supabase.rpc('admin_force_teacher_withdrawal', {
                p_teacher_id: teacherId
            });
            
            if (error) throw error;

            alert(`🗑️ 삭제 완료`);
            fetchTeachers();
        } catch (err) { alert('삭제 실패: ' + err.message); }
    };

    // --- Search & Filter Logic ---
    const filterList = (list) => {
        const filtered = !searchTerm ? list : list.filter(t => {
            const info = Array.isArray(t.teachers) ? t.teachers[0] : t.teachers;
            const text = `${t.full_name} ${info?.name} ${info?.school_name} ${t.email}`.toLowerCase();
            return text.includes(searchTerm.toLowerCase());
        });

        if (list === approvedTeachers) {
            return sortTeachersByRecentLogin(filtered);
        }

        return filtered;
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
                    label="등록 학생수" value={`${registeredStudentCount}명`}
                    color="#4299E1" icon="🧑‍🎓"
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

                {/* Pagination Statistics */}
                {(currentTab === 'active' || currentTab === 'pending') && !loading && (
                    <div style={{ fontSize: '0.85rem', color: '#718096', display: 'flex', gap: '8px', marginBottom: '10px' }}>
                        <span>총 {filterList(currentTab === 'active' ? approvedTeachers : pendingTeachers).length}명</span>
                        {filterList(currentTab === 'active' ? approvedTeachers : pendingTeachers).length > ITEMS_PER_PAGE && (
                            <span>(페이지 {currentPage} / {Math.ceil(filterList(currentTab === 'active' ? approvedTeachers : pendingTeachers).length / ITEMS_PER_PAGE)})</span>
                        )}
                    </div>
                )}

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
                                            <th style={{ padding: '16px', textAlign: 'center', fontWeight: 'bold' }}>최근 접속</th>
                                            <th style={{ padding: '16px', textAlign: 'center', fontWeight: 'bold' }}>가입일</th>
                                            <th style={{ padding: '16px', textAlign: 'center', fontWeight: 'bold' }}>등록 학생 수</th>
                                            <th style={{ padding: '16px', textAlign: 'center', fontWeight: 'bold' }}>API 사용 권한</th>
                                            <th style={{ padding: '16px', textAlign: 'left', fontWeight: 'bold' }}>이메일</th>
                                            <th style={{ padding: '16px', textAlign: 'left', fontWeight: 'bold' }}>전화번호</th>
                                            <th style={{ padding: '16px', textAlign: 'center', fontWeight: 'bold' }}>관리</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(() => {
                                            const filtered = filterList(approvedTeachers);
                                            const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
                                            return paginated.map((profile, index) => {
                                                const teacherInfo = Array.isArray(profile.teachers) ? profile.teachers[0] : profile.teachers;
                                                // teachers.name을 최우선 사용, 없으면 full_name에서 이메일 형태가 아닌 경우만 사용
                                                const rawFullName = profile.full_name || '';
                                                const isEmailLike = rawFullName.includes('@');
                                                const displayName = teacherInfo?.name || (!isEmailLike ? rawFullName : '') || '이름 없음';
                                                const schoolName = teacherInfo?.school_name || '-';
                                                const displayPhone = teacherInfo?.phone || '-';
                                                const apiMode = profile.api_mode || 'SYSTEM';

                                                return (
                                                    <tr key={profile.id} style={{ borderBottom: '1px solid #F1F3F5', transition: 'background 0.2s', background: 'white' }}>
                                                        <td
                                                            lang="ko"
                                                            translate="no"
                                                            className="notranslate"
                                                            style={{
                                                                padding: '16px',
                                                                fontWeight: 'bold',
                                                                color: '#2C3E50'
                                                            }}
                                                        >
                                                            {displayName}
                                                        </td>
                                                        <td style={{ padding: '16px', color: '#455A64' }}>{schoolName}</td>
                                                        <td style={{ padding: '16px', textAlign: 'center', color: '#546E7A', fontWeight: '500' }}>
                                                            {formatLastLogin(profile.last_login_at)}
                                                        </td>
                                                        <td style={{ padding: '16px', textAlign: 'center', color: '#546E7A', fontWeight: '500', whiteSpace: 'nowrap' }}>
                                                            {profile.created_at ? new Date(profile.created_at).toLocaleDateString('ko-KR') : '-'}
                                                        </td>
                                                        <td style={{ padding: '16px', textAlign: 'center', color: '#2C5282', fontWeight: '700', whiteSpace: 'nowrap' }}>
                                                            {teacherStudentCounts[profile.id] || 0}명
                                                        </td>
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
                                            });
                                        })()}
                                    </tbody>
                                </table>
                            )}

                            {/* Pagination Controls */}
                            {!loading && filterList(approvedTeachers).length > ITEMS_PER_PAGE && (
                                <div style={{
                                    padding: '16px', borderTop: '1px solid #E9ECEF',
                                    display: 'flex', justifyContent: 'center', gap: '8px', background: '#F8F9FA'
                                }}>
                                    <Button
                                        size="sm" variant="ghost"
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(prev => prev - 1)}
                                    >이전</Button>

                                    {Array.from({ length: Math.ceil(filterList(approvedTeachers).length / ITEMS_PER_PAGE) }, (_, i) => i + 1).map(page => (
                                        <Button
                                            key={page}
                                            size="sm"
                                            style={{
                                                minWidth: '32px',
                                                background: currentPage === page ? '#4299E1' : 'transparent',
                                                color: currentPage === page ? 'white' : '#718096',
                                                border: currentPage === page ? 'none' : '1px solid #E2E8F0'
                                            }}
                                            onClick={() => setCurrentPage(page)}
                                        >{page}</Button>
                                    ))}

                                    <Button
                                        size="sm" variant="ghost"
                                        disabled={currentPage === Math.ceil(filterList(approvedTeachers).length / ITEMS_PER_PAGE)}
                                        onClick={() => setCurrentPage(prev => prev + 1)}
                                    >다음</Button>
                                </div>
                            )}
                        </div>
                    )}

                    {!loading && currentTab === 'pending' && (
                        <div>
                            {pendingTeachers.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px', color: '#A0AEC0' }}>승인 대기 중인 요청이 없습니다. 🎉</div>
                            ) : (
                                <>
                                    {filterList(pendingTeachers)
                                        .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
                                        .map(profile => {
                                            const teacherInfo = Array.isArray(profile.teachers) ? profile.teachers[0] : profile.teachers;
                                            const displayName = teacherInfo?.name || profile.full_name || '이름 없음';
                                            return (
                                                <TeacherItem
                                                    key={profile.id}
                                                    profile={profile}
                                                    onAction={() => handleApprove(profile.id, displayName)}
                                                    actionLabel="가입 승인"
                                                    actionColor="#38A169"
                                                    onToggleApiMode={() => handleToggleApiMode(profile.id, displayName, profile.api_mode)}
                                                />
                                            );
                                        })}

                                    {/* Pagination for Pending */}
                                    {filterList(pendingTeachers).length > ITEMS_PER_PAGE && (
                                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
                                            <Button
                                                size="sm" variant="ghost"
                                                disabled={currentPage === 1}
                                                onClick={() => setCurrentPage(prev => prev - 1)}
                                            >이전</Button>
                                            {Array.from({ length: Math.ceil(filterList(pendingTeachers).length / ITEMS_PER_PAGE) }, (_, i) => i + 1).map(page => (
                                                <Button
                                                    key={page}
                                                    size="sm"
                                                    style={{
                                                        minWidth: '32px',
                                                        background: currentPage === page ? '#4299E1' : 'white',
                                                        color: currentPage === page ? 'white' : '#718096',
                                                        border: '1px solid #E2E8F0'
                                                    }}
                                                    onClick={() => setCurrentPage(page)}
                                                >{page}</Button>
                                            ))}
                                            <Button
                                                size="sm" variant="ghost"
                                                disabled={currentPage === Math.ceil(filterList(pendingTeachers).length / ITEMS_PER_PAGE)}
                                                onClick={() => setCurrentPage(prev => prev + 1)}
                                            >다음</Button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {!loading && currentTab === 'settings' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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

                            <Card style={{ padding: '30px', borderLeft: '5px solid #F6AD55' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: '#2D3748' }}>🤖 시스템 공용 AI 서비스</h3>
                                        <p style={{ margin: 0, color: '#718096' }}>
                                            모든 교사에게 제공되는 시스템 공용 API 키 사용 여부를 설정합니다.<br/>
                                            비활성화 시 '개인 키'를 등록한 교사만 AI 기능을 사용할 수 있습니다.
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <span style={{ fontWeight: 'bold', color: publicAiEnabled ? '#38A169' : '#E53E3E' }}>
                                            {publicAiEnabled ? '공용 AI 사용 가능' : '공용 AI 중단 (개인 키만 허용)'}
                                        </span>
                                        <label style={{ position: 'relative', display: 'inline-block', width: '56px', height: '30px' }}>
                                            <input
                                                type="checkbox"
                                                checked={publicAiEnabled}
                                                onChange={handleTogglePublicAi}
                                                disabled={settingsLoading}
                                                style={{ opacity: 0, width: 0, height: 0 }}
                                            />
                                            <span style={{
                                                position: 'absolute', cursor: 'pointer',
                                                top: 0, left: 0, right: 0, bottom: 0,
                                                backgroundColor: publicAiEnabled ? '#48BB78' : '#CBD5E0',
                                                transition: '.4s', borderRadius: '34px'
                                            }}>
                                                <span style={{
                                                    position: 'absolute', content: '""',
                                                    height: '22px', width: '22px',
                                                    left: publicAiEnabled ? '30px' : '4px', bottom: '4px',
                                                    backgroundColor: 'white', transition: '.4s', borderRadius: '50%'
                                                }}></span>
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    )}

                    {!loading && currentTab === 'feedback' && (
                        <AdminFeedbackList onFeedbackUpdated={fetchFeedbackCount} />
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
