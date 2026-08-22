import React, { useCallback, useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import { supabase } from '../../../lib/supabaseClient';
import './teacherManager.css';
import TeacherGuideButton from '../../../components/teacher/TeacherGuideButton';
import {
    VOCAB_FLOOR_REWARD_DEFAULT_POINTS,
    VOCAB_FLOOR_REWARD_MAX_POINTS,
    VOCAB_FLOOR_REWARD_MIN_POINTS,
    VOCAB_FLOOR_REWARD_STEP_POINTS,
    normalizeFloorRewardPoints
} from './rewardPolicy';

const DEFAULT_CONFIG = {
    grade: 3,
    perfectRewardPoints: VOCAB_FLOOR_REWARD_DEFAULT_POINTS,
    masterQuestionCount: 12,
    masterInputCount: 5,
    masterPassCorrect: 10,
    masterPassInput: 3,
    masterSecondsPerQuestion: 45,
    masterRequiredMasteredPercent: 80,
    summitQuestionCount: 20,
    summitInputCount: 8,
    summitPassInput: 6,
    summitPassCorrect: 17,
    summitInputCount2: 14,
    summitPassInput2: 11,
    summitInputCount3: 20,
    summitPassInput3: 15
};

// 한 층의 낱말 수는 학년마다 38~40개로 조금씩 다르다. 교사에게 보여 줄 예시는 40낱말 기준이다.
const SAMPLE_DECK_SIZE = 40;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value)));

// DB의 classes_vocab_master_settings_check 는 값끼리 물려 있다
// (직접입력 ≤ 총문항, 합격 정답 ≤ 총문항, 합격 직접입력 ≤ 직접입력).
// 저장 전에 같은 순서로 맞물리게 잘라 두어야 교사가 슬라이더를 어떻게 움직여도 DB 오류가 나지 않는다.
const normalizeMasterSettings = (config) => {
    const questionCount = clamp(config.masterQuestionCount, 5, 30);
    const inputCount = clamp(config.masterInputCount, 0, questionCount);
    return {
        masterQuestionCount: questionCount,
        masterInputCount: inputCount,
        masterPassCorrect: clamp(config.masterPassCorrect, 1, questionCount),
        masterPassInput: clamp(config.masterPassInput, 0, inputCount),
        masterSecondsPerQuestion: clamp(config.masterSecondsPerQuestion, 10, 300),
        masterRequiredMasteredPercent: clamp(config.masterRequiredMasteredPercent, 50, 100)
    };
};

