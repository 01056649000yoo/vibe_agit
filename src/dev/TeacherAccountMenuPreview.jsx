import TeacherAccountMenu from '../components/teacher/TeacherAccountMenu.jsx';
import '../components/teacher/TeacherDashboard.css';

// 계정 메뉴의 관리자 새 문의 빨간 불(2026-10-05) — 관리자·문의 있음 / 관리자·문의 없음 / 일반 교사 / 휴대폰(이름 숨김).
const noop = () => {};
const CASES = [
    { label: '관리자 · 새 문의 3건', props: { teacherName: '유승현', isAdmin: true, inquiryCount: 3 } },
    { label: '관리자 · 문의 없음', props: { teacherName: '유승현', isAdmin: true, inquiryCount: 0 } },
    { label: '일반 교사(빨간 불 없음)', props: { teacherName: '김선생', isAdmin: false, inquiryCount: 0 } },
    { label: '휴대폰(이름 숨김) · 새 문의 1건', props: { teacherName: '', isAdmin: true, inquiryCount: 1 } },
];

export default function TeacherAccountMenuPreview() {
    return (
        <div style={{ display: 'grid', gap: 18, padding: 24, background: 'var(--ui-surface-muted, #f8fafc)' }}>
            {CASES.map(({ label, props }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 16px', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', minHeight: 120 }}>
                    <span style={{ color: '#475569', fontWeight: 700 }}>{label}</span>
                    <TeacherAccountMenu {...props} onOpenAdmin={noop} onEditProfile={noop} onLogout={noop} />
                </div>
            ))}
        </div>
    );
}
