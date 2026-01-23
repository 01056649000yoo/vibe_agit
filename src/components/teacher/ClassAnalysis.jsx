import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { motion } from 'framer-motion';

// 학급 학습 현황 분석 컴포넌트
const ClassAnalysis = ({ classId, isMobile }) => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        studentCount: 0,
        avgChars: 0,
        submissionRate: 0,
        topStudents: [],
        notSubmitted: [],
        trendData: [],
        todayRate: 0
    });

    useEffect(() => {
        if (classId) fetchAnalysisData();
    }, [classId]);

    const fetchAnalysisData = async () => {
        setLoading(true);
        try {
            // 1. 기초 데이터 로드 (학생, 미션, 제출물)
            const { data: students, error: sErr } = await supabase.from('students').select('id, name').eq('class_id', classId);
            if (sErr || !students || students.length === 0) {
                setStats(prev => ({ ...prev, studentCount: 0 }));
                setLoading(false);
                return;
            }

            const [
                { data: missions },
                { data: posts }
            ] = await Promise.all([
                supabase.from('writing_missions').select('id, title, created_at').eq('class_id', classId).eq('is_archived', false).order('created_at', { ascending: false }),
                supabase.from('student_posts').select('*').in('student_id', students.map(s => s.id))
            ]);

            // 2. 통계 계산
            const totalChars = posts?.reduce((sum, p) => sum + (p.char_count || 0), 0) || 0;
            const avgChars = students.length > 0 ? Math.round(totalChars / students.length) : 0;

            // 학생별 제출 현황 및 랭킹
            const studentStats = students.map(s => {
                const myPosts = posts?.filter(p => p.student_id === s.id && p.is_submitted) || [];
                const myChars = myPosts.reduce((sum, p) => sum + (p.char_count || 0), 0);
                return { name: s.name, count: myPosts.length, chars: myChars };
            });

            const topStudents = studentStats.sort((a, b) => b.chars - a.chars).slice(0, 5);

            // 미제출자 파악 (가장 최근 미션 기준)
            let notSubmittedStudents = [];
            if (missions && missions.length > 0) {
                const latestMissionId = missions[0].id;
                const submittedPosts = posts ? posts.filter(p => p.mission_id === latestMissionId && p.is_submitted) : [];
                const submittedIds = new Set(submittedPosts.map(p => p.student_id));
                notSubmittedStudents = students.filter(s => !submittedIds.has(s.id)).map(s => s.name);
            }

            // 제출 트렌드 (최근 7일)
            const trend = Array.from({ length: 7 }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dayStr = d.toISOString().split('T')[0];
                const count = posts ? posts.filter(p => p.is_submitted && p.created_at?.startsWith(dayStr)).length : 0;
                return { date: dayStr, count };
            }).reverse();

            // 최근 미션별 완료율 (상위 4개)
            const recentMissions = missions ? missions.slice(0, 4) : [];
            const missionRates = recentMissions.map(m => {
                const submittedCount = posts ? posts.filter(p => p.mission_id === m.id && p.is_submitted).length : 0;
                const rate = students.length > 0 ? Math.round((submittedCount / students.length) * 100) : 0;
                return { id: m.id, title: m.title, rate };
            });

            setStats({
                studentCount: students.length,
                avgChars,
                submissionRate: posts?.length || 0,
                topStudents,
                notSubmitted: notSubmittedStudents,
                trendData: trend,
                missionRates // [수정] 미션별 완료율 데이터 추가
            });
        } catch (err) {
            console.error('분석 데이터 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div style={{ padding: '24px', background: 'white', borderRadius: '24px', border: '1px solid #E9ECEF', boxShadow: '0 2px 12px rgba(0,0,0,0.03)' }}>
                <div style={{ height: '24px', width: '200px', background: '#F1F3F5', borderRadius: '4px', marginBottom: '24px', animation: 'pulse 1.5s infinite' }} />
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '20px' }}>
                    {[1, 2, 3].map(i => (
                        <div key={i} style={{ height: '120px', background: '#F8F9FA', borderRadius: '16px', animation: 'pulse 1.5s infinite' }} />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <section style={{
            background: 'white', borderRadius: '24px', padding: isMobile ? '20px' : '28px',
            border: '1px solid #E9ECEF', boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
            width: '100%', boxSizing: 'border-box'
        }}>
            <h3 style={{ margin: '0 0 24px 0', fontSize: '1.2rem', color: '#2C3E50', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px' }}>
                📊 학급 학습 활동 분석판
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '24px' }}>
                {/* 1. 핵심 지표 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ background: '#E3F2FD', padding: '20px', borderRadius: '20px', border: '1px solid #BBDEFB' }}>
                        <div style={{ fontSize: '0.85rem', color: '#1976D2', fontWeight: 'bold', marginBottom: '8px' }}>✍️ 학급 평균 글자 수</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#0D47A1' }}>{stats.avgChars.toLocaleString()}자</div>
                    </div>

                    <div style={{ background: '#F8F9FA', padding: '16px', borderRadius: '20px', border: '1px solid #E9ECEF', flex: 1, overflowY: 'auto', maxHeight: '180px' }}>
                        <div style={{ fontSize: '0.85rem', color: '#666', fontWeight: 'bold', marginBottom: '12px' }}>📝 최근 미션 완료율</div>
                        {stats.missionRates && stats.missionRates.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {stats.missionRates.map(m => (
                                    <div key={m.id}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px', color: '#495057' }}>
                                            <span style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{m.title}</span>
                                            <span style={{ color: '#3498DB', fontWeight: '900' }}>{m.rate}%</span>
                                        </div>
                                        <div style={{ height: '8px', background: '#E0E0E0', borderRadius: '10px', overflow: 'hidden' }}>
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${m.rate}%` }}
                                                transition={{ duration: 1, ease: 'easeOut' }}
                                                style={{ height: '100%', background: 'linear-gradient(90deg, #3498DB, #5CC6FF)' }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', color: '#ADB5BD', fontSize: '0.8rem', marginTop: '20px' }}>미션 데이터가 없습니다.</div>
                        )}
                    </div>
                </div>

                {/* 2. 학생 랭킹 (열정 TOP 5) */}
                <div style={{ background: '#FDFCF0', padding: '20px', borderRadius: '24px', border: '1px solid #FFE082' }}>
                    <h4 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', color: '#795548', fontWeight: '900' }}>🔥 열정 작가 TOP 5</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {stats.topStudents.map((s, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                                <span style={{ color: '#5D4037', fontWeight: '700' }}>{i + 1}. {s.name}</span>
                                <span style={{ color: '#FBC02D', fontWeight: '900' }}>{s.chars.toLocaleString()}자</span>
                            </div>
                        ))}
                        {stats.topStudents.length === 0 && <p style={{ color: '#9E9E9E', fontSize: '0.8rem', textAlign: 'center', marginTop: '20px' }}>활동 내역이 없습니다.</p>}
                    </div>
                </div>

                {/* 3. 주의 깊게 볼 내용 (미제출 알림) */}
                <div style={{ background: '#FFEBEE', padding: '20px', borderRadius: '24px', border: '1px solid #FFCDD2' }}>
                    <h4 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', color: '#D32F2F', fontWeight: '900' }}>⚠️ 미제출 알림 (최근 미션)</h4>
                    <div style={{ fontSize: '0.85rem', color: '#C62828', lineHeight: '1.6' }}>
                        {stats.notSubmitted.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {stats.notSubmitted.slice(0, 15).map(name => (
                                    <span key={name} style={{ background: 'white', padding: '4px 10px', borderRadius: '10px', border: '1px solid #FFCDD2', fontWeight: 'bold' }}>{name}</span>
                                ))}
                                {stats.notSubmitted.length > 15 && <span style={{ padding: '4px', fontWeight: 'bold' }}>외 {stats.notSubmitted.length - 15}명</span>}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '20px', fontSize: '1rem' }}>모든 학생이 제출했습니다! 👏</div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ClassAnalysis;
