import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';

const AdminDashboard = ({ session, onLogout }) => {
    const [pendingTeachers, setPendingTeachers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPendingTeachers();
    }, []);

    const fetchPendingTeachers = async () => {
        setLoading(true);
        try {
            // 승인 대기 중인(is_approved = false) 선생님(role = 'TEACHER') 조회
            // teachers 테이블 정보도 함께 가져오기 (Foreign Key가 설정되어 있다고 가정)
            // 만약 FK 설정이 안되어 있다면 profiles만 가져와서 렌더링하도록 예외 처리 필요
            const { data, error } = await supabase
                .from('profiles')
                .select(`
                    *,
                    teachers (
                        name,
                        school_name,
                        phone
                    )
                `)
                .eq('role', 'TEACHER')
                .eq('is_approved', false)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setPendingTeachers(data || []);
        } catch (err) {
            console.error('불러오기 실패:', err.message);
            // alert('데이터를 불러오는 중 오류가 발생했습니다.');
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
            fetchPendingTeachers(); // 목록 갱신
        } catch (err) {
            alert('승인 처리 중 오류가 발생했습니다: ' + err.message);
        }
    };

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '2rem', color: '#2C3E50', fontWeight: '900' }}>🛡️ 관리자 대시보드</h1>
                    <p style={{ margin: '8px 0 0 0', color: '#7F8C8D' }}>가입 신청한 선생님들을 확인하고 승인해주세요.</p>
                </div>
                <Button onClick={onLogout} variant="ghost">로그아웃</Button>
            </div>

            <Card style={{ padding: '20px' }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', color: '#34495E', borderBottom: '2px solid #F1F3F5', paddingBottom: '12px' }}>
                    ⏳ 승인 대기 목록 ({pendingTeachers.length}명)
                </h3>

                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#BDC3C7' }}>데이터를 불러오는 중...</div>
                ) : pendingTeachers.length === 0 ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: '#95A5A6' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>✨</div>
                        <p>현재 승인 대기 중인 선생님이 없습니다.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {pendingTeachers.map((profile) => {
                            // teachers 테이블 데이터가 배열이나 객체로 올 수 있음 (Supabase 버전에 따라 다름)
                            const teacherInfo = Array.isArray(profile.teachers) ? profile.teachers[0] : profile.teachers;
                            const displayName = teacherInfo?.name || profile.full_name || '이름 없음';
                            const schoolName = teacherInfo?.school_name || '학교 정보 없음';
                            const displayPhone = teacherInfo?.phone || '-';

                            return (
                                <div key={profile.id} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '24px',
                                    background: '#F8F9FA',
                                    borderRadius: '16px',
                                    border: '1px solid #E9ECEF',
                                    flexWrap: 'wrap',
                                    gap: '16px'
                                }}>
                                    <div style={{ flex: 1, minWidth: '200px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '1.2rem', fontWeight: '900', color: '#2C3E50' }}>{displayName}</span>
                                            <span style={{ fontSize: '0.9rem', color: '#7F8C8D', background: '#E9ECEF', padding: '2px 8px', borderRadius: '6px' }}>
                                                {schoolName}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.9rem', color: '#546E7A', lineHeight: '1.5' }}>
                                            📧 {profile.email}<br />
                                            📞 {displayPhone}<br />
                                            🕒 신청일: {new Date(profile.created_at).toLocaleString()}
                                        </div>
                                    </div>
                                    <Button
                                        onClick={() => handleApprove(profile.id, displayName)}
                                        style={{
                                            background: '#2E7D32',
                                            color: 'white',
                                            fontWeight: 'bold',
                                            padding: '12px 24px',
                                            borderRadius: '12px'
                                        }}
                                    >
                                        ✅ 승인하기
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>
        </div>
    );
};

export default AdminDashboard;
