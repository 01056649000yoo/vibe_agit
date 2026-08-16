import React, { useCallback, useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import { supabase } from '../../../lib/supabaseClient';
import './teacherManager.css';

const DEFAULT_CONFIG = {
    grade: 3,
    perfectRewardPoints: 100
};

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value)));

const VocabularyTowerTeacherManager = ({ activeClass }) => {
    const classId = activeClass?.id;
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const loadConfig = useCallback(async () => {
        if (!classId) return;
        setLoading(true);
        setErrorMessage('');

        const { data, error } = await supabase
            .from('classes')
            .select('vocab_tower_grade, vocab_tower_v2_perfect_reward_points')
            .eq('id', classId)
            .maybeSingle();

        if (error || !data) {
            console.error('어휘의 탑 설정 로드 실패:', error?.message);
            setErrorMessage('어휘의 탑 설정을 불러오지 못했습니다.');
        } else {
            setConfig({
                grade: data.vocab_tower_grade || DEFAULT_CONFIG.grade,
                perfectRewardPoints: data.vocab_tower_v2_perfect_reward_points ?? DEFAULT_CONFIG.perfectRewardPoints
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
            perfectRewardPoints: clamp(config.perfectRewardPoints, 0, 500)
        };
        setSaving(true);
        const { error } = await supabase
            .from('classes')
            .update({
                vocab_tower_grade: nextConfig.grade,
                vocab_tower_v2_perfect_reward_points: nextConfig.perfectRewardPoints
            })
            .eq('id', classId);
        if (error) {
            setSaving(false);
            console.error('어휘의 탑 설정 저장 실패:', error.message);
            window.alert('설정 저장에 실패했습니다.');
            return;
        }

        const { data: versionResult, error: versionError } = await supabase.rpc(
            'set_teacher_vocab_tower_content_version_v2',
            { p_class_id: classId, p_content_version: 'v2' }
        );
        setSaving(false);
        if (versionError) {
            console.error('어휘의 탑 출제 버전 저장 실패:', versionError.message);
            window.alert(versionError.message || '출제 버전을 저장하지 못했습니다.');
            void loadConfig();
            return;
        }
        setConfig(nextConfig);
        window.alert(versionResult?.changed
            ? '설정을 저장하고 현재 덱 10개를 기본 출제자료로 전환했습니다.'
            : '설정을 저장했습니다. 현재 덱 10개가 자동으로 출제됩니다.');
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
                        <h3 id="vocab-journey-title">10개 층 덱을 고르는 개인 어휘 연습</h3>
                    </div>
                    <span className="vocab-teacher__version">현재 운영 중</span>
                </div>
                <div className="vocab-teacher__journey-flow">
                    <div><span>📖</span><strong>뜻의 방</strong><small>뜻에 맞는 낱말</small></div>
                    <div><span>✍️</span><strong>문장의 방</strong><small>빈칸에 맞는 낱말</small></div>
                    <div><span>🔎</span><strong>구별의 방</strong><small>문맥에 맞는 낱말</small></div>
                    <div><span>📊</span><strong>12문항 결과</strong><small>층별 최고 정답률 기록</small></div>
                </div>
                <p className="vocab-teacher__journey-note">학생이 10개 층 중 하나를 골라 검수 낱말 12문항을 시간 제한 없이 연습합니다. 각 층에서 처음 12/12를 달성하면 {config.perfectRewardPoints}P를 받습니다.</p>
            </section>

            <div className="vocab-teacher__summary">
                <div><span>출제 범위</span><strong>{config.grade}학년 어휘</strong></div>
                <div><span>개인 연습</span><strong>횟수 제한 없음</strong></div>
                <div><span>연습 시간</span><strong>제한 없음</strong></div>
                <div><span>완벽 연습 보상</span><strong>{config.perfectRewardPoints}P</strong></div>
                <div><span>기본 출제자료</span><strong>현재 덱 10개</strong></div>
            </div>

            <section className="vocab-teacher__panel" aria-labelledby="vocab-settings-title">
                <div className="vocab-teacher__section-heading">
                    <div>
                        <span className="vocab-teacher__eyebrow">학급별 설정</span>
                        <h3 id="vocab-settings-title">개인 연습 설정</h3>
                        <p>현재 학년의 검수·잠금이 완료된 덱 10개를 자동으로 사용하며, 별도로 출제자료를 선택할 필요가 없습니다.</p>
                    </div>
                </div>

                <div className="vocab-teacher__source-card" aria-label="기본 출제자료 자동 설정">
                    <span aria-hidden="true">📚</span>
                    <div>
                        <strong>{config.grade}학년 현재 덱 10개</strong>
                        <small>관리자 검수와 잠금이 완료된 최신 자료가 학생 연습에 자동으로 출제됩니다.</small>
                    </div>
                    <em>자동 설정</em>
                </div>

                <div className="vocab-teacher__settings-grid">
                    <label>
                        <span>📚 출제 학년</span>
                        <small>고른 학년의 현재 덱 10개가 자동으로 연결됩니다.</small>
                        <select value={config.grade} onChange={(event) => updateConfig('grade', event.target.value)}>
                            {[3, 4, 5, 6].map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}
                        </select>
                    </label>
                    <label>
                        <span>🏆 최초 완벽 연습 보상</span>
                        <small>학생이 한 층에서 처음 12/12를 달성할 때 한 번만 받습니다.</small>
                        <input type="number" min="0" max="500" step="10" value={config.perfectRewardPoints} onChange={(event) => updateConfig('perfectRewardPoints', event.target.value)} />
                    </label>
                </div>

                <p className="vocab-teacher__journey-note">같은 층을 다시 12/12로 마쳐도 포인트는 중복 지급되지 않습니다. 0P로 저장하면 완벽 연습 보상을 끌 수 있습니다.</p>

                <div className="vocab-teacher__footer-actions">
                    <Button type="button" onClick={handleSave} loading={saving} loadingText="저장 중...">
                        설정 저장
                    </Button>
                </div>
            </section>

            <p className="vocab-teacher__archive-note">기존 랭킹과 지난 시즌 자료는 삭제하지 않고 보관합니다. 현재 학습형 탐험의 교사 화면에서는 사용하지 않습니다.</p>
        </div>
    );
};

export default VocabularyTowerTeacherManager;