// 정상 관문도 같은 방식으로 물려 있다(classes_vocab_summit_settings_check).
// 여기에 조건이 하나 더 있다 — **뒤 단계의 직접입력이 앞 단계보다 적으면 안 된다.**
// 그래야 "단계가 오를수록 어려워진다"는 약속이 지켜진다. 앞에서부터 차례로 밀어 올린다.
const normalizeSummitSettings = (config) => {
    const questionCount = clamp(config.summitQuestionCount, 10, 40);
    const input1 = clamp(config.summitInputCount, 0, questionCount);
    const input2 = clamp(config.summitInputCount2, input1, questionCount);
    const input3 = clamp(config.summitInputCount3, input2, questionCount);
    return {
        summitQuestionCount: questionCount,
        summitPassCorrect: clamp(config.summitPassCorrect, 1, questionCount),
        summitInputCount: input1,
        summitPassInput: clamp(config.summitPassInput, 0, input1),
        summitInputCount2: input2,
        summitPassInput2: clamp(config.summitPassInput2, 0, input2),
        summitInputCount3: input3,
        summitPassInput3: clamp(config.summitPassInput3, 0, input3)
    };
};

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
            .select([
                'vocab_tower_grade',
                'vocab_tower_v2_perfect_reward_points',
                'vocab_master_question_count',
                'vocab_master_input_count',
                'vocab_master_pass_correct',
                'vocab_master_pass_input',
                'vocab_master_seconds_per_question',
                'vocab_master_required_mastered_ratio',
                'vocab_summit_question_count',
                'vocab_summit_input_count',
                'vocab_summit_pass_correct',
                'vocab_summit_pass_input',
                'vocab_summit_input_count_2',
                'vocab_summit_pass_input_2',
                'vocab_summit_input_count_3',
                'vocab_summit_pass_input_3'
            ].join(', '))
            .eq('id', classId)
            .maybeSingle();

        if (error || !data) {
            console.error('어휘의 탑 설정 로드 실패:', error?.message);
            setErrorMessage('어휘의 탑 설정을 불러오지 못했습니다.');
        } else {
            setConfig({
                grade: data.vocab_tower_grade || DEFAULT_CONFIG.grade,
                perfectRewardPoints: data.vocab_tower_v2_perfect_reward_points ?? DEFAULT_CONFIG.perfectRewardPoints,
                masterQuestionCount: data.vocab_master_question_count ?? DEFAULT_CONFIG.masterQuestionCount,
                masterInputCount: data.vocab_master_input_count ?? DEFAULT_CONFIG.masterInputCount,
                masterPassCorrect: data.vocab_master_pass_correct ?? DEFAULT_CONFIG.masterPassCorrect,
                masterPassInput: data.vocab_master_pass_input ?? DEFAULT_CONFIG.masterPassInput,
                masterSecondsPerQuestion: data.vocab_master_seconds_per_question ?? DEFAULT_CONFIG.masterSecondsPerQuestion,
                masterRequiredMasteredPercent: Math.round(
                    Number(data.vocab_master_required_mastered_ratio ?? 0.8) * 100
                ),
                summitQuestionCount: data.vocab_summit_question_count ?? DEFAULT_CONFIG.summitQuestionCount,
                summitInputCount: data.vocab_summit_input_count ?? DEFAULT_CONFIG.summitInputCount,
                summitPassCorrect: data.vocab_summit_pass_correct ?? DEFAULT_CONFIG.summitPassCorrect,
                summitPassInput: data.vocab_summit_pass_input ?? DEFAULT_CONFIG.summitPassInput,
                summitInputCount2: data.vocab_summit_input_count_2 ?? DEFAULT_CONFIG.summitInputCount2,
                summitPassInput2: data.vocab_summit_pass_input_2 ?? DEFAULT_CONFIG.summitPassInput2,
                summitInputCount3: data.vocab_summit_input_count_3 ?? DEFAULT_CONFIG.summitInputCount3,
                summitPassInput3: data.vocab_summit_pass_input_3 ?? DEFAULT_CONFIG.summitPassInput3
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
        const master = normalizeMasterSettings(config);
        const summitValues = normalizeSummitSettings(config);
        const nextConfig = {
            ...master,
            ...summitValues,
            grade: clamp(config.grade, 3, 6),
            perfectRewardPoints: normalizeFloorRewardPoints(config.perfectRewardPoints)
        };
        setSaving(true);
        const { error } = await supabase
            .from('classes')
            .update({
                vocab_tower_grade: nextConfig.grade,
                vocab_tower_v2_perfect_reward_points: nextConfig.perfectRewardPoints,
                vocab_master_question_count: nextConfig.masterQuestionCount,
                vocab_master_input_count: nextConfig.masterInputCount,
                vocab_master_pass_correct: nextConfig.masterPassCorrect,
                vocab_master_pass_input: nextConfig.masterPassInput,
                vocab_master_seconds_per_question: nextConfig.masterSecondsPerQuestion,
                vocab_master_required_mastered_ratio: nextConfig.masterRequiredMasteredPercent / 100,
                vocab_summit_question_count: nextConfig.summitQuestionCount,
                vocab_summit_input_count: nextConfig.summitInputCount,
                vocab_summit_pass_correct: nextConfig.summitPassCorrect,
                vocab_summit_pass_input: nextConfig.summitPassInput,
                vocab_summit_input_count_2: nextConfig.summitInputCount2,
                vocab_summit_pass_input_2: nextConfig.summitPassInput2,
                vocab_summit_input_count_3: nextConfig.summitInputCount3,
                vocab_summit_pass_input_3: nextConfig.summitPassInput3
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

    const master = normalizeMasterSettings(config);
    const summitConfig = normalizeSummitSettings(config);
    // 세 단계를 한 표로 그린다. 값은 모두 학급 설정이고 난이도 축은 직접입력 비중 하나다.
    const summitStages = [
        { stage: 1, inputKey: 'summitInputCount', passKey: 'summitPassInput',
          inputCount: summitConfig.summitInputCount, passInput: summitConfig.summitPassInput, floor: 0 },
        { stage: 2, inputKey: 'summitInputCount2', passKey: 'summitPassInput2',
          inputCount: summitConfig.summitInputCount2, passInput: summitConfig.summitPassInput2,
          floor: summitConfig.summitInputCount },
        { stage: 3, inputKey: 'summitInputCount3', passKey: 'summitPassInput3',
          inputCount: summitConfig.summitInputCount3, passInput: summitConfig.summitPassInput3,
          floor: summitConfig.summitInputCount2 }
    ];
    const requiredMasteredWords = Math.ceil(SAMPLE_DECK_SIZE * master.masterRequiredMasteredPercent / 100);
    const masterChoiceCount = master.masterQuestionCount - master.masterInputCount;
    const masterTotalMinutes = Math.round(master.masterQuestionCount * master.masterSecondsPerQuestion / 60);

    return (
        <div className="vocab-teacher">
            <section className="vocab-teacher__overview" aria-labelledby="vocab-journey-title">
                <div className="vocab-teacher__section-heading">
                    <div>
                        <span className="vocab-teacher__eyebrow">현재 운영 요약</span>
                        <h3 id="vocab-journey-title">10개 층 덱을 고르는 개인 어휘 연습</h3>
                        <p>학생은 원하는 층에서 12문항을 연습하고, 그 층 낱말을 익힌 진도가 25·50·75·100%를 넘을 때마다 층당 {config.perfectRewardPoints}P를 나눠 받습니다.</p>
                    </div>
                    <span className="vocab-teacher__version">현재 운영 중</span>
                </div>
                <div className="vocab-teacher__journey-flow">
                    <div><span>📖</span><strong>뜻의 방</strong><small>뜻에 맞는 낱말</small></div>
                    <div><span>✍️</span><strong>문장의 방</strong><small>빈칸에 맞는 낱말</small></div>
                    <div><span>🔎</span><strong>구별의 방</strong><small>문맥에 맞는 낱말</small></div>
                    <div><span>📊</span><strong>12문항 결과</strong><small>층별 최고 정답률 기록</small></div>
                </div>
                <div className="vocab-teacher__summary">
                    <div><span>출제 범위</span><strong>{config.grade}학년</strong></div>
                    <div><span>기본 자료</span><strong>현재 덱 10개</strong></div>
                    <div><span>연습 횟수</span><strong>제한 없음</strong></div>
                    <div><span>연습 시간</span><strong>제한 없음</strong></div>
                    <div><span>층당 보상</span><strong>{config.perfectRewardPoints}P</strong></div>
                </div>
            </section>

            <section className="vocab-teacher__panel" aria-labelledby="vocab-settings-title">
                <div className="vocab-teacher__section-heading">
                    <div>
                        <span className="vocab-teacher__eyebrow">학급별 설정</span>
                        <div className="vocab-teacher__heading-row">
                            <h3 id="vocab-settings-title">개인 연습 설정</h3>
                            <TeacherGuideButton tabId="vocab-tower" variant="help" />
                        </div>
                        <p>현재 학년의 검수·잠금이 완료된 덱 10개를 자동으로 사용하며, 별도로 출제자료를 선택할 필요가 없습니다.</p>
                    </div>
                </div>

                <div className="vocab-teacher__controls">
                    <div className="vocab-teacher__source-card" aria-label="기본 출제자료 자동 설정">
                        <span aria-hidden="true">📚</span>
                        <div>
                            <strong>{config.grade}학년 현재 덱 10개</strong>
                            <small>검수와 잠금이 끝난 자료를 자동 출제합니다.</small>
                        </div>
                        <em>자동 설정</em>
                    </div>

                    <div className="vocab-teacher__settings-grid">
                        <label>
                            <span>📚 출제 학년</span>
                            <select value={config.grade} onChange={(event) => updateConfig('grade', event.target.value)}>
                                {[3, 4, 5, 6].map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}
                            </select>
                        </label>
                        <label>
                            <span>🏆 층당 진도 보상 총액</span>
                            <input type="number" min={VOCAB_FLOOR_REWARD_MIN_POINTS} max={VOCAB_FLOOR_REWARD_MAX_POINTS} step={VOCAB_FLOOR_REWARD_STEP_POINTS} value={config.perfectRewardPoints} onChange={(event) => updateConfig('perfectRewardPoints', event.target.value)} />
                        </label>
                    </div>
                </div>

                <div className="vocab-teacher__footer-actions">
                    <p>층당 총액을 25·50·75·100% 네 구간에 20·20·30·30%로 나눠 지급하며, 같은 구간은 한 번만 지급됩니다. 0P로 저장하면 보상을 끕니다.</p>
                    {/* 아래 덱마스터 섹션까지 한 번에 저장한다. 어느 쪽 버튼을 눌러도 결과는 같다. */}
                    <Button type="button" onClick={handleSave} loading={saving} loadingText="저장 중...">
                        설정 저장
                    </Button>
                </div>
            </section>

            <section className="vocab-teacher__panel" aria-labelledby="vocab-master-title">
                <div className="vocab-teacher__section-heading">
                    <div>
                        <span className="vocab-teacher__eyebrow">학급별 설정</span>
                        <div className="vocab-teacher__heading-row">
                            <h3 id="vocab-master-title">🏆 덱마스터 도전 조건</h3>
                        </div>
                        <p>한 층을 충분히 익힌 학생만 치는 공식 시험입니다. 합격하면 그 층의 덱마스터가 되고, 10개 층을 모두 채우면 <strong>어휘 마스터</strong> 휘장을 받습니다.</p>
                    </div>
                </div>

                <div className="vocab-teacher__controls vocab-teacher__controls--master">
                    <div className="vocab-teacher__source-card vocab-teacher__source-card--master" aria-label="현재 도전 조건 요약">
                        <span aria-hidden="true">🏆</span>
                        <div>
                            <strong>익힘 {master.masterRequiredMasteredPercent}% 이상이면 도전 가능 · {master.masterQuestionCount}문항 중 {master.masterPassCorrect}개 정답이면 합격</strong>
                            <small>
                                40낱말 층이면 {requiredMasteredWords}개를 익혀야 열립니다.
                                시험은 선택형 {masterChoiceCount}문항 + 직접입력 {master.masterInputCount}문항이고,
                                직접입력도 {master.masterPassInput}개 이상 맞혀야 합격입니다. 문항당 {master.masterSecondsPerQuestion}초(전체 약 {masterTotalMinutes}분).
                            </small>
                        </div>
                        <em>학급 설정</em>
                    </div>

                    <div className="vocab-teacher__settings-grid">
                        <label>
                            <span>🎯 도전 자격 (익힘 비율)</span>
                            <select value={config.masterRequiredMasteredPercent} onChange={(event) => updateConfig('masterRequiredMasteredPercent', event.target.value)}>
                                {[50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100].map((percent) => (
                                    <option key={percent} value={percent}>{percent}% (40낱말 중 {Math.ceil(SAMPLE_DECK_SIZE * percent / 100)}개)</option>
                                ))}
                            </select>
                        </label>
                        <label>
                            <span>📝 시험 문항 수</span>
                            <input type="number" min="5" max="30" step="1" value={config.masterQuestionCount} onChange={(event) => updateConfig('masterQuestionCount', event.target.value)} />
                        </label>
                        <label>
                            <span>✍️ 그중 직접입력 문항 수</span>
                            <input type="number" min="0" max={master.masterQuestionCount} step="1" value={config.masterInputCount} onChange={(event) => updateConfig('masterInputCount', event.target.value)} />
                        </label>
                        <label>
                            <span>⏱️ 문항당 제한 시간(초)</span>
                            <input type="number" min="10" max="300" step="5" value={config.masterSecondsPerQuestion} onChange={(event) => updateConfig('masterSecondsPerQuestion', event.target.value)} />
                        </label>
                        <label>
                            <span>✅ 합격 정답 수</span>
                            <input type="number" min="1" max={master.masterQuestionCount} step="1" value={config.masterPassCorrect} onChange={(event) => updateConfig('masterPassCorrect', event.target.value)} />
                        </label>
                        <label>
                            <span>✅ 합격 직접입력 정답 수</span>
                            <input type="number" min="0" max={master.masterInputCount} step="1" value={config.masterPassInput} onChange={(event) => updateConfig('masterPassInput', event.target.value)} />
                        </label>
                    </div>
                </div>

                <div className="vocab-teacher__footer-actions">
                    <p>
                        조건을 낮추면 더 많은 학생이 도전하고, 높이면 휘장의 무게가 올라갑니다. 도전 자격에는 <strong>그 층 낱말을 모두 한 번씩은 만나야 한다</strong>는 조건이 함께 걸려 있습니다.
                        이미 받은 덱마스터는 조건을 바꿔도 사라지지 않습니다.
                    </p>
                    <Button type="button" onClick={handleSave} loading={saving} loadingText="저장 중...">
                        설정 저장
                    </Button>
                </div>
            </section>

            <section className="vocab-teacher__panel" aria-labelledby="vocab-summit-title">
                <div className="vocab-teacher__section-heading">
                    <div>
                        <span className="vocab-teacher__eyebrow">학급별 설정</span>
                        <div className="vocab-teacher__heading-row">
                            <h3 id="vocab-summit-title">👑 어휘 마스터 관문 (탑의 정상)</h3>
                        </div>
                        <p>10개 층의 덱마스터를 모두 통과한 학생에게 지도 꼭대기에서 열리는 마지막 시험입니다. <strong>1 → 2 → 3단계 순서로</strong> 통과할 때마다 <strong>어휘 마스터</strong> 휘장에 별이 하나씩 늘어납니다.</p>
                    </div>
                </div>

                <div className="vocab-teacher__controls vocab-teacher__controls--master">
                    <div className="vocab-teacher__source-card vocab-teacher__source-card--summit" aria-label="정상 관문 조건 요약">
                        <span aria-hidden="true">👑</span>
                        <div>
                            <strong>덱마스터 10개를 모두 통과하면 열림 · 세 단계 모두 {summitConfig.summitQuestionCount}문항 중 {summitConfig.summitPassCorrect}개 정답이면 합격</strong>
                            <small>
                                출제는 10개 층 전체에서 고르게 나옵니다({summitConfig.summitQuestionCount}문항이면 층마다 {Math.round(summitConfig.summitQuestionCount / 10)}문항).
                                문항 수·합격 정답 수·문항당 시간({master.masterSecondsPerQuestion}초)은 세 단계가 같고, <b>직접입력 문항이 늘어나는 것만으로</b> 어려워집니다
                                ({summitStages.map((item) => `${item.stage}단계 ${item.inputCount}개`).join(' → ')}).
                            </small>
                        </div>
                        <em>학급 설정</em>
                    </div>

                    <div className="vocab-teacher__settings-grid">
                        <label>
                            <span>📝 시험 문항 수 (세 단계 공통)</span>
                            <input type="number" min="10" max="40" step="1" value={config.summitQuestionCount} onChange={(event) => updateConfig('summitQuestionCount', event.target.value)} />
                        </label>
                        <label>
                            <span>✅ 합격 정답 수 (세 단계 공통)</span>
                            <input type="number" min="1" max={summitConfig.summitQuestionCount} step="1" value={config.summitPassCorrect} onChange={(event) => updateConfig('summitPassCorrect', event.target.value)} />
                        </label>
                    </div>

                    <div className="vocab-teacher__stage-table" role="group" aria-label="단계별 직접입력 설정">
                        <div className="vocab-teacher__stage-head" aria-hidden="true">
                            <span>단계</span><span>✍️ 직접입력 문항 수</span><span>✅ 합격 직접입력 정답 수</span>
                        </div>
                        {summitStages.map((item) => (
                            <div className="vocab-teacher__stage-row" key={item.stage}>
                                <strong>{'⭐'.repeat(item.stage)} {item.stage}단계</strong>
                                <label>
                                    <span className="vocab-teacher__stage-label">{item.stage}단계 직접입력 문항 수</span>
                                    {/* 뒤 단계는 앞 단계보다 적을 수 없다(DB 제약과 같은 규칙). */}
                                    <input type="number" min={item.floor} max={summitConfig.summitQuestionCount} step="1"
                                           value={config[item.inputKey]}
                                           onChange={(event) => updateConfig(item.inputKey, event.target.value)} />
                                </label>
                                <label>
                                    <span className="vocab-teacher__stage-label">{item.stage}단계 합격 직접입력 정답 수</span>
                                    <input type="number" min="0" max={item.inputCount} step="1"
                                           value={config[item.passKey]}
                                           onChange={(event) => updateConfig(item.passKey, event.target.value)} />
                                </label>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="vocab-teacher__footer-actions">
                    <p>
                        마지막 시험이라 덱마스터보다 조금 어렵게 두는 것을 권합니다(기본값 20문항 중 17개). 3단계를 전부 직접입력으로 두면 “고르기”가 사라져 진짜 어휘력을 봅니다.
                        한 번 받은 별은 조건을 바꿔도 사라지지 않습니다.
                    </p>
                    <Button type="button" onClick={handleSave} loading={saving} loadingText="저장 중...">
                        설정 저장
                    </Button>
                </div>
            </section>
        </div>
    );
};

export default VocabularyTowerTeacherManager;
