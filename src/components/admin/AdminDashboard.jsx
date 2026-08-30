import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';
import AdminFeedbackList from './AdminFeedbackList';
import AdminAnnouncementManager from './AdminAnnouncementManager';
import AdminUsagePanel from './AdminUsagePanel';
import AdminStudentActivityPanel from './AdminStudentActivityPanel';
import AdminDormantPanel from './AdminDormantPanel';
import AdminLabManagementPanel from './AdminLabManagementPanel';
import AdminBackupPanel from './AdminBackupPanel';
import AdminServicePanel from './AdminServicePanel';
import AdminServiceManagementPanel from './AdminServiceManagementPanel';
import AdminDashboardOverview from './AdminDashboardOverview';
import AdminHomeButton from './AdminHomeButton';
import { useAdminHealthSummary } from './useAdminHealthSummary';
import { useAdminServiceManagement } from './useAdminServiceManagement';
import useAdminUsage from '../../hooks/useAdminUsage';
import useAdminTeacherAccountsPage from '../../hooks/useAdminTeacherAccountsPage';

const AdminVocabReviewPanel = React.lazy(() => import('./AdminVocabReviewPanel'));
// 500개 카탈로그를 함께 읽어 대조하므로 무겁다 — 탭을 고를 때만 내려받는다.
const AdminSpellingPromotionPanel = React.lazy(() => import('./AdminSpellingPromotionPanel'));
const AdminNeighborAgitPanel = React.lazy(() => import('./AdminNeighborAgitPanel'));

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
            { id: 'active', label: '전체 명단' },
            { id: 'pending', label: '승인 대기' },
            { id: 'dormant', label: '장기 미접속' }
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
            { id: 'maintenance', label: '서비스 관리' },
            { id: 'backup', label: '백업 상태' },
            { id: 'rollout', label: '기능 공개' },
            { id: 'announcements', label: '공지사항' },
            { id: 'feedback', label: '의견 제보' },
            { id: 'settings', label: '시스템 설정' }
        ]
    }
];

/**
 * 모든 화면 탭이 쓰는 한 가지 생김새.
 *
 * 예전에는 큰 묶음만 단추처럼 그리고 그 안의 화면은 맨 글자로 그렸다. 그러면 눈에는 탭이 넷만
 * 보이고 나머지 열넷은 숨은 것처럼 느껴진다. 같은 층에 있는 것은 같게 그린다.
 */
const AdminTabButton = ({ tab, isActive, badge, onSelect, urgent = false }) => (
    <button
        type="button"
        onClick={() => onSelect(tab.id)}
        aria-current={isActive ? 'page' : undefined}
        style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            border: `1px solid ${isActive ? '#2B6CB0' : (urgent ? '#FEB2B2' : '#E2E8F0')}`,
            background: isActive ? '#EBF8FF' : (urgent ? '#FFF5F5' : 'white'),
            color: isActive ? '#2B6CB0' : (urgent ? '#C53030' : '#4A5568'),
            fontWeight: isActive ? 800 : 600,
            fontSize: '0.88rem', padding: '7px 12px',
            borderRadius: '9px', cursor: 'pointer', whiteSpace: 'nowrap'
        }}
    >
        {tab.label}
        {badge > 0 && (
            <span style={{
                background: '#E53E3E', color: 'white', fontSize: '0.68rem',
                padding: '1px 6px', borderRadius: '10px', fontWeight: 'bold'
            }}>{badge}</span>
        )}
    </button>
);


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

