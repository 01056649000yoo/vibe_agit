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
    const [selectedMissionId, setSelectedMissionId] = useState(null);
    const [missionNotSubmittedMap, setMissionNotSubmittedMap] = useState({});
    const [missionTopStudentsMap, setMissionTopStudentsMap] = useState({});
    const [missionAvgCharsMap, setMissionAvgCharsMap] = useState({});

    useEffect(() => {
        if (classId) fetchAnalysisData();
    }, [classId]);

    const fetchAnalysisData = async () => {
        setLoading(true);
        try {
            // 1. 기초 데이터 로드 (학생, 미션, 제출물) - 삭제되지 않은 학생만 조회
            const { data: students, error: sErr } = await supabase
                .from('students')
                .select('id, name')
                .eq('class_id', classId)
                .is('deleted_at', null);

            if (sErr || !students || students.length === 0) {
                setStats({
                    studentCount: 0,
                    avgChars: 0,
                    submissionRate: 0,
                    topStudents: [],
                    notSubmitted: [],
                    trendData: [],
                    missionRates: [],
                    todayRate: 0
                });
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

            // 2. 통계 계산 (미션별 최종 제출물만 필터링)
            const getFinalPosts = (postList) => {
                const map = new Map();
                postList.forEach(p => {
                    const key = `${p.student_id}_${p.mission_id}`;
                    const existing = map.get(key);

                    let isBetter = false;
                    if (!existing) isBetter = true;
                    else if (p.is_confirmed && !existing.is_confirmed) isBetter = true;
                    else if (!existing.is_confirmed && p.is_submitted && !existing.is_submitted) isBetter = true;
                    else if (p.is_submitted === existing.is_submitted && p.is_confirmed === existing.is_confirmed) {
                        if (new Date(p.created_at) > new Date(existing.created_at)) isBetter = true;
                    }

                    if (isBetter) map.set(key, p);
                });
                return Array.from(map.values()).filter(p => p.is_confirmed);
            };

            const finalPosts = getFinalPosts(posts || []);
            const totalChars = finalPosts.reduce((sum, p) => sum + (p.char_count || 0), 0);
            const avgChars = students.length > 0 ? Math.round(totalChars / students.length) : 0;

            // 학생별 제출 현황 및 랭킹
            const studentStats = students.map(s => {
                const myFinalPosts = finalPosts.filter(p => p.student_id === s.id);
                const myChars = myFinalPosts.reduce((sum, p) => sum + (p.char_count || 0), 0);
                return { name: s.name, count: myFinalPosts.length, chars: myChars };
            });

            const topStudents = studentStats.sort((a, b) => b.chars - a.chars).slice(0, 5);

            // 미제출자 파악 (가장 최근 미션 기준)
            let notSubmittedStudents = [];
            if (missions && missions.length > 0) {
                const latestMissionId = missions[0].id;
                const submittedPosts = posts ? posts.filter(p => p.mission_id === latestMissionId && p.is_confirmed) : [];
                const submittedIds = new Set(submittedPosts.map(p => p.student_id));
                notSubmittedStudents = students.filter(s => !submittedIds.has(s.id)).map(s => s.name);
            }

            // 제출 트렌드 (최근 7일)
            const trend = Array.from({ length: 7 }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dayStr = d.toISOString().split('T')[0];
                const count = posts ? posts.filter(p => p.is_confirmed && p.created_at?.startsWith(dayStr)).length : 0;
                return { date: dayStr, count };
            }).reverse();

            // 최근 미션별 완료율 (상위 2개), 미제출자 맵, 미션별 TOP 5, 미션별 평균 글자수 구성
            const recentMissions = missions ? missions.slice(0, 2) : [];
            const missionNotSubmitted = {};
            const missionTopMap = {};
            const missionAvgMap = {};

            const missionRates = recentMissions.map(m => {
                const missionPosts = posts ? posts.filter(p => p.mission_id === m.id && p.is_confirmed) : [];
                const submittedCount = missionPosts.length;
                const rate = students.length > 0 ? Math.round((submittedCount / students.length) * 100) : 0;

                const submittedIds = new Set(missionPosts.map(p => p.student_id));
                missionNotSubmitted[m.id] = students.filter(s => !submittedIds.has(s.id)).map(s => s.name);

                // 미션별 TOP 5 (글자 수 기준)
                missionTopMap[m.id] = missionPosts
                    .map(p => {
                        const student = students.find(s => s.id === p.student_id);
                        return { name: student?.name || '익명', chars: p.char_count || 0 };
                    })
                    .sort((a, b) => b.chars - a.chars)
                    .slice(0, 5);

                // 미션별 평균 글자수 계산
                const missionTotalChars = missionPosts.reduce((sum, p) => sum + (p.char_count || 0), 0);
                missionAvgMap[m.id] = submittedCount > 0 ? Math.round(missionTotalChars / submittedCount) : 0;

                return { id: m.id, title: m.title, rate };
            });

            if (recentMissions.length > 0 && !selectedMissionId) {
                setSelectedMissionId(recentMissions[0].id);
            }

            setMissionNotSubmittedMap(missionNotSubmitted);
            setMissionTopStudentsMap(missionTopMap);
            setMissionAvgCharsMap(missionAvgMap);
            setStats({
                studentCount: students.length,
                avgChars, // 글로벌 평균 (전체)
                submissionRate: posts?.length || 0,
                topStudents, // 글로벌 TOP 5 (전체 미션 합산)
                notSubmitted: missions?.length > 0 ? missionNotSubmitted[missions[0].id] || [] : [],
                trendData: trend,
                missionRates
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
                        <div style={{ fontSize: '0.85rem', color: '#1976D2', fontWeight: 'bold', marginBottom: '8px' }}>
                            ✍️ {selectedMissionId ? '선택 미션 평균 글자 수' : '학급 전체 평균 글자 수'}
                        </div>
                        <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#0D47A1' }}>
                            {(selectedMissionId ? (missionAvgCharsMap[selectedMissionId] || 0) : stats.avgChars).toLocaleString()}자
                        </div>
                    </div>

                    <div style={{ background: '#F8F9FA', padding: '16px', borderRadius: '20px', border: '1px solid #E9ECEF', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ fontSize: '0.85rem', color: '#666', fontWeight: 'bold', marginBottom: '12px' }}>📝 최근 미션 완료율</div>
                        {stats.missionRates && stats.missionRates.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {stats.missionRates.map(m => (
                                    <div
                                        key={m.id}
                                        onClick={() => setSelectedMissionId(m.id)}
                                        style={{
                                            cursor: 'pointer',
                                            padding: '8px',
                                            borderRadius: '12px',
                                            background: selectedMissionId === m.id ? '#E3F2FD' : 'transparent',
                                            transition: 'all 0.2s',
                                            border: selectedMissionId === m.id ? '1px solid #90CAF9' : '1px solid transparent'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px', color: '#495057' }}>
                                            <span style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{m.title}</span>
                                            <span style={{ color: '#3498DB', fontWeight: '900' }}>{m.rate}%</span>
                                        </div>
                                        <div style={{ height: '8px', background: '#E0E0E0', borderRadius: '10px', overflow: 'hidden' }}>
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${m.rate}%` }}
                                                transition={{ duration: 1, ease: 'easeOut' }}
                                                style={{ height: '100%', background: selectedMissionId === m.id ? 'linear-gradient(90deg, #1976D2, #64B5F6)' : 'linear-gradient(90deg, #3498DB, #5CC6FF)' }}
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
                <div style={{ background: '#FDFCF0', padding: '20px', borderRadius: '24px', border: '1px solid #FFE082', display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '1.15rem', color: '#795548', fontWeight: '900' }}>🔥 열정 작가 TOP 5</h4>
                    <div style={{ fontSize: '1rem', color: '#8D6E63', marginBottom: '16px', fontWeight: '900', borderBottom: '1px solid rgba(121, 85, 72, 0.2)', paddingBottom: '8px' }}>
                        {selectedMissionId ? `[${stats.missionRates.find(m => m.id === selectedMissionId)?.title}]` : '전체 활동 기준'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                        {(selectedMissionId ? missionTopStudentsMap[selectedMissionId] : stats.topStudents)?.map((s, i) => (
                            <div key={i} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                fontSize: '0.92rem', padding: '6px 0',
                                borderBottom: '1px dashed rgba(121, 85, 72, 0.15)'
                            }}>
                                <span style={{ color: '#5D4037', fontWeight: '800' }}>{i + 1}. {s.name}</span>
                                <span style={{ color: '#EA580C', fontWeight: '900' }}>{s.chars.toLocaleString()}자</span>
                            </div>
                        ))}
                        {((selectedMissionId ? missionTopStudentsMap[selectedMissionId] : stats.topStudents)?.length === 0) && (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9E9E9E', fontSize: '1rem', textAlign: 'center' }}>
                                아직 활동 내역이 없습니다. 🌱
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. 주의 깊게 볼 내용 (미제출 알림) */}
                <div style={{ background: '#FFEBEE', padding: '20px', borderRadius: '24px', border: '1px solid #FFCDD2', display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '1.15rem', color: '#D32F2F', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        ⚠️ 미제출 알림
                    </h4>
                    <div style={{ fontSize: '1rem', color: '#E53935', marginBottom: '16px', fontWeight: '900', borderBottom: '1px solid #FFCDD2', paddingBottom: '8px' }}>
                        {selectedMissionId ? `[${stats.missionRates.find(m => m.id === selectedMissionId)?.title}]` : '미션을 선택해주세요.'}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#C62828', lineHeight: '1.6', flex: 1, overflowY: 'auto' }}>
                        {selectedMissionId && missionNotSubmittedMap[selectedMissionId]?.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {missionNotSubmittedMap[selectedMissionId].map(name => (
                                    <span key={name} style={{ background: 'white', padding: '6px 12px', borderRadius: '12px', border: '1px solid #FFCDD2', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(211, 47, 47, 0.05)' }}>{name}</span>
                                ))}
                            </div>
                        ) : selectedMissionId ? (
                            <div style={{
                                height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                textAlign: 'center', padding: '20px', gap: '10px'
                            }}>
                                <div style={{ fontSize: '3rem' }}>🎉</div>
                                <div style={{ fontSize: '1.4rem', color: '#B71C1C', fontWeight: '900', wordBreak: 'keep-all' }}>모든 학생이 제출했습니다!</div>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', color: '#EF9A9A', marginTop: '40px', fontWeight: 'bold' }}>미션 목록을 클릭하여 확인하세요.</div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ClassAnalysis;
