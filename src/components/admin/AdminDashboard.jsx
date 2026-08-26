import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';
import AdminFeedbackList from './AdminFeedbackList';
import AdminAnnouncementManager from './AdminAnnouncementManager';
import AdminUsagePanel from './AdminUsagePanel';
import AdminStudentActivityPanel from './AdminStudentActivityPanel';
import AdminDormantPanel from './AdminDormantPanel';
import AdminCleanupPanel from './AdminCleanupPanel';
import AdminLabManagementPanel from './AdminLabManagementPanel';
import AdminBackupPanel from './AdminBackupPanel';
import AdminServicePanel from './AdminServicePanel';
import { useAdminHealthSummary } from './useAdminHealthSummary';
import useAdminUsage from '../../hooks/useAdminUsage';
import useAdminTeacherAccountsPage from '../../hooks/useAdminTeacherAccountsPage';

const AdminVocabReviewPanel = React.lazy(() => import('./AdminVocabReviewPanel'));
// 500개 카탈로그를 함께 읽어 대조하므로 무겁다 — 탭을 고를 때만 내려받는다.
const AdminSpellingPromotionPanel = React.lazy(() => import('./AdminSpellingPromotionPanel'));

/*
 * 관리자 화면을 성격별로 묶는다.
 *
 * 예전에는 13개가 한 줄에 평평하게 놓여 있어, 계정 관리·통계·콘텐츠 검수·서버 상태가 뒤섞여
 * 찾는 데 시간이 걸렸다. 큰 묶음을 고르면 그 안의 화면만 아래 줄에 보인다.
 *
 * ⚠️ 묶음에 숨기면 처리할 일이 있는지 안 보이므로, **묶음 이름에 안쪽 배지 합계를 함께 띄운다**.
 * 그러지 않으면 정리한다면서 오히려 놓치는 화면이 된다.
 */
const TAB_GROUPS = [
    {
        id: 'teachers',
        label: '👩‍🏫 선생님',
        tabs: [
            { id: 'active', label: '활동 중' },
            { id: 'pending', label: '승인 대기' },
            { id: 'dormant', label: '장기 미접속' },
            { id: 'cleanup', label: '정리 대상' }
        ]
    },
    {
        id: 'status',
        label: '📊 현황',
        tabs: [
            { id: 'usage', label: '사용량' },
            { id: 'students', label: '학생 활동' }
        ]
    },
    {
        id: 'review',
        label: '📚 검수',
        tabs: [
            { id: 'vocab', label: '어휘 V2' },
            { id: 'spelling', label: '맞춤법 승격' },
            { id: 'lab', label: '글쓰기 연구소' }
        ]
    },
    {
        id: 'ops',
        label: '🛠 운영',
        tabs: [
            { id: 'service', label: '서버 상태' },
            { id: 'backup', label: '백업 상태' },
            { id: 'announcements', label: '공지사항' },
            { id: 'feedback', label: '의견 제보' },
            { id: 'settings', label: '시스템 설정' }
        ]
    }
];

const findTabGroup = (tabId) => TAB_GROUPS.find((group) => group.tabs.some((tab) => tab.id === tabId)) || TAB_GROUPS[0];

/*
 * 한 번 연 화면은 감추기만 하고 살려 둔다.
 *
 * 지우면 다시 열 때마다 서버를 처음부터 읽는다. 검수처럼 화면을 오가며 하는 일에서는 그 기다림이
 * 매번 반복된다. 패널 안에는 타이머도 이벤트 구독도 없으므로(2026-08-21 확인) 감춰 둔 화면이
 * 뒤에서 무언가를 계속 하지는 않는다.
 */
const KeepAlivePanel = ({ active, visited, children }) => {
    if (!visited) return null;
    return <div style={{ display: active ? 'block' : 'none' }}>{children}</div>;
};

// --- Components ---

/*
 * 위쪽 요약 카드. `onOpen` 을 주면 눌러서 해당 화면으로 바로 간다.
 * 숫자를 보고 "그래서 어디로 가야 하지" 를 다시 찾게 만들지 않기 위한 것이다.
 */