const PaginationControls = ({ page, pageCount, totalCount, pageSize, onPageChange }) => {
    if (totalCount <= pageSize) return null;
    const start = ((page - 1) * pageSize) + 1;
    const end = Math.min(page * pageSize, totalCount);

    return (
        <div style={{
            padding: '16px', borderTop: '1px solid #E9ECEF',
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px',
            flexWrap: 'wrap', background: '#F8F9FA'
        }}>
            <Button size="sm" variant="ghost" disabled={page === 1} onClick={() => onPageChange(page - 1)}>이전</Button>
            <span style={{ color: '#4A5568', fontSize: '0.85rem', fontWeight: 700 }}>{start}–{end} / 총 {totalCount}명</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#718096', fontSize: '0.82rem' }}>
                페이지
                <select
                    value={page}
                    onChange={(event) => onPageChange(Number(event.target.value))}
                    style={{ padding: '5px 8px', border: '1px solid #CBD5E0', borderRadius: '7px', background: 'white' }}
                >
                    {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
                        <option key={pageNumber} value={pageNumber}>{pageNumber}</option>
                    ))}
                </select>
                / {pageCount}
            </label>
            <Button size="sm" variant="ghost" disabled={page === pageCount} onClick={() => onPageChange(page + 1)}>다음</Button>
        </div>
    );
};

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
    const ITEMS_PER_PAGE = 25;

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

    // 사용량·장기 미접속은 DB에서 한 번에 집계해서 받는다 (useAdminUsage)
    const usage = useAdminUsage();

    // States for UI
    // 'active' | 'pending' | 'usage' | 'students' | 'dormant' | 'lab' | 'vocab' | 'spelling' | 'service' | 'maintenance' | 'backup' | 'feedback' | 'announcements' | 'settings'
    // 지금 고른 화면이 어느 묶음에 드는지는 따로 저장하지 않고 화면 id 하나에서 끌어낸다.
    // 두 곳에 나눠 두면 통계 카드로 건너뛸 때 묶음만 남아 어긋난다.

    // 화면 이름 옆·묶음 이름 옆에 함께 쓰는 "처리할 일" 개수.
    const health = useAdminHealthSummary();
    const serviceManagement = useAdminServiceManagement();
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
    const backupHasAppRecords = (health.summary?.backupAppRecorded || 0) > 0;
    const backupTone = health.summary == null
        ? '#A0AEC0'
        : health.summary.backupAttentionCount > 0
            ? '#E53E3E'
            : !backupHasAppRecords ? '#A0AEC0' : '#48BB78';
    const backupValue = health.summary == null
        ? '확인 중'
        : health.summary.backupAttentionCount > 0
            ? `${health.summary.backupAttentionCount}개 확인`
            : !backupHasAppRecords
                ? '앱별 기록 대기'
                : `${health.summary.backupAppPassed}/${health.summary.backupExpectedApps} 정상`;

    // 시스템 값을 잰 시각. 없으면 아직 건강검진이 한 번도 안 돈 것이다.
    const sampledAtLabel = health.summary?.resourceSampledAt
        ? new Intl.DateTimeFormat('ko-KR', {
            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul'
        }).format(new Date(health.summary.resourceSampledAt))
        : '';

    const overviewGroups = [
        {
            id: 'today',
            title: '오늘 이용 현황',
            description: '한국 시간 0시부터 지금까지',
            tone: 'today',
            items: [
                { id: 'today-teachers', label: '오늘 접속 교사', basis: '오늘 로그인한 사람', value: health.summary?.todayTeachers != null ? `${health.summary.todayTeachers}명` : '확인 중', color: '#2F855A', icon: '👩‍🏫', onOpen: () => setCurrentTab('service') },
                { id: 'today-students', label: '오늘 접속 학생', basis: '오늘 로그인한 사람', value: health.summary?.todayStudents != null ? `${health.summary.todayStudents}명` : '확인 중', color: '#2B6CB0', icon: '🧒', onOpen: () => setCurrentTab('service') },
                { id: 'today-posts', label: '오늘 제출글', basis: '오늘 낸 글', value: health.summary?.todaySubmittedPosts != null ? `${health.summary.todaySubmittedPosts}편` : '확인 중', color: '#6B46C1', icon: '📝', onOpen: () => setCurrentTab('service') }
            ]
        },
        {
            id: 'actions',
            title: '지금 확인할 일',
            description: '누르면 처리 화면으로 이동',
            tone: 'actions',
            items: [
                { id: 'alerts', label: '서버 조치 필요', basis: '처리 안 된 것', value: health.summary ? `${health.summary.openAlertCount}건` : '확인 중', color: health.summary?.openAlertCount > 0 ? '#E53E3E' : '#38A169', icon: '🚨', onOpen: () => setCurrentTab('service') },
                { id: 'pending', label: '신규 승인 대기', basis: '승인 안 된 교사', value: `${newSignupCount}명`, color: '#DD6B20', icon: '⏳', onOpen: () => setCurrentTab('pending') },
                { id: 'dormant', label: '장기 미접속', basis: `${usage.dormantDays}일 이상 · 휴면 ${usage.dormantAccounts.length}명 포함`, value: `${usage.inactiveTeachers.length}명`, color: '#B7791F', icon: '😴', onOpen: () => setCurrentTab('dormant') },
                { id: 'feedback', label: '새 의견 제보', basis: '읽지 않은 것', value: `${pendingFeedbackCount}건`, color: '#6B46C1', icon: '📢', onOpen: () => setCurrentTab('feedback') }
            ]
        },
        {
            id: 'usage',
            title: '이용 현황',
            // 이 묶음은 기준이 하나가 아니다 — 누적과 최근 N일이 섞여 있어 머리말에 한 기간만 적으면
            // 누적 숫자를 그 기간의 숫자로 잘못 읽는다. 기준은 항목마다 적는다.
            description: '항목마다 기준이 다릅니다',
            tone: 'usage',
            items: [
                { id: 'teachers', label: '가입 선생님', basis: '지금까지 전체', value: usage.overview ? `${usage.overview.teacher_total}명` : '확인 중', color: '#2D3748', icon: '👩‍🏫', onOpen: () => setCurrentTab('usage') },
                { id: 'active-teachers', label: '활동 교사', basis: `최근 ${usage.activityDays}일 학생 글 있음`, value: usage.overview ? `${usage.overview.teacher_active}명` : '확인 중', color: '#2F855A', icon: '🟢', onOpen: () => setCurrentTab('usage') },
                { id: 'classes', label: '운영 학급', basis: '지금까지 전체', value: usage.overview ? `${usage.overview.class_total}개` : '확인 중', color: '#2B6CB0', icon: '🏫', onOpen: () => setCurrentTab('usage') },
                { id: 'students', label: '등록 학생', basis: '지금까지 전체', value: usage.overview ? `${usage.overview.student_total}명` : '확인 중', color: '#2B6CB0', icon: '🧒', onOpen: () => setCurrentTab('students') },
                { id: 'writing-students', label: '글쓰기 학생', basis: `최근 ${usage.activityDays}일`, value: usage.overview ? `${usage.overview.student_active}명` : '확인 중', color: '#2F855A', icon: '✍️', onOpen: () => setCurrentTab('students') },
                { id: 'posts', label: '작성 글', basis: `최근 ${usage.activityDays}일`, value: usage.overview ? `${usage.overview.post_recent}개` : '확인 중', color: '#2F855A', icon: '📝', onOpen: () => setCurrentTab('usage') }
            ]
        },
        {
            id: 'system',
            title: '시스템 상태',
            // 시스템 값은 기간이 아니라 **언제 잰 것인가**가 기준이다. 잰 시각을 적어 두지 않으면
            // 며칠 전 표본을 지금 상태로 읽는다.
            description: sampledAtLabel ? `${sampledAtLabel}에 잰 값` : '아직 측정 기록 없음',
            tone: 'system',
            items: [
                { id: 'containers', label: '컨테이너', basis: '살아 있는 수 / 전체', value: health.summary ? `${health.summary.containerHealthy ?? '?'}/${health.summary.containerTotal ?? '?'}` : '확인 중', color: containerTone, icon: '📦', onOpen: () => setCurrentTab('service') },
                { id: 'backups', label: '앱 백업', basis: '최근 통합 백업의 앱별 결과', value: backupValue, color: backupTone, icon: '🛟', onOpen: () => setCurrentTab('backup') },
                { id: 'disk', label: '디스크 여유', basis: '잰 순간의 남은 용량', value: health.summary?.diskFreeGb != null ? `${health.summary.diskFreeGb}GB` : '확인 중', color: diskTone, icon: '💾', onOpen: () => setCurrentTab('service') },
                { id: 'memory', label: '맥 메모리/스왑', basis: '잰 순간의 값', value: health.summary?.hostMemoryAvailablePct != null && health.summary?.hostSwapUsedMb != null ? `${health.summary.hostMemoryAvailablePct}% / ${health.summary.hostSwapUsedMb}MB` : '확인 중', color: hostMemoryTone, icon: '🧠', onOpen: () => setCurrentTab('service') },
                { id: 'maintenance', label: '서비스 점검', basis: '분기 점검·최근 이미지 CVE', value: serviceManagement.data ? (serviceManagement.data.summary?.review_initialized || serviceManagement.data.summary?.scan_initialized ? `${serviceManagement.data.summary?.attention_count || 0}건 확인` : '첫 점검 대기') : '확인 중', color: serviceManagement.data?.summary?.attention_count > 0 ? '#E53E3E' : '#2F855A', icon: '🧰', onOpen: () => setCurrentTab('maintenance') }
            ]
        }
    ];

    const tabBadges = useMemo(() => ({
        pending: newSignupCount,
        dormant: usage.inactiveTeachers.length,
        feedback: pendingFeedbackCount,
        backup: health.summary?.backupAttentionCount || 0,
        maintenance: serviceManagement.data?.summary?.attention_count || 0
    }), [newSignupCount, usage.inactiveTeachers.length, pendingFeedbackCount, health.summary?.backupAttentionCount, serviceManagement.data?.summary?.attention_count]);

    /*
     * 처리할 일이 있는 화면만 앞으로 뽑는다. 나머지는 늘 같은 묶음 순서 그대로라
     * 손이 기억하는 자리가 흔들리지 않는다. 할 일이 없으면 앞 칸 자체가 사라진다.
     */
    const urgentTabs = TAB_GROUPS.flatMap((group) => group.tabs).filter((tab) => (tabBadges[tab.id] || 0) > 0);
    const urgentIds = new Set(urgentTabs.map((tab) => tab.id));
    const restGroups = TAB_GROUPS
        .map((group) => ({ ...group, tabs: group.tabs.filter((tab) => !urgentIds.has(tab.id)) }))
        .filter((group) => group.tabs.length > 0);

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

    const handleGoHome = () => {
        setCurrentTab('active');
        setSearchTerm('');
        setCurrentPage(1);
        setPendingGroup('new');

        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    };

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 20px 104px', fontFamily: "'Pretendard', sans-serif" }}>
            <AdminHomeButton onGoHome={handleGoHome} isHome={currentTab === 'active'} />

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

            {currentTab === 'active' && <AdminDashboardOverview groups={overviewGroups} />}

            {/* Main Content Area */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/*
                  * 화면 14개를 **한 줄에 모두** 편다.
                  *
                  * 예전에는 큰 묶음 4개(1단) → 그 안의 화면(2단) 두 층이었다. 그래서 어느 화면이든
                  * 예외 없이 두 번을 눌러야 했고(`검수` → `맞춤법 승격`), 화면이 2개뿐인 `현황` 도
                  * 층을 하나 통째로 썼다. 게다가 1단만 단추처럼 생기고 2단은 맨 글자라
                  * **눈에는 탭이 넷만 보였다**(2026-08-28 확인).
                  *
                  * 이제 한 번만 누르면 되고, 묶음은 사이 구분선으로만 남긴다.
                  * 처리할 일이 있는 화면은 맨 앞 `지금 할 일` 칸으로 나온다 — 자리가 흔들리는 것이
                  * 아니라 **일이 생겼다는 표시**다. 할 일이 없으면 늘 같은 순서 그대로다.
                  */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '7px', borderBottom: '2px solid #E2E8F0', paddingBottom: '14px' }}>
                    {urgentTabs.length > 0 && (
                        <>
                            <span style={{ color: '#C53030', fontSize: '0.78rem', fontWeight: 900, paddingRight: '2px' }}>지금 할 일</span>
                            {urgentTabs.map(tab => <AdminTabButton
                                key={`urgent-${tab.id}`} tab={tab} isActive={currentTab === tab.id}
                                badge={tabBadges[tab.id]} onSelect={setCurrentTab} urgent
                            />)}
                            <span style={{ width: '1px', height: '20px', background: '#CBD5E0', margin: '0 5px' }} />
                        </>
                    )}
                    {restGroups.map((group, groupIndex) => (
                        <React.Fragment key={group.id}>
                            {groupIndex > 0 && <span style={{ width: '1px', height: '20px', background: '#E2E8F0', margin: '0 5px' }} />}
                            <span style={{ color: '#A0AEC0', fontSize: '0.76rem', fontWeight: 800, paddingRight: '1px' }}>{group.label}</span>
                            {group.tabs.map(tab => <AdminTabButton
                                key={tab.id} tab={tab} isActive={currentTab === tab.id}
                                badge={tabBadges[tab.id]} onSelect={setCurrentTab}
                            />)}
                        </React.Fragment>
                    ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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
                                <div style={{ textAlign: 'center', padding: '60px', color: '#A0AEC0' }}>등록된 선생님이 없습니다.</div>
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

                            <PaginationControls
                                page={currentPage}
                                pageCount={teacherPageCount}
                                totalCount={teacherPage.totalCount}
                                pageSize={ITEMS_PER_PAGE}
                                onPageChange={setCurrentPage}
                            />
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

                                    <PaginationControls
                                        page={currentPage}
                                        pageCount={teacherPageCount}
                                        totalCount={teacherPage.totalCount}
                                        pageSize={ITEMS_PER_PAGE}
                                        onPageChange={setCurrentPage}
                                    />
                                </>
                            )}
                        </div>
                    )}

                    {currentTab === 'usage' && (
                        <AdminUsagePanel
                            teachers={usage.teachers}
                            loading={usage.loading}
                            error={usage.error}
                            dormantDays={usage.dormantDays}
                            dormantAccountDays={usage.dormantAccountDays}
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
                            longInactiveTeachers={usage.longInactiveTeachers}
                            dormantAccounts={usage.dormantAccounts}
                            dormantDays={usage.dormantDays}
                            dormantAccountDays={usage.dormantAccountDays}
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

                    <KeepAlivePanel
                        active={currentTab === 'maintenance'}
                        visited={visitedTabs.has('maintenance')}
                    >
                        <AdminServiceManagementPanel serviceManagement={serviceManagement} />
                    </KeepAlivePanel>

                    <KeepAlivePanel
                        active={currentTab === 'rollout'}
                        visited={visitedTabs.has('rollout')}
                    >
                        <React.Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#718096' }}>기능 공개 화면을 불러오는 중입니다...</div>}>
                            <AdminNeighborAgitPanel />
                        </React.Suspense>
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
