import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEvaluation } from '../../hooks/useEvaluation';
import Card from '../common/Card';
import Button from '../common/Button';

const EvaluationReport = ({ mission, onClose, isMobile }) => {
    const { fetchMissionReport, loading } = useEvaluation();
    const [reportData, setReportData] = useState([]);
    const [filterScore, setFilterScore] = useState(0); // 0 means no filter
    const [sortBy, setSortBy] = useState('name'); // 'name', 'growth', 'final'
    const [displayLimit, setDisplayLimit] = useState(50); // [성능 최적화] 지연 렌더링을 위한 표시 개수

    useEffect(() => {
        if (mission?.id) {
            loadReport();
        }
    }, [mission?.id]);

    const loadReport = async () => {
        const result = await fetchMissionReport(mission.id);
        if (result.success) {
            setReportData(result.data || []);
        }
    };

    const maxScore = mission?.evaluation_rubric?.levels?.length || 3;
    const requiredGrowth = maxScore === 3 ? 2 : maxScore === 4 ? 3 : 4;

    // 통계 계산
    const stats = useMemo(() => {
        const validInitial = reportData.filter(d => d.initial_eval !== null);
        const validFinal = reportData.filter(d => d.final_eval !== null);

        const avgInitial = validInitial.length > 0
            ? (validInitial.reduce((sum, d) => sum + d.initial_eval, 0) / validInitial.length).toFixed(1)
            : 0;

        const avgFinal = validFinal.length > 0
            ? (validFinal.reduce((sum, d) => sum + d.final_eval, 0) / validFinal.length).toFixed(1)
            : 0;

        const growthKings = reportData.filter(d => (d.final_eval - d.initial_eval) >= requiredGrowth);
        const improved = reportData.filter(d => (d.final_eval - d.initial_eval) > 0);

        return {
            avgInitial,
            avgFinal,
            growthKingNames: growthKings.map(d => d.students?.name).filter(Boolean),
            improvedNames: improved.map(d => d.students?.name).filter(Boolean),
            total: reportData.length
        };
    }, [reportData, requiredGrowth]);

    const processedData = useMemo(() => {
        let filtered = reportData.filter(d => {
            if (filterScore === 0) return true;
            if (filterScore === 1) return d.final_eval === 1;
            if (filterScore === 2) return d.final_eval <= 2;
            return true;
        });

        filtered.sort((a, b) => {
            if (sortBy === 'name') {
                return (a.students?.name || '').localeCompare(b.students?.name || '');
            } else if (sortBy === 'growth') {
                const growthA = (a.final_eval || 0) - (a.initial_eval || 0);
                const growthB = (b.final_eval || 0) - (b.initial_eval || 0);
                return growthB - growthA; // Descending
            } else if (sortBy === 'final') {
                return (b.final_eval || 0) - (a.final_eval || 0); // Descending
            }
            return 0;
        });

        return filtered;
    }, [reportData, filterScore, sortBy]);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(255,255,255,0.98)', zIndex: 2000,
                display: 'flex', flexDirection: 'column',
                boxSizing: 'border-box'
            }}
        >
            <header style={{
                padding: '20px 40px', borderBottom: '1px solid #F1F3F5',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'white', flexShrink: 0
            }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '900', color: '#2C3E50' }}>📊 학생 평가 리포트</h2>
                    <div style={{ fontSize: '0.9rem', color: '#7F8C8D', fontWeight: 'bold' }}>미션: {mission.title}</div>
                </div>
                <Button variant="ghost" onClick={onClose} style={{ fontSize: '1.2rem' }}>✕ 닫기</Button>
            </header>

            <main style={{
                flex: 1, overflowY: 'auto', padding: isMobile ? '20px' : '40px',
                maxWidth: '1100px', margin: '0 auto', width: '100%', boxSizing: 'border-box'
            }}>
                {/* 상단 통계 차트 영역 */}
                <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: '24px', marginBottom: '32px' }}>
                    <div style={{ background: '#F8FAFC', padding: '20px 24px', borderRadius: '24px', border: '1px solid #E2E8F0' }}>
                        <h4 style={{ margin: '0 0 12px 0', color: '#64748B', fontSize: '0.95rem' }}>📉 학급 평균 성장도 (최대 {maxScore}점)</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 'bold' }}>
                                    <span>처음글 평균 점수</span>
                                    <span style={{ color: '#10B981' }}>{stats.avgInitial}P</span>
                                </div>
                                <div style={{ height: '12px', background: '#E2E8F0', borderRadius: '6px', overflow: 'hidden' }}>
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${(stats.avgInitial / maxScore) * 100}%` }}
                                        style={{ height: '100%', background: '#10B981' }}
                                    />
                                </div>
                            </div>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 'bold' }}>
                                    <span>마지막글 평균 점수</span>
                                    <span style={{ color: '#3B82F6' }}>{stats.avgFinal}P</span>
                                </div>
                                <div style={{ height: '12px', background: '#E2E8F0', borderRadius: '6px', overflow: 'hidden' }}>
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${(stats.avgFinal / maxScore) * 100}%` }}
                                        style={{ height: '100%', background: '#3B82F6' }}
                                    />
                                </div>
                            </div>
                        </div>

                        {stats.improvedNames.length > 0 && (
                            <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px dashed #CBD5E1' }}>
                                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 'bold', marginBottom: '4px' }}>🚀 글쓰기가 향상된 학생들</div>
                                <div style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 'bold', lineHeight: '1.4' }}>
                                    {stats.improvedNames.join(', ')}
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ background: 'linear-gradient(135deg, #FFEDD5 0%, #FFF7ED 100%)', padding: '20px', borderRadius: '24px', border: '1px solid #FED7AA', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '6px' }}>👑</div>
                        <h3 style={{ margin: 0, color: '#9A3412', fontWeight: '900' }}>성장왕 탄생!</h3>
                        <p style={{ margin: '8px 0', color: '#C2410C', fontWeight: 'bold' }}>{requiredGrowth}단계 이상 향상된 주인공</p>
                        <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#EA580C', wordBreak: 'keep-all', lineHeight: '1.5' }}>
                            {stats.growthKingNames.length > 0 ? stats.growthKingNames.join(', ') : '아직 대기 중! 🌱'}
                        </div>
                    </div>
                </section>

                {/* 필터 및 정렬 컨트롤러 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <select
                            value={filterScore}
                            onChange={e => setFilterScore(Number(e.target.value))}
                            style={{ padding: '10px 16px', borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '0.9rem', outline: 'none' }}
                        >
                            <option value={0}>전체 학생 보기</option>
                            <option value={1}>1점 학생만 (집중 지도)</option>
                            <option value={2}>2점 이하 학생</option>
                        </select>
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value)}
                            style={{ padding: '10px 16px', borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '0.9rem', outline: 'none' }}
                        >
                            <option value="name">이름순</option>
                            <option value="growth">성장도순</option>
                            <option value="final">최종 점수순</option>
                        </select>
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#64748B', fontWeight: 'bold' }}>
                        분석 대상: 총 {processedData.length}명
                    </div>
                </div>

                {/* 상세 결과 테이블 */}
                <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                <th style={{ padding: '16px 24px', fontSize: '0.9rem', color: '#64748B' }}>학생 이름</th>
                                <th style={{ padding: '16px 24px', fontSize: '0.9rem', color: '#64748B' }}>처음 점수</th>
                                <th style={{ padding: '16px 24px', fontSize: '0.9rem', color: '#64748B' }}>최종 점수</th>
                                <th style={{ padding: '16px 24px', fontSize: '0.9rem', color: '#64748B' }}>성장도</th>
                                <th style={{ padding: '16px 24px', fontSize: '0.9rem', color: '#64748B' }}>교사 의견</th>
                            </tr>
                        </thead>
                        <tbody>
                            {processedData.slice(0, displayLimit).map((student) => {
                                const growth = (student.final_eval || 0) - (student.initial_eval || 0);
                                const isGrowthKing = growth >= requiredGrowth;

                                // 점수를 평어로 변환하는 헬퍼 함수
                                const getScoreLabel = (score) => {
                                    if (score === null || score === undefined || score === 0) return '-';
                                    const level = mission.evaluation_rubric?.levels?.find(l => l.score === score);
                                    return level ? level.label : `${score}점`;
                                };

                                return (
                                    <tr key={student.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                        <td style={{ padding: '16px 24px', fontWeight: 'bold' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {student.students?.name}
                                                {isGrowthKing && <span title="성장왕" style={{ fontSize: '1.2rem' }}>👑</span>}
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 24px', color: '#64748B' }}>{getScoreLabel(student.initial_eval)}</td>
                                        <td style={{ padding: '16px 24px', fontWeight: '900', color: '#3B82F6' }}>{getScoreLabel(student.final_eval)}</td>
                                        <td style={{ padding: '16px 24px' }}>
                                            <span style={{
                                                padding: '4px 10px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 'bold',
                                                background: growth > 0 ? '#ECFDF5' : growth < 0 ? '#FEF2F2' : '#F1F5F9',
                                                color: growth > 0 ? '#059669' : growth < 0 ? '#DC2626' : '#64748B'
                                            }}>
                                                {growth > 0 ? `+${growth}` : growth}
                                            </span>
                                        </td>
                                        <td
                                            title={student.eval_comment}
                                            style={{ padding: '16px 24px', fontSize: '0.9rem', color: '#444', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                        >
                                            {student.eval_comment || <span style={{ color: '#CBD5E1' }}>의견 없음</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {displayLimit < processedData.length && (
                        <div style={{ padding: '24px', textAlign: 'center', borderTop: '1px solid #E2E8F0' }}>
                            <Button variant="ghost" onClick={() => setDisplayLimit(prev => prev + 50)}>
                                명단 더 보기 ({displayLimit} / {processedData.length}) 🔽
                            </Button>
                        </div>
                    )}
                    {processedData.length === 0 && (
                        <div style={{ padding: '80px', textAlign: 'center', color: '#94A3B8' }}>
                            검색 결과나 평가 데이터가 없습니다. 🖋️
                        </div>
                    )}
                </div>
            </main>
        </motion.div>
    );
};

export default EvaluationReport;
