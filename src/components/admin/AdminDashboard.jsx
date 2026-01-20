import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';

// 반복되는 리스트 아이템 컴포넌트 분리
const TeacherItem = ({ profile, onAction, actionLabel, actionColor, isRevoke }) => {
    // teachers 정보 안전하게 추출
    const teacherInfo = Array.isArray(profile.teachers) ? profile.teachers[0] : profile.teachers;
    const displayName = teacherInfo?.name || profile.full_name || '이름 없음';
    const schoolName = teacherInfo?.school_name || '학교 정보 없음';
    const displayPhone = teacherInfo?.phone || '-';

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px',
            background: '#F8F9FA',
            borderRadius: '12px',
            border: '1px solid #E9ECEF',
            flexWrap: 'wrap',
            gap: '16px'
        }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: '900', color: '#2C3E50' }}>{displayName}</span>
                    <span style={{ fontSize: '0.85rem', color: '#7F8C8D', background: '#E9ECEF', padding: '2px 8px', borderRadius: '6px' }}>
                        {schoolName}
                    </span>
                    {isRevoke && <span style={{ fontSize: '0.8rem', color: '#27AE60', fontWeight: 'bold' }}>• 정상 이용 중</span>}
                </div>
                <div style={{ fontSize: '0.9rem', color: '#546E7A', lineHeight: '1.4' }}>
                    📧 {profile.email} &nbsp;|&nbsp; 📞 {displayPhone}<br />
                    🕒 가입일: {new Date(profile.created_at).toLocaleDateString()}
                </div>
            </div>
            <Button
                onClick={onAction}
                size="sm"
                style={{
                    background: isRevoke ? '#FFF' : actionColor,
                    color: isRevoke ? actionColor : 'white',
                    border: isRevoke ? `1px solid ${actionColor}` : 'none',
                    fontWeight: 'bold',
                    padding: '8px 16px',
                    borderRadius: '8px'
                }}
            >
                {actionLabel}
            </Button>
        </div>
    );
};

const AdminDashboard = ({ session, onLogout, onSwitchToTeacherMode }) => {
    const [pendingTeachers, setPendingTeachers] = useState([]);
    const [approvedTeachers, setApprovedTeachers] = useState([]); // [추가] 가입된(승인된) 교사 목록
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchTeachers();
    }, []);

    const fetchTeachers = async () => {
        setLoading(true);
        setError(null);
        try {
            console.log("🔄 교사 목록 조회 시작...");

            // 승인 대기 / 승인 완료 모두 조회
            const { data, error: fetchError } = await supabase
                .from('profiles')
                .select(`
                    *,
                    teachers!left (
                        name,
                        school_name,
                        phone
                    )
                `)
                .eq('role', 'TEACHER')
                .order('created_at', { ascending: false });

            if (fetchError) throw fetchError;

            // 목록 분리 (대기 / 승인)
            const pending = data.filter(p => p.is_approved !== true);
            const approved = data.filter(p => p.is_approved === true);

            setPendingTeachers(pending);
            setApprovedTeachers(approved);

            console.log(`✅ 대기: ${pending.length}명, 승인됨: ${approved.length}명`);

        } catch (err) {
            console.error('불러오기 실패 상세:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (teacherId, teacherName) => {
        if (!window.confirm(`'${teacherName}' 선생님의 가입을 승인하시겠습니까?`)) return;

        try {
            const { error } = await supabase
                .from('profiles')
                .update({ is_approved: true })
                .eq('id', teacherId);

            if (error) throw error;

            alert(`✅ '${teacherName}' 선생님이 승인되었습니다!`);
            fetchTeachers(); // 목록 갱신
        } catch (err) {
            alert('승인 처리 중 오류가 발생했습니다: ' + err.message);
        }
    };

    // [추가] 승인 취소 (필요 시 사용)
    const handleRevoke = async (teacherId, teacherName) => {
        if (!window.confirm(`'${teacherName}' 선생님의 승인을 취소하시겠습니까? (다시 대기 상태가 됩니다)`)) return;

        try {
            const { error } = await supabase
                .from('profiles')
                .update({ is_approved: false })
                .eq('id', teacherId);

            if (error) throw error;
            alert(`🚫 '${teacherName}' 선생님의 승인이 취소되었습니다.`);
            fetchTeachers();
        } catch (err) {
            alert('처리 중 오류가 발생했습니다: ' + err.message);
        }
    };

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '2rem', color: '#2C3E50', fontWeight: '900' }}>🛡️ 관리자 대시보드</h1>
                    <p style={{ margin: '8px 0 0 0', color: '#7F8C8D' }}>선생님 가입 승인 및 관리</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {/* [추가] 교사 모드로 이동 버튼 */}
                    <Button
                        onClick={onSwitchToTeacherMode}
                        variant="primary"
                        style={{ background: '#3498DB', border: 'none' }}
                    >
                        🏫 내 학급 관리하기 (교사 모드)
                    </Button>
                    <Button onClick={onLogout} variant="ghost">로그아웃</Button>
                </div>
            </div>

            {error && (
                <div style={{
                    background: '#FFEBEE', color: '#C62828', padding: '16px',
                    borderRadius: '12px', marginBottom: '20px', fontWeight: 'bold'
                }}>
                    ⚠️ 문제가 발생했습니다: {error}
                </div>
            )}

            {/* 1. 승인 대기 목록 */}
            <Card style={{ padding: '20px', marginBottom: '30px' }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', color: '#E67E22', borderBottom: '2px solid #F1F3F5', paddingBottom: '12px' }}>
                    ⏳ 승인 대기 ({pendingTeachers.length}명)
                </h3>

                {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#BDC3C7' }}>데이터를 불러오는 중...</div>
                ) : pendingTeachers.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#95A5A6' }}>
                        <p>승인 대기 중인 선생님이 없습니다.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {pendingTeachers.map((profile) => (
                            <TeacherItem
                                key={profile.id}
                                profile={profile}
                                onAction={() => handleApprove(profile.id, profile.teachers?.name || profile.full_name)}
                                actionLabel="승인하기"
                                actionColor="#2E7D32"
                            />
                        ))}
                    </div>
                )}
            </Card>

            {/* 2. [추가] 가입된 교사 목록 */}
            <Card style={{ padding: '20px' }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', color: '#2C3E50', borderBottom: '2px solid #F1F3F5', paddingBottom: '12px' }}>
                    ✅ 가입된 선생님 ({approvedTeachers.length}명)
                </h3>

                {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#BDC3C7' }}>데이터를 불러오는 중...</div>
                ) : approvedTeachers.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#95A5A6' }}>
                        <p>가입된 선생님이 없습니다.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {approvedTeachers.map((profile) => (
                            <TeacherItem
                                key={profile.id}
                                profile={profile}
                                onAction={() => handleRevoke(profile.id, profile.teachers?.name || profile.full_name)}
                                actionLabel="승인 취소"
                                actionColor="#C0392B"
                                isRevoke={true}
                            />
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
};

export default AdminDashboard;
