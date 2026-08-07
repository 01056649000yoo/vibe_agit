import React, { useCallback, useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import { supabase } from '../../../lib/supabaseClient';
import './teacherManager.css';

const DEFAULT_CONFIG = {
    grade: 3,
    dailyLimit: 3,
    timeLimit: 40,
    rewardPoints: 50
};

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value)));

const VocabularyTowerTeacherManager = ({ activeClass }) => {
    const classId = activeClass?.id;
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const loadConfig = useCallback(async () => {
        if (!classId) return;
        setLoading(true);
        setErrorMessage('');

        const { data, error } = await supabase
            .from('classes')
            .select('vocab_tower_grade, vocab_tower_daily_limit, vocab_tower_time_limit, vocab_tower_reward_points')
            .eq('id', classId)
            .maybeSingle();

        if (error || !data) {
            console.error('어휘의 탑 설정 로드 실패:', error?.message);
            setErrorMessage('어휘의 탑 설정을 불러오지 못했습니다.');
        } else {
            setConfig({
                grade: data.vocab_tower_grade || DEFAULT_CONFIG.grade,
                dailyLimit: data.vocab_tower_daily_limit ?? DEFAULT_CONFIG.dailyLimit,
                timeLimit: data.vocab_tower_time_limit ?? DEFAULT_CONFIG.timeLimit,
                rewardPoints: data.vocab_tower_reward_points ?? DEFAULT_CONFIG.rewardPoints
            });
        }
        setLoading(false);
    }, [classId]);

    useEffect(() => {
        const timerId = window.setTimeout(() => void loadConfig(), 0);
        return () => window.clearTimeout(timerId);
    }, [loadConfig]);

    const updateConfig = (key, value) => {
        setConfig((current) => ({ ...current, [key]: Number(value) }));
    };

    const handleSave = async () => {
        if (!classId || saving) return;
        const nextConfig = {
            grade: clamp(config.grade, 3, 6),
            dailyLimit: clamp(config.dailyLimit, 1, 5),
            timeLimit: clamp(config.timeLimit, 30, 120),
            rewardPoints: clamp(config.rewardPoints, 0, 50)
        };
        setSaving(true);
        const { error } = await supabase
            .from('classes')
            .update({
                vocab_tower_grade: nextConfig.grade,
                vocab_tower_daily_limit: nextConfig.dailyLimit,
                vocab_tower_time_limit: nextConfig.timeLimit,
                vocab_tower_reward_points: nextConfig.rewardPoints
            })
            .eq('id', classId);
        setSaving(false);

        if (error) {
            console.error('어휘의 탑 설정 저장 실패:', error.message);
            window.alert('설정 저장에 실패했습니다.');
            return;
        }
        setConfig(nextConfig);
        window.alert('설정을 저장했습니다. 새로 시작하는 탐험부터 적용됩니다.');
    };

    const handleResetToday = async () => {
        if (!classId || resetting) return;
        if (!window.confirm('학생들의 오늘 사용한 탐험 기회를 초기화할까요? 이미 열려 있는 탐험은 계속할 수 있고, 다음 입장부터 새 기회가 적용됩니다.')) return;

        setResetting(true);
        const { error } = await supabase
            .from('classes')
            .update({ vocab_tower_reset_date: new Date().toISOString() })
            .eq('id', classId);
        setResetting(false);

        if (error) {
            console.error('어휘의 탑 오늘 기회 초기화 실패:', error.message);
            window.alert('오늘의 탐험 기회를 초기화하지 못했습니다.');
            return;
        }
        window.alert('오늘 사용한 탐험 기회를 초기화했습니다.');
    };

    if (!activeClass) return <div className="vocab-teacher-empty">학급을 먼저 선택해주세요.</div>;
    if (loading) return <div className="vocab-teacher-empty">어휘의 탑 설정을 불러오는 중입니다...</div>;
    if (errorMessage) {
        return (
            <div className="vocab-teacher-empty vocab-teacher-empty--error">
                <p>{errorMessage}</p>
                <Button type="button" onClick={loadConfig}>다시 시도</Button>
            </div>
        );
    }

    return (
        <div className="vocab-teacher">
            <section className="vocab-teacher__journey" aria-labelledby="vocab-journey-title">
                <div className="vocab-teacher__section-heading">
                    <div>
                        <span className="vocab-teacher__eyebrow">현재 학생 게임 구조</span>
                        <h3 id="vocab-journey-title">틀린 낱말을 다시 만나는 10층 탐험</h3>
                    </div>
                    <span className="vocab-teacher__version">현재 운영 중</span>
                </div>
                <div className="vocab-teacher__journey-flow">
                    <div><span>📖</span><strong>뜻의 방</strong><small>뜻에 맞는 낱말</small></div>
                    <div><span>✍️</span><strong>문장의 방</strong><small>빈칸에 맞는 낱말</small></div>
                    <div><span>🔎</span><strong>구별의 방</strong><small>문맥에 맞는 낱말</small></div>
                    <div><span>🐉</span><strong>복습 보스</strong><small>5·10층에서 오답 복습</small></div>
                </div>
                <p className="vocab-teacher__journey-note">한 층은 문제 3개이며, 층을 통과할 때 다음 층에서 쓸 능력을 하나 고릅니다. 최고 층 경쟁 랭킹은 더 이상 교사 화면에서 사용하지 않습니다.</p>
            </section>

            <div className="vocab-teacher__summary">
                <div><span>출제 범위</span><strong>{config.grade}학년 어휘</strong></div>
                <div><span>하루 탐험</span><strong>최대 {config.dailyLimit}회</strong></div>
                <div><span>층별 시간</span><strong>{config.timeLimit}초</strong></div>
                <div><span>한 번의 보상</span><strong>최대 {config.rewardPoints}P</strong></div>
            </div>

            <section className="vocab-teacher__panel" aria-labelledby="vocab-settings-title">
                <div className="vocab-teacher__section-heading">
                    <div>
                        <span className="vocab-teacher__eyebrow">학급별 설정</span>
                        <h3 id="vocab-settings-title">탐험 난이도와 보상</h3>
                        <p>저장한 값은 이미 진행 중인 판이 아니라 다음에 새로 시작하는 탐험부터 적용됩니다.</p>
                    </div>
                </div>

                <div className="vocab-teacher__settings-grid">
                    <label>
                        <span>📚 출제 학년</span>
                        <small>학생에게 보여줄 어휘 자료를 고릅니다.</small>
                        <select value={config.grade} onChange={(event) => updateConfig('grade', event.target.value)}>
                            {[3, 4, 5, 6].map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}
                        </select>
                    </label>
                    <label>
                        <span>🎯 하루 탐험 횟수</span>
                        <small>한 학생이 하루에 새로 시작할 수 있는 횟수입니다.</small>
                        <input type="number" min="1" max="5" value={config.dailyLimit} onChange={(event) => updateConfig('dailyLimit', event.target.value)} />
                    </label>
                    <label>
                        <span>⏱️ 층별 제한 시간</span>
                        <small>한 층의 문제 3개를 모두 푸는 시간입니다.</small>
                        <input type="number" min="30" max="120" step="10" value={config.timeLimit} onChange={(event) => updateConfig('timeLimit', event.target.value)} />
                    </label>
                    <label>
                        <span>🎁 한 번의 최대 보상</span>
                        <small>정답 수와 복습 성공을 계산한 뒤 적용되는 상한입니다.</small>
                        <input type="number" min="0" max="50" step="5" value={config.rewardPoints} onChange={(event) => updateConfig('rewardPoints', event.target.value)} />
                    </label>
                </div>

                <div className="vocab-teacher__reward-rule">
                    <strong>포인트 계산 방식</strong>
                    <span>정답 1개 2P</span>
                    <span>보스에서 오답 복습 성공 +3P</span>
                    <span>정답률 60% 이상이면 5층·정상 보너스</span>
                    <small>모든 학습 게임을 합쳐 하루 80P·주 250P까지만 받을 수 있습니다.</small>
                </div>

                <div className="vocab-teacher__footer-actions">
                    <Button type="button" onClick={handleSave} loading={saving} loadingText="저장 중...">
                        설정 저장
                    </Button>
                    <Button type="button" variant="outline" onClick={handleResetToday} loading={resetting} loadingText="초기화 중...">
                        오늘 탐험 기회 초기화
                    </Button>
                </div>
            </section>

            <p className="vocab-teacher__archive-note">기존 랭킹과 지난 시즌 자료는 삭제하지 않고 보관합니다. 현재 학습형 탐험의 교사 화면에서는 사용하지 않습니다.</p>
        </div>
    );
};

export default VocabularyTowerTeacherManager;