const StatCard = ({ label, value, color, icon, onOpen }) => (
    <div
        onClick={onOpen}
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onKeyDown={onOpen ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } } : undefined}
        style={{
            background: 'white', borderRadius: '12px', padding: '20px',
            border: '1px solid #E9ECEF', boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
            display: 'flex', alignItems: 'center', gap: '16px', flex: 1,
            cursor: onOpen ? 'pointer' : 'default'
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

const TeacherItem = ({ profile, onAction, actionLabel, actionColor, isRevoke, onForceWithdrawal }) => {
    const teacherInfo = Array.isArray(profile.teachers) ? profile.teachers[0] : profile.teachers;
    // teachers.name을 최우선 사용, 없으면 full_name에서 이메일 형태가 아닌 경우만 사용
    const rawFullName = profile.full_name || '';
    const isEmailLike = rawFullName.includes('@');
    const displayName = teacherInfo?.name || (!isEmailLike ? rawFullName : '') || '이름 없음';
    const schoolName = teacherInfo?.school_name || '학교 정보 없음';
    const displayPhone = teacherInfo?.phone || '-';

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
    } catch {
        return '-';
    }
};

// --- Main Container ---

const AdminDashboard = ({ session: _session, onLogout, onSwitchToTeacherMode }) => {
    const [autoApproval, setAutoApproval] = useState(false);
    const [publicAiEnabled, setPublicAiEnabled] = useState(true);
    const [pendingFeedbackCount, setPendingFeedbackCount] = useState(0);
    const [pendingGroup, setPendingGroup] = useState('new'); // 'new' | 'revoked'
    const [currentTab, setCurrentTab] = useState('active');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    const teacherStatus = currentTab === 'active'
        ? 'APPROVED'
        : pendingGroup === 'revoked' ? 'PENDING_REVOKED' : 'PENDING_NEW';
    const teacherPage = useAdminTeacherAccountsPage({
        status: teacherStatus,
        search: searchTerm,
        page: currentPage,
        pageSize: ITEMS_PER_PAGE,
        enabled: currentTab === 'active' || currentTab === 'pending'
    });
    const teacherPageCount = Math.max(1, Math.ceil(teacherPage.totalCount / ITEMS_PER_PAGE));
    const newSignupCount = Number(teacherPage.counts.pending_new || 0);
    const revokedTeacherCount = Number(teacherPage.counts.pending_revoked || 0);

    // 사용량·장기 미접속·정리 대상은 DB에서 한 번에 집계해서 받는다 (useAdminUsage)
    const usage = useAdminUsage();

    // States for UI
    // 'active' | 'pending' | 'usage' | 'students' | 'dormant' | 'cleanup' | 'lab' | 'vocab' | 'spelling' | 'backup' | 'feedback' | 'announcements' | 'settings'
    // 지금 고른 화면이 어느 묶음에 드는지는 따로 저장하지 않고 화면 id 하나에서 끌어낸다.
    // 두 곳에 나눠 두면 통계 카드로 건너뛸 때 묶음만 남아 어긋난다.
    const activeGroup = findTabGroup(currentTab);

    // 화면 이름 옆·묶음 이름 옆에 함께 쓰는 "처리할 일" 개수.
    const health = useAdminHealthSummary();
    /*
     * 색은 **지금 손대야 하는지**만 나타낸다. 판단 기준은 `AdminResourceStatus` 와 같게 둔다 —
     * 두 곳이 다르면 상단은 초록인데 안에 들어가면 빨강인 일이 생긴다.
     */
    const containerTone = health.summary == null || health.summary.containerTotal == null
        ? '#A0AEC0'
        : (health.summary.containerHealthy === health.summary.containerTotal ? '#48BB78' : '#E53E3E');
    const diskTone = health.summary?.diskFreeGb == null
        ? '#A0AEC0'
        : (health.summary.diskFreeGb < 20 ? '#E53E3E' : health.summary.diskFreeGb < 50 ? '#D69E2E' : '#48BB78');
    const hostMemoryPressureOpen = health.summary?.openAlertKeys?.includes('host_memory_pressure') === true;
    const hostMemoryTone = health.summary?.hostMemoryAvailablePct == null || health.summary?.hostSwapUsedMb == null
        ? '#A0AEC0'
        : (hostMemoryPressureOpen
            ? '#E53E3E'
            : (health.summary.hostMemoryAvailablePct < 30 ? '#D69E2E' : '#48BB78'));

    const tabBadges = useMemo(() => ({
        pending: newSignupCount,
        dormant: usage.dormantTeachers.length,
        cleanup: usage.cleanupCandidates.length,
        feedback: pendingFeedbackCount
    }), [newSignupCount, usage.dormantTeachers.length, usage.cleanupCandidates.length, pendingFeedbackCount]);

    // 한 번 연 화면은 살려 둔다(위 KeepAlivePanel 주석 참고).
    const [visitedTabs, setVisitedTabs] = useState(() => new Set(['active']));
    useEffect(() => {
        setVisitedTabs((current) => (current.has(currentTab) ? current : new Set(current).add(currentTab)));
    }, [currentTab]);
    const [settingsLoading, setSettingsLoading] = useState(false);

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

    useEffect(() => {
        fetchSettings();
        fetchFeedbackCount();
    }, []);

    // 탭이나 검색어가 바뀔 때 페이지 리셋
    useEffect(() => {
        setCurrentPage(1);
    }, [currentTab, searchTerm]);

    useEffect(() => {
        if (currentPage > teacherPageCount) setCurrentPage(teacherPageCount);
    }, [currentPage, teacherPageCount]);

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
            teacherPage.refresh();
            usage.refresh({ showLoading: false });
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
            teacherPage.refresh();
            usage.refresh({ showLoading: false });
        } catch (err) { alert('오류: ' + err.message); }
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
            teacherPage.refresh();
            usage.refresh({ showLoading: false });
        } catch (err) { alert('삭제 실패: ' + err.message); }
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

            {/*
              * 상단 요약 — **"지금 손대야 하나"에 답하는 값만** 둔다(2026-08-25 정리).
              *
              * 예전에는 여섯 칸이 전부 `사람 수` 였다(가입 교사·학급·승인된 선생님·등록 학생 …).
              * 늘어나는 숫자는 좋은 소식이지 **조치가 필요한 신호가 아니다.** 그 값들은
              * `현황 > 사용량` 으로 내렸다. 반대로 컨테이너·디스크·경고는 `운영 > 서버 상태` **안에만**
              * 있어서, 문제가 나도 그 탭을 열어야 알았다. 자리를 맞바꾼 것이다.
              *
              * 맥 본체 메모리·스왑은 5분 현재값을 함께 재므로, 도커 VM 값으로 본체 상태를 짐작하지 않는다.
              */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '40px', flexWrap: 'wrap' }}>
                <StatCard
                    label="컨테이너"
                    value={health.summary
                        ? `${health.summary.containerHealthy ?? '?'}/${health.summary.containerTotal ?? '?'}`
                        : '확인 중'}
                    color={containerTone} icon="📦"
                    onOpen={() => setCurrentTab('service')}
                />
                <StatCard
                    label="디스크 여유"
                    value={health.summary?.diskFreeGb != null ? `${health.summary.diskFreeGb}GB` : '확인 중'}
                    color={diskTone} icon="💾"
                    onOpen={() => setCurrentTab('service')}
                />
                <StatCard
                    label="맥 메모리"
                    value={health.summary?.hostMemoryAvailablePct != null && health.summary?.hostSwapUsedMb != null
                        ? `${health.summary.hostMemoryAvailablePct}% / ${health.summary.hostSwapUsedMb}MB`
                        : '확인 중'}
                    color={hostMemoryTone} icon="🧠"
                    onOpen={() => setCurrentTab('service')}
                />
                <StatCard
                    label="조치 필요"
                    value={health.summary ? `${health.summary.openAlertCount}건` : '확인 중'}
                    color={health.summary?.openAlertCount > 0 ? '#E53E3E' : '#48BB78'} icon="🚨"
                    onOpen={() => setCurrentTab('service')}
                />
                <StatCard
                    label="신규 승인 대기" value={`${newSignupCount}명`}
                    color="#F6AD55" icon="⏳"
                    onOpen={() => setCurrentTab('pending')}
                />
                {/* 의견 제보는 예전에는 탭 이름에만 배지가 붙어, 13개를 훑어야 알 수 있었다. */}
                <StatCard
                    label="새 의견 제보"
                    value={`${pendingFeedbackCount}건`}
                    color="#805AD5" icon="📢"
                    onOpen={() => setCurrentTab('feedback')}
                />
            </div>

            {/* Main Content Area */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* 1단 — 큰 묶음. 안에 처리할 일이 있으면 합계 배지를 함께 띄운다. */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {TAB_GROUPS.map(group => {
                        const isActive = activeGroup.id === group.id;
                        const groupBadge = group.tabs.reduce((sum, tab) => sum + (tabBadges[tab.id] || 0), 0);
                        return (
                            <button
                                key={group.id}
                                onClick={() => setCurrentTab(group.tabs[0].id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '7px',
                                    border: isActive ? '1px solid #2B6CB0' : '1px solid #E2E8F0',
                                    background: isActive ? '#EBF8FF' : 'white',
                                    color: isActive ? '#2B6CB0' : '#4A5568',
                                    fontWeight: isActive ? 'bold' : 'normal',
                                    fontSize: '1rem', padding: '9px 16px',
                                    borderRadius: '10px', cursor: 'pointer'
                                }}
                            >
                                {group.label}
                                {groupBadge > 0 && (
                                    <span style={{
                                        background: '#E53E3E', color: 'white', fontSize: '0.7rem',
                                        padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold'
                                    }}>
                                        {groupBadge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* 2단 — 고른 묶음 안의 화면들. 검색은 선생님 목록에서만 쓴다. */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', borderBottom: '2px solid #E2E8F0', paddingBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', rowGap: '12px' }}>
                        {activeGroup.tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setCurrentTab(tab.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    border: 'none', background: 'none', cursor: 'pointer',
                                    fontWeight: currentTab === tab.id ? 'bold' : 'normal',
                                    color: currentTab === tab.id ? '#2B6CB0' : '#718096',
                                    fontSize: '1rem', padding: '0 4px',
                                    position: 'relative'
                                }}
                            >
                                {tab.label}
                                {tabBadges[tab.id] > 0 && (
                                    <span style={{
                                        background: '#E53E3E', color: 'white', fontSize: '0.7rem',
                                        padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold'
                                    }}>
                                        {tabBadges[tab.id]}
                                    </span>
                                )}
                                {currentTab === tab.id && (
                                    <div style={{ position: 'absolute', bottom: '-18px', left: 0, right: 0, height: '3px', background: '#2B6CB0' }} />
                                )}
                            </button>
                        ))}
                    </div>
                    {(currentTab === 'active' || currentTab === 'pending') && (
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
                {(currentTab === 'active' || currentTab === 'pending') && !teacherPage.loading && (
                    <div style={{ fontSize: '0.85rem', color: '#718096', display: 'flex', gap: '8px', marginBottom: '10px' }}>
                        <span>총 {teacherPage.totalCount}명</span>
                        {teacherPage.totalCount > ITEMS_PER_PAGE && (
                            <span>(페이지 {currentPage} / {teacherPageCount})</span>
                        )}
                    </div>
                )}

                {/* Tab Content */}
                <div style={{ minHeight: '400px' }}>
                    {teacherPage.loading && (currentTab === 'active' || currentTab === 'pending') && (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#A0AEC0' }}>데이터 불러오는 중...</div>
                    )}

                    {teacherPage.error && (currentTab === 'active' || currentTab === 'pending') && (
                        <div style={{ padding: '16px 20px', color: '#C53030', background: '#FFF5F5', borderRadius: '10px', marginBottom: '12px' }}>
                            ⚠️ {teacherPage.error}
                        </div>
                    )}

                    {!teacherPage.loading && currentTab === 'active' && (
                        <div style={{ overflowX: 'auto', background: 'white', borderRadius: '12px', border: '1px solid #E9ECEF', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            {teacherPage.items.length === 0 ? (
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
                                            <th style={{ padding: '16px', textAlign: 'left', fontWeight: 'bold' }}>이메일</th>
                                            <th style={{ padding: '16px', textAlign: 'left', fontWeight: 'bold' }}>전화번호</th>
                                            <th style={{ padding: '16px', textAlign: 'center', fontWeight: 'bold' }}>관리</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {teacherPage.items.map((profile) => {
                                                const teacherInfo = Array.isArray(profile.teachers) ? profile.teachers[0] : profile.teachers;
                                                // teachers.name을 최우선 사용, 없으면 full_name에서 이메일 형태가 아닌 경우만 사용
                                                const rawFullName = profile.full_name || '';
                                                const isEmailLike = rawFullName.includes('@');
                                                const displayName = teacherInfo?.name || (!isEmailLike ? rawFullName : '') || '이름 없음';
                                                const schoolName = teacherInfo?.school_name || '-';
                                                const displayPhone = teacherInfo?.phone || '-';

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
                                                            {`${profile.student_count || 0}명`}
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

                            {/* Pagination Controls */}
                            {teacherPage.totalCount > ITEMS_PER_PAGE && (
                                <div style={{
                                    padding: '16px', borderTop: '1px solid #E9ECEF',
                                    display: 'flex', justifyContent: 'center', gap: '8px', background: '#F8F9FA'
                                }}>
                                    <Button
                                        size="sm" variant="ghost"
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(prev => prev - 1)}
                                    >이전</Button>

                                    {Array.from({ length: teacherPageCount }, (_, i) => i + 1).map(page => (
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
                                        disabled={currentPage === teacherPageCount}
                                        onClick={() => setCurrentPage(prev => prev + 1)}
                                    >다음</Button>
                                </div>
                            )}
                        </div>
                    )}

                    {!teacherPage.loading && currentTab === 'pending' && (
                        <div>
                            {/* 신규 가입자가 정리된 계정 사이에 묻히지 않도록 분리해서 본다 */}
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                                {[
                                    { id: 'new', label: '🆕 신규 가입 대기', count: newSignupCount, color: '#DD6B20' },
                                    { id: 'revoked', label: '🧹 관리자 정리함', count: revokedTeacherCount, color: '#718096' }
                                ].map(group => {
                                    const isActive = pendingGroup === group.id;
                                    return (
                                        <button
                                            key={group.id}
                                            onClick={() => { setPendingGroup(group.id); setCurrentPage(1); }}
                                            style={{
                                                padding: '8px 16px', borderRadius: '20px', cursor: 'pointer',
                                                fontSize: '0.88rem', fontWeight: isActive ? 800 : 500,
                                                border: `1px solid ${isActive ? group.color : '#E2E8F0'}`,
                                                background: isActive ? group.color : 'white',
                                                color: isActive ? 'white' : '#4A5568'
                                            }}
                                        >
                                            {group.label} {group.count}
                                        </button>
                                    );
                                })}
                            </div>

                            {pendingGroup === 'revoked' && (
                                <div style={{
                                    padding: '12px 16px', marginBottom: '16px', borderRadius: '8px',
                                    background: '#F7FAFC', border: '1px solid #E2E8F0', color: '#4A5568', fontSize: '0.85rem'
                                }}>
                                    관리자가 승인을 취소한 계정입니다. 본인이 정보를 다시 저장해도 자동 승인되지 않으며,
                                    여기서 <strong>가입 승인</strong>을 눌러야만 다시 사용할 수 있습니다.
                                </div>
                            )}

                            {teacherPage.items.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px', color: '#A0AEC0' }}>
                                    {pendingGroup === 'new' ? '승인 대기 중인 요청이 없습니다. 🎉' : '정리된 계정이 없습니다.'}
                                </div>
                            ) : (
                                <>
                                    {teacherPage.items.map(profile => {
                                            const teacherInfo = Array.isArray(profile.teachers) ? profile.teachers[0] : profile.teachers;
                                            const displayName = teacherInfo?.name || profile.full_name || '이름 없음';
                                            return (
                                                <TeacherItem
                                                    key={profile.id}
                                                    profile={profile}
                                                    onAction={() => handleApprove(profile.id, displayName)}
                                                    actionLabel="가입 승인"
                                                    actionColor="#38A169"
                                                />
                                            );
                                        })}

                                    {/* Pagination for Pending */}
                                    {teacherPage.totalCount > ITEMS_PER_PAGE && (
                                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
                                            <Button
                                                size="sm" variant="ghost"
                                                disabled={currentPage === 1}
                                                onClick={() => setCurrentPage(prev => prev - 1)}
                                            >이전</Button>
                                            {Array.from({ length: teacherPageCount }, (_, i) => i + 1).map(page => (
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
                                                disabled={currentPage === teacherPageCount}
                                                onClick={() => setCurrentPage(prev => prev + 1)}
                                            >다음</Button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {currentTab === 'usage' && (
                        <AdminUsagePanel
                            teachers={usage.teachers}
                            overview={usage.overview}
                            loading={usage.loading}
                            error={usage.error}
                            dormantDays={usage.dormantDays}
                            setDormantDays={usage.setDormantDays}
                            activityDays={usage.activityDays}
                            setActivityDays={usage.setActivityDays}
                            onRefresh={usage.refresh}
                        />
                    )}

                    <KeepAlivePanel
                        active={currentTab === 'service'}
                        visited={visitedTabs.has('service')}
                    >
                        <AdminServicePanel />
                    </KeepAlivePanel>

                    <KeepAlivePanel
                        active={currentTab === 'students'}
                        visited={visitedTabs.has('students')}
                    >
                        <AdminStudentActivityPanel defaultActivityDays={usage.activityDays} />
                    </KeepAlivePanel>

                    <KeepAlivePanel
                        active={currentTab === 'dormant'}
                        visited={visitedTabs.has('dormant')}
                    >
                        <AdminDormantPanel
                            dormantTeachers={usage.dormantTeachers}
                            dormantDays={usage.dormantDays}
                            setDormantDays={usage.setDormantDays}
                            loading={usage.loading}
                            onRefresh={async (options) => {
                                await usage.refresh(options);
                            }}
                        />
                    </KeepAlivePanel>

                    <KeepAlivePanel
                        active={currentTab === 'cleanup'}
                        visited={visitedTabs.has('cleanup')}
                    >
                        <AdminCleanupPanel
                            cleanupCandidates={usage.cleanupCandidates}
                            loading={usage.loading}
                            onRefresh={async (options) => {
                                await usage.refresh(options);
                            }}
                        />
                    </KeepAlivePanel>

                    <KeepAlivePanel
                        active={currentTab === 'lab'}
                        visited={visitedTabs.has('lab')}
                    >
                        <AdminLabManagementPanel />
                    </KeepAlivePanel>

                    <KeepAlivePanel
                        active={currentTab === 'vocab'}
                        visited={visitedTabs.has('vocab')}
                    >
                        <React.Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#718096' }}>어휘 검수 화면을 불러오는 중입니다...</div>}>
                            <AdminVocabReviewPanel />
                        </React.Suspense>
                    </KeepAlivePanel>

                    <KeepAlivePanel
                        active={currentTab === 'spelling'}
                        visited={visitedTabs.has('spelling')}
                    >
                        <React.Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#718096' }}>맞춤법 승격 화면을 불러오는 중입니다...</div>}>
                            <AdminSpellingPromotionPanel />
                        </React.Suspense>
                    </KeepAlivePanel>

                    <KeepAlivePanel
                        active={currentTab === 'backup'}
                        visited={visitedTabs.has('backup')}
                    >
                        <AdminBackupPanel />
                    </KeepAlivePanel>

                    {currentTab === 'settings' && (
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
                                            모든 교사에게 제공되는 시스템 공용 AI 서비스의 사용 여부를 설정합니다.
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <span style={{ fontWeight: 'bold', color: publicAiEnabled ? '#38A169' : '#E53E3E' }}>
                                            {publicAiEnabled ? '공용 AI 사용 가능' : '공용 AI 일시 중단'}
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

                    <KeepAlivePanel
                        active={currentTab === 'feedback'}
                        visited={visitedTabs.has('feedback')}
                    >
                        <AdminFeedbackList onFeedbackUpdated={fetchFeedbackCount} />
                    </KeepAlivePanel>

                    <KeepAlivePanel
                        active={currentTab === 'announcements'}
                        visited={visitedTabs.has('announcements')}
                    >
                        <AdminAnnouncementManager />
                    </KeepAlivePanel>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
