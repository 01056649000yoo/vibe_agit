import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import { supabase } from '../../../lib/supabaseClient';
import './teacherManager.css';

const DEFAULT_CONFIG = {
    grade: 3,
    dailyLimit: 3,
    timeLimit: 40,
    rewardPoints: 80,
    rankingResetDate: null,
    createdAt: null
};

const formatDate = (value) => value ? new Date(value).toLocaleDateString('ko-KR') : '기록 없음';

const VocabularyTowerTeacherManager = ({ activeClass, isMobile }) => {
    const classId = activeClass?.id;
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    const [students, setStudents] = useState([]);
    const [rankings, setRankings] = useState([]);
    const [history, setHistory] = useState([]);
    const [activeTab, setActiveTab] = useState('settings');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const loadData = useCallback(async () => {
        if (!classId) return;
        setLoading(true);
        setErrorMessage('');

        const [classResult, studentResult, rankingResult, historyResult] = await Promise.all([
            supabase
                .from('classes')
                .select('created_at, vocab_tower_grade, vocab_tower_daily_limit, vocab_tower_time_limit, vocab_tower_reward_points, vocab_tower_ranking_reset_date')
                .eq('id', classId)
                .maybeSingle(),
            supabase
                .from('students')
                .select('id, name')
                .eq('class_id', classId)
                .order('name')
                .limit(100),
            supabase
                .from('vocab_tower_rankings')
                .select('id, max_floor, student_id, updated_at')
                .eq('class_id', classId)
                .order('max_floor', { ascending: false })
                .limit(100),
            supabase
                .from('vocab_tower_history')
                .select('id, season_name, rankings, started_at, ended_at')
                .eq('class_id', classId)
                .order('ended_at', { ascending: false })
                .limit(20)
        ]);

        const firstError = classResult.error || studentResult.error || rankingResult.error || historyResult.error;
        if (firstError || !classResult.data) {
            console.error('어휘의 탑 교사 데이터 로드 실패:', firstError?.message);
            setErrorMessage('어휘의 탑 설정과 기록을 불러오지 못했습니다.');
            setLoading(false);
            return;
        }

        const classData = classResult.data;
        const resetAt = classData.vocab_tower_ranking_reset_date || null;
        setConfig({
            grade: classData.vocab_tower_grade || DEFAULT_CONFIG.grade,
            dailyLimit: classData.vocab_tower_daily_limit ?? DEFAULT_CONFIG.dailyLimit,
            timeLimit: classData.vocab_tower_time_limit ?? DEFAULT_CONFIG.timeLimit,
            rewardPoints: classData.vocab_tower_reward_points ?? DEFAULT_CONFIG.rewardPoints,
            rankingResetDate: resetAt,
            createdAt: classData.created_at || null
        });
        setStudents(studentResult.data || []);
        setRankings((rankingResult.data || []).filter((item) => !resetAt || item.updated_at >= resetAt));
        setHistory(historyResult.data || []);
        setLoading(false);
    }, [classId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        const refreshVisibleData = () => {
            if (!document.hidden) loadData();
        };
        window.addEventListener('focus', refreshVisibleData);
        document.addEventListener('visibilitychange', refreshVisibleData);
        return () => {
            window.removeEventListener('focus', refreshVisibleData);
            document.removeEventListener('visibilitychange', refreshVisibleData);
        };
    }, [loadData]);

    const studentNames = useMemo(
        () => new Map(students.map((student) => [student.id, student.name])),
        [students]
    );
    const namedRankings = useMemo(() => rankings.map((ranking) => ({
        ...ranking,
        studentName: studentNames.get(ranking.student_id) || '아지트 친구'
    })), [rankings, studentNames]);

    const handleSave = async () => {
        if (!classId || saving) return;
        setSaving(true);
        const { error } = await supabase
            .from('classes')
            .update({
                vocab_tower_grade: Number(config.grade),
                vocab_tower_daily_limit: Number(config.dailyLimit),
                vocab_tower_time_limit: Number(config.timeLimit),
                vocab_tower_reward_points: Number(config.rewardPoints),
                vocab_tower_reset_date: new Date().toISOString()
            })
            .eq('id', classId);
        setSaving(false);

        if (error) {
            console.error('어휘의 탑 설정 저장 실패:', error.message);
            window.alert('설정 저장에 실패했습니다.');
            return;
        }
        window.alert('설정을 저장하고 학생들의 오늘 시도 횟수를 초기화했습니다.');
    };

    const deleteRanking = async (studentId = null) => {
        const studentName = studentId ? studentNames.get(studentId) || '이 학생' : '학급 전체';
        if (!window.confirm(`${studentName}의 현재 랭킹을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;

        let query = supabase.from('vocab_tower_rankings').delete().eq('class_id', classId);
        if (studentId) query = query.eq('student_id', studentId);
        const { error } = await query;
        if (error) {
            console.error('어휘의 탑 랭킹 삭제 실패:', error.message);
            window.alert('랭킹을 삭제하지 못했습니다.');
            return;
        }
        await loadData();
    };

    const startNewSeason = async () => {
        if (!window.confirm('현재 랭킹을 지난 시즌 기록으로 보관하고 새 시즌을 시작할까요?')) return;
        const now = new Date().toISOString();
        const startedAt = config.rankingResetDate || config.createdAt || now;
        const snapshot = namedRankings.map((ranking) => ({
            name: ranking.studentName,
            floor: ranking.max_floor
        }));

        setSaving(true);
        try {
            if (snapshot.length > 0) {
                const { error: historyError } = await supabase.from('vocab_tower_history').insert({
                    class_id: classId,
                    season_name: `${formatDate(startedAt)} ~ ${formatDate(now)} 시즌 기록`,
                    rankings: snapshot,
                    started_at: startedAt,
                    ended_at: now
                });
                if (historyError) throw historyError;
            }

            const { error: deleteError } = await supabase
                .from('vocab_tower_rankings')
                .delete()
                .eq('class_id', classId);
            if (deleteError) throw deleteError;

            const { error: classError } = await supabase
                .from('classes')
                .update({ vocab_tower_ranking_reset_date: now })
                .eq('id', classId);
            if (classError) throw classError;

            await loadData();
            setActiveTab('rankings');
            window.alert('이전 랭킹을 보관하고 새 시즌을 시작했습니다.');
        } catch (error) {
            console.error('어휘의 탑 시즌 시작 실패:', error.message);
            window.alert('새 시즌을 시작하지 못했습니다. 기록 상태를 확인해주세요.');
        } finally {
            setSaving(false);
        }
    };

    const deleteHistory = async (historyId) => {
        if (!window.confirm('이 지난 시즌 기록을 영구적으로 삭제할까요?')) return;
        const { error } = await supabase
            .from('vocab_tower_history')
            .delete()
            .eq('id', historyId)
            .eq('class_id', classId);
        if (error) {
            console.error('어휘의 탑 지난 시즌 삭제 실패:', error.message);
            window.alert('지난 시즌 기록을 삭제하지 못했습니다.');
            return;
        }
        setHistory((current) => current.filter((item) => item.id !== historyId));
    };

    if (!activeClass) return <div className="vocab-teacher-empty">학급을 먼저 선택해주세요.</div>;
    if (loading) return <div className="vocab-teacher-empty">어휘의 탑 정보를 불러오는 중입니다...</div>;
    if (errorMessage) {
        return (
            <div className="vocab-teacher-empty vocab-teacher-empty--error">
                <p>{errorMessage}</p>
                <Button onClick={loadData}>다시 시도</Button>
            </div>
        );
    }

    return (
        <div className="vocab-teacher">
            <div className="vocab-teacher__summary">
                <div><span>현재 설정</span><strong>{config.grade}학년 · {config.dailyLimit}회</strong></div>
                <div><span>제한 시간</span><strong>{config.timeLimit}초</strong></div>
                <div><span>완료 보너스</span><strong>{config.rewardPoints}P</strong></div>
                <div><span>도전 학생</span><strong>{rankings.length}명</strong></div>
            </div>

            <div className="vocab-teacher__tabs" role="tablist" aria-label="어휘의 탑 관리 메뉴">
                {[
                    ['settings', '⚙️ 게임 설정'],
                    ['rankings', '🏆 현재 랭킹'],
                    ['history', '📜 지난 시즌']
                ].map(([id, label]) => (
                    <button key={id} type="button" role="tab" aria-selected={activeTab === id} onClick={() => setActiveTab(id)}>
                        {label}
                    </button>
                ))}
            </div>

            {activeTab === 'settings' && (
                <section className="vocab-teacher__panel">
                    <div className="vocab-teacher__settings-grid">
                        <label>
                            <span>📚 출제 학년</span>
                            <select value={config.grade} onChange={(event) => setConfig((current) => ({ ...current, grade: Number(event.target.value) }))}>
                                {[3, 4, 5, 6].map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}
                            </select>
                        </label>
                        <label>
                            <span>🎯 일일 기회</span>
                            <input type="number" min="1" max="10" value={config.dailyLimit} onChange={(event) => setConfig((current) => ({ ...current, dailyLimit: Number(event.target.value) }))} />
                        </label>
                        <label>
                            <span>⏱️ 제한 시간</span>
                            <input type="number" min="30" max="120" step="10" value={config.timeLimit} onChange={(event) => setConfig((current) => ({ ...current, timeLimit: Number(event.target.value) }))} />
                        </label>
                        <label>
                            <span>🎁 완료 보너스</span>
                            <input type="number" min="0" step="10" value={config.rewardPoints} onChange={(event) => setConfig((current) => ({ ...current, rewardPoints: Number(event.target.value) }))} />
                        </label>
                    </div>
                    <p className="vocab-teacher__notice">설정을 저장하면 학생들의 오늘 도전 횟수 기준도 함께 갱신됩니다.</p>
                    <Button onClick={handleSave} disabled={saving} style={{ width: '100%' }}>
                        {saving ? '저장 중...' : '설정 저장'}
                    </Button>
                </section>
            )}

            {activeTab === 'rankings' && (
                <section className="vocab-teacher__panel">
                    <div className="vocab-teacher__panel-heading">
                        <div>
                            <h3>현재 시즌 랭킹</h3>
                            <p>화면에 다시 들어오거나 포커스가 돌아올 때 최신 기록을 확인합니다.</p>
                        </div>
                        <div className="vocab-teacher__actions">
                            <Button onClick={loadData}>새로고침</Button>
                            <Button onClick={startNewSeason} disabled={saving}>새 시즌 시작</Button>
                            <Button onClick={() => deleteRanking()} disabled={rankings.length === 0}>전체 삭제</Button>
                        </div>
                    </div>
                    <div className="vocab-teacher__table-wrap">
                        <table>
                            <thead><tr><th>순위</th><th>학생</th><th>최고 층</th><th>최근 도전</th><th>관리</th></tr></thead>
                            <tbody>
                                {namedRankings.map((ranking, index) => (
                                    <tr key={ranking.id}>
                                        <td>{index + 1}위</td>
                                        <td><strong>{ranking.studentName}</strong></td>
                                        <td><span className="vocab-teacher__floor">{ranking.max_floor}F</span></td>
                                        <td>{formatDate(ranking.updated_at)}</td>
                                        <td><button type="button" onClick={() => deleteRanking(ranking.student_id)}>초기화</button></td>
                                    </tr>
                                ))}
                                {namedRankings.length === 0 && <tr><td colSpan="5" className="vocab-teacher__empty-row">아직 도전 기록이 없습니다.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {activeTab === 'history' && (
                <section className="vocab-teacher__panel">
                    <div className="vocab-teacher__history-list">
                        {history.map((season) => (
                            <article key={season.id}>
                                <div className="vocab-teacher__panel-heading">
                                    <div>
                                        <h3>{season.season_name || `${formatDate(season.ended_at)} 종료 시즌`}</h3>
                                        <p>{formatDate(season.started_at)} ~ {formatDate(season.ended_at)}</p>
                                    </div>
                                    <button type="button" onClick={() => deleteHistory(season.id)}>삭제</button>
                                </div>
                                <div className="vocab-teacher__history-ranks">
                                    {(season.rankings || []).map((ranking, index) => (
                                        <span key={`${season.id}-${ranking.name}-${index}`}>{index + 1}위 {ranking.name} · {ranking.floor}F</span>
                                    ))}
                                </div>
                            </article>
                        ))}
                        {history.length === 0 && <div className="vocab-teacher__empty-row">보관된 지난 시즌이 없습니다.</div>}
                    </div>
                </section>
            )}

            {isMobile && <p className="vocab-teacher__mobile-hint">표는 좌우로 밀어서 볼 수 있습니다.</p>}
        </div>
    );
};

export default VocabularyTowerTeacherManager;
