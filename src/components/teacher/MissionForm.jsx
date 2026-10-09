import React from 'react';

import {
    getMissionScheduleError,
    getMissionScheduleInputMin,
    MISSION_SCHEDULE_TICK_SECONDS
} from '../../modules/writing/mission-form/missionSchedule';
import Card from '../common/Card';
import Button from '../common/Button';
import ModalCloseButton from '../common/ModalCloseButton';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabaseClient';
import { readLocalStorageJson } from '../../lib/browserStorage';
import RubricSettings from '../../modules/writing/evaluation/RubricSettings';
import MissionLabQuestionsModal from './MissionLabQuestionsModal';
import {
    describePresetResult,
    getGenrePreset
} from '../../modules/writing/mission-types/genreCatalog';
import MissionPromptFields from '../../modules/writing/mission-form/MissionPromptFields';
import { applyGenreToMissionDraft } from '../../modules/writing/mission-form/missionDraft';
import PeerReadingChoice, { PeerCommentSwitch, peerReadingLockReason } from '../../modules/writing/mission-form/PeerReadingChoice';
import MissionFormStep, { MissionFormActions, MissionFormGroup } from '../../modules/writing/mission-form/MissionFormStep';
import FeatureAvailabilitySwitch from '../common/FeatureAvailabilitySwitch';

const MissionStudentPreview = React.lazy(() => import('./MissionStudentPreview'));

const MissionForm = ({
    classId, isFormOpen, isEditing, editingMissionId, formData, setFormData,
    genreCategories, presetGenre, setPresetGenre, submittedCount = 0,
    handleSubmit, handleCancelEdit, isMobile,
    handleGenerateQuestions, isGeneratingQuestions,
    handleSaveDefaultRubric, handleSaveDefaultSettings,
    frequentTags, saveFrequentTag, removeFrequentTag, ask
}) => {
    const [isQuestionModalOpen, setIsQuestionModalOpen] = React.useState(false);
    // 함께 읽기 잠금(20261388): 친구들에게 연 과제·이미 낸 글이 있는 과제는 수정에서 바꾸지 않는다
    const [peerOpenedAt, setPeerOpenedAt] = React.useState(null);
    const peerLockReason = peerReadingLockReason({ isEditing, openedAt: peerOpenedAt, submittedCount });
    const [isLabQuestionsModalOpen, setIsLabQuestionsModalOpen] = React.useState(false);
    const [tagInput, setTagInput] = React.useState('');
    const [isLoadingEditMission, setIsLoadingEditMission] = React.useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
    const closePreview = React.useCallback(() => setIsPreviewOpen(false), []);
    const [presetNotice, setPresetNotice] = React.useState('');
    // 학생 답은 질문 번호 순서로 저장된다. 제출이 시작된 뒤 기존 질문을 고치거나 지우면
    // 이미 쓴 답이 엉뚱한 질문 밑으로 밀리고 되돌릴 수 없다(초안은 학생 기기에만 있다).
    // 그래서 제출이 있으면 불러온 질문만 잠그고, 뒤에 새로 더하는 것은 열어 둔다.
    const [lockedQuestionCount, setLockedQuestionCount] = React.useState(0);
    const hasSubmissions = Number(submittedCount) > 0;
    const useAIQuestions = (formData.guide_questions?.length > 0) || formData.use_ai_questions;
    // 아래 고정 줄의 지금 설정 요약(2026-10-09 화면 정리)
    const missionSummary = [
        formData.genre,
        `${formData.min_chars || 0}자 이상`,
        formData.min_paragraphs ? `${formData.min_paragraphs}문단` : '',
        `${formData.base_reward || 0}P`,
        formData.peer_reading_enabled === false ? '🔒 선생님만 읽음' : (formData.allow_comments ? '👀 반 친구가 읽고 댓글' : '👀 반 친구가 읽음'),
        useAIQuestions ? `질문 ${formData.guide_questions?.length || 0}개` : '',
        formData.schedule_at ? '🕒 예약' : '바로 공개'
    ];

    const runGenrePreset = React.useCallback((genreId, { force = false } = {}) => {
        const result = applyGenreToMissionDraft(formData, genreId, {
            previousGenre: presetGenre,
            force,
            keepQuestions: hasSubmissions
        });
        setFormData(result.formData);
        setPresetGenre?.(genreId);
        setPresetNotice(describePresetResult(genreId, result));
    }, [formData, presetGenre, hasSubmissions, setFormData, setPresetGenre]);

    const handleGenreChange = (genreId) => {
        if (!getGenrePreset(genreId)) {
            setFormData({ ...formData, genre: genreId });
            setPresetGenre?.(genreId);
            setPresetNotice('');
            return;
        }
        runGenrePreset(genreId);
    };

    const handleImportLabQuestions = React.useCallback((newQuestions) => {
        if (!Array.isArray(newQuestions) || newQuestions.length === 0) return;
        setFormData((prev) => {
            const existing = (prev.guide_questions || []).filter(Boolean);
            const combined = [...existing];
            for (const q of newQuestions) {
                if (!combined.includes(q)) {
                    combined.push(q);
                }
            }
            return {
                ...prev,
                guide_questions: combined,
                use_ai_questions: true
            };
        });
    }, [setFormData]);

    const toggleAIQuestions = async () => {
        if (useAIQuestions) {
            if (hasSubmissions) {
                await ask({
                    title: '🔒 이미 제출한 학생이 있어 질문을 모두 지울 수 없습니다',
                    body: '학생이 쓴 답이 질문 번호에 맞춰 저장돼 있기 때문입니다. 질문을 더하는 것은 할 수 있어요.',
                    confirmLabel: '알겠어요',
                    acknowledgeOnly: true
                });
                return;
            }
            // 적어 둔 질문이 사라지는 일이라 붉은 단추로 묻는다.
            if (await ask({
                title: '만들어 둔 질문을 모두 지울까요?',
                body: '지금까지 적은 핵심 질문이 사라집니다.',
                confirmLabel: '질문 지우기 ⚠️',
                tone: 'danger'
            })) {
                setFormData({ ...formData, guide_questions: [], use_ai_questions: false });
            }
        } else {
            setFormData({ ...formData, use_ai_questions: true });
            setIsQuestionModalOpen(true);
        }
    };

    const handleAddTag = (val) => {
        const cleanVal = val.trim().replace(',', '');
        if (cleanVal && !formData.tags?.includes(cleanVal)) {
            setFormData({ ...formData, tags: [...(formData.tags || []), cleanVal] });
        }
    };

    React.useEffect(() => {
        if (!isFormOpen || !isEditing || !editingMissionId) return;

        let isMounted = true;

        const loadEditingMission = async () => {
            setIsLoadingEditMission(true);

            try {
                const { data, error } = await supabase
                    .from('writing_missions')
                    .select('id, title, guide, genre, mission_type, min_chars, min_paragraphs, guide_questions, base_reward, bonus_threshold, bonus_reward, repeat_bonus_enabled, repeat_bonus_threshold, repeat_bonus_reward, repeat_bonus_max_count, allow_comments, peer_reading_enabled, peer_reading_opened_at, tags, evaluation_rubric')
                    .eq('id', editingMissionId)
                    .maybeSingle();

                if (error) throw error;
                if (isMounted) setPeerOpenedAt(data?.peer_reading_opened_at || null);
                if (!data || !isMounted) return;

                const defaultLevels = readLocalStorageJson('default_rubric_levels', [
                    { score: 3, label: '우수' },
                    { score: 2, label: '보통' },
                    { score: 1, label: '노력' }
                ]);

                setLockedQuestionCount((data.guide_questions || []).length);
                setFormData({
                    title: data.title || '',
                    guide: data.guide || '',
                    genre: data.genre || '글쓰기',
                    min_chars: data.min_chars ?? 100,
                    min_paragraphs: data.min_paragraphs ?? 1,
                    base_reward: data.base_reward ?? 100,
                    bonus_threshold: data.bonus_threshold ?? 100,
                    bonus_reward: data.bonus_reward ?? 10,
                    repeat_bonus_enabled: data.repeat_bonus_enabled ?? false,
                    repeat_bonus_threshold: data.repeat_bonus_threshold ?? 100,
                    repeat_bonus_reward: data.repeat_bonus_reward ?? 10,
                    repeat_bonus_max_count: data.repeat_bonus_max_count ?? 3,
                    allow_comments: data.allow_comments ?? true,
                    peer_reading_enabled: data.peer_reading_enabled ?? true,
                    mission_type: data.mission_type || data.genre || '글쓰기',
                    guide_questions: data.guide_questions || [],
                    question_count: (data.guide_questions || []).length || 3,
                    tags: data.tags || [],
                    evaluation_rubric: data.evaluation_rubric || {
                        use_rubric: false,
                        levels: defaultLevels
                    }
                });
            } catch (err) {
                console.error('[MissionForm] 수정용 미션 로드 실패:', err.message);
            } finally {
                if (isMounted) {
                    setIsLoadingEditMission(false);
                }
            }
        };

        loadEditingMission();

        return () => {
            isMounted = false;
        };
    }, [isFormOpen, isEditing, editingMissionId, setFormData]);

    React.useEffect(() => {
        if (!isFormOpen) {
            setPresetNotice('');
            return;
        }
        if (!isEditing) setLockedQuestionCount(0);
    }, [isFormOpen, isEditing]);

    return (
        <>

            <AnimatePresence>
                {isFormOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginBottom: '24px' }}>
                        <Card style={{
                            padding: isMobile ? '16px' : '24px',
                            border: '1px solid var(--ui-border)',
                            width: '100%',
                            maxWidth: 'none',
                            margin: '0 0 24px 0',
                            boxSizing: 'border-box',
                            overflow: 'hidden'
                        }}>
                            {isLoadingEditMission ? (
                                <div style={{
                                    minHeight: '220px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '12px',
                                    color: 'var(--ui-ink-muted)'
                                }}>
                                    <div style={{ fontSize: '2rem' }}>불러오는 중</div>
                                    <div style={{ fontSize: 'var(--ui-text-md)', fontWeight: 'bold' }}>
                                        저장된 미션 내용을 다시 읽고 있어요.
                                    </div>
                                </div>
                            ) : (
                            <form onSubmit={handleSubmit} className="mission-form-steps">
                                <MissionFormStep number={1} title="무엇을 쓰나요?" description="주제와 글 종류, 학생에게 보여 줄 안내를 적어요.">
                                <MissionPromptFields
                                    title={formData.title}
                                    guide={formData.guide}
                                    onTitleChange={(title) => setFormData({ ...formData, title })}
                                    onGuideChange={(guide) => setFormData({ ...formData, guide })}
                                    isMobile={isMobile}
                                    titleAccessory={(
                                        <select value={formData.genre} onChange={e => handleGenreChange(e.target.value)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid var(--ui-border)', minHeight: '48px', width: '100%', boxSizing: 'border-box' }}>
                                            {genreCategories.map(cat => (
                                                <optgroup key={cat.label} label={cat.label}>
                                                    {cat.entries.map(entry => <option key={entry.id} value={entry.id}>{entry.id}</option>)}
                                                </optgroup>
                                            ))}
                                            {/* 목록에서 빠진 지난 종류(일기·동시 등)로 저장된 미션도 값이 조용히 바뀌지 않게 남긴다. */}
                                            {!genreCategories.some(cat => cat.entries.some(entry => entry.id === formData.genre)) && formData.genre && (
                                                <optgroup label="🗂 지난 종류">
                                                    <option value={formData.genre}>{formData.genre}</option>
                                                </optgroup>
                                            )}
                                        </select>
                                    )}
                                />

                                {getGenrePreset(formData.genre) && (
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => runGenrePreset(formData.genre, { force: true })}
                                            style={{ background: '#EEF2FF', color: '#4338CA', border: '1px solid #C7D2FE', borderRadius: '12px', fontWeight: 'bold' }}
                                        >
                                            ✨ {formData.genre} 프리셋 다시 넣기
                                        </Button>
                                        <span style={{ color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)' }}>
                                            {hasSubmissions
                                                ? '제출이 시작돼 안내 질문은 그대로 두고 나머지만 채웁니다.'
                                                : '선생님이 고친 칸은 그대로 두고 빈 칸만 채웁니다.'}
                                        </span>
                                    </div>
                                )}

                                {presetNotice && (
                                    <div style={{ padding: '10px 14px', borderRadius: '12px', background: 'var(--ui-success-soft)', border: '1px solid #BBF7D0', color: 'var(--ui-success)', fontSize: 'var(--ui-text-sm)', fontWeight: 'bold' }}>
                                        {presetNotice}
                                    </div>
                                )}

                                </MissionFormStep>

                                <MissionFormStep number={2} optional title="생각 돕기" description="학생이 생각의 구조를 잡도록 핵심 질문을 줘요. 연구소에서 만든 질문도 불러올 수 있어요.">
                                    <FeatureAvailabilitySwitch
                                        checked={Boolean(useAIQuestions)}
                                        onChange={() => toggleAIQuestions()}
                                        ariaLabel="핵심 질문 사용"
                                        enabledLabel="🎯 핵심 질문 사용 중"
                                        disabledLabel="🎯 핵심 질문 사용 안 함"
                                        enabledDescription={`${formData.guide_questions?.length || 0}개의 질문이 준비되었어요.`}
                                        disabledDescription="켜면 AI가 생각을 이끄는 질문을 만들어 줘요."
                                        fullWidth
                                    />
                                    <div style={{ display: 'flex', gap: 'var(--ui-space-2)', flexWrap: 'wrap' }}>
                                        <Button type="button" variant="outline" onClick={() => setIsLabQuestionsModalOpen(true)}>
                                            🗳️ 연구소 질문 불러오기
                                        </Button>
                                        {useAIQuestions && (
                                            <Button type="button" onClick={() => setIsQuestionModalOpen(true)}>
                                                🪄 질문 수정·설계하기
                                            </Button>
                                        )}
                                    </div>

                                {typeof document !== 'undefined' && isQuestionModalOpen && createPortal(
                                    <div
                                        style={{
                                            position: 'fixed',
                                            top: 0, left: 0, right: 0, bottom: 0,
                                            backgroundColor: 'rgba(15, 23, 42, 0.4)',
                                            zIndex: 99999,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            padding: isMobile ? '0' : '20px',
                                            backdropFilter: 'blur(12px)',
                                            WebkitBackdropFilter: 'blur(12px)'
                                        }}
                                        onClick={() => setIsQuestionModalOpen(false)}
                                    >
                                        <motion.div
                                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                            animate={{ scale: 1, opacity: 1, y: 0 }}
                                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                                width: '100%',
                                                maxWidth: '1000px',
                                                maxHeight: isMobile ? '100%' : '85vh',
                                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                                borderRadius: isMobile ? '0' : '40px',
                                                padding: isMobile ? '24px' : '48px 60px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                boxShadow: '0 40px 100px -20px rgba(0, 0, 0, 0.2)',
                                                position: 'relative',
                                                overflow: 'hidden',
                                                border: '1px solid rgba(255, 255, 255, 0.5)'
                                            }}
                                        >
                                            {/* 헤더 부분 */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '32px' }}>
                                                <div>
                                                    <h2 style={{ margin: 0, fontSize: 'var(--ui-text-3xl)', fontWeight: '950', color: 'var(--ui-ink-strong)', letterSpacing: '-1px' }}>
                                                        🪄 핵심 질문 <span style={{ color: '#6366F1' }}>설계 마법사</span>
                                                    </h2>
                                                    <p style={{ margin: '14px 0 0 0', color: 'var(--ui-ink-muted)', fontSize: '1.2rem', fontWeight: '500', letterSpacing: '-0.3px' }}>
                                                        학생들이 생각의 깊이를 더할 수 있도록 글의 구조를 잡는 징검다리 질문을 디자인합니다.
                                                    </p>
                                                </div>
                                                <ModalCloseButton
                                                    onClick={() => setIsQuestionModalOpen(false)}
                                                    label="핵심 질문 설계 마법사 닫기"
                                                />
                                            </div>

                                            {/* AI 생성 컨트롤바 */}
                                            <div style={{
                                                background: 'linear-gradient(135deg, var(--ui-page) 0%, var(--ui-surface-muted) 100%)',
                                                padding: '24px',
                                                borderRadius: '24px',
                                                marginBottom: '32px',
                                                display: 'flex',
                                                flexDirection: isMobile ? 'column' : 'row',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '16px',
                                                border: '1px solid var(--ui-border)'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: '180px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                            <span style={{ fontSize: 'var(--ui-text-sm)', fontWeight: 'bold', color: '#6366F1' }}>질문 개수 설정</span>
                                                            <span style={{ fontSize: 'var(--ui-text-lg)', fontWeight: '900', color: '#4F46E5', background: 'white', padding: '2px 12px', borderRadius: '10px', border: '1px solid var(--ui-border)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                                                {formData.question_count || 3}개
                                                            </span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min="1"
                                                            max="5"
                                                            step="1"
                                                            value={formData.question_count || 3}
                                                            onChange={e => setFormData({ ...formData, question_count: parseInt(e.target.value) })}
                                                            style={{
                                                                width: '100%',
                                                                height: '8px',
                                                                background: 'var(--ui-border)',
                                                                borderRadius: '10px',
                                                                outline: 'none',
                                                                WebkitAppearance: 'none',
                                                                cursor: 'pointer',
                                                                accentColor: '#6366F1'
                                                            }}
                                                        />
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', padding: '0 2px' }}>
                                                            {[1, 2, 3, 4, 5].map(n => (
                                                                <span key={n} style={{ fontSize: 'var(--ui-text-sm)', color: (formData.question_count || 3) === n ? '#6366F1' : 'var(--ui-ink-subtle)', fontWeight: 'bold' }}>{n}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
                                                    <Button
                                                        type="button"
                                                        onClick={() => setIsLabQuestionsModalOpen(true)}
                                                        style={{
                                                            background: 'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)',
                                                            color: 'white',
                                                            fontWeight: '900',
                                                            border: 'none',
                                                            padding: '16px 24px',
                                                            borderRadius: '18px',
                                                            fontSize: 'var(--ui-text-lg)',
                                                            boxShadow: '0 10px 20px -5px rgba(219, 39, 119, 0.4)',
                                                            flex: isMobile ? 1 : 'none',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '6px'
                                                        }}
                                                    >
                                                        🗳️ 연구소 좋은 질문 불러오기
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        onClick={async () => {
                                                            if (hasSubmissions) {
                                                                await ask({
                                                                    title: '🔒 이미 제출한 학생이 있어 질문을 새로 만들 수 없습니다',
                                                                    body: '아래 `질문 추가`로 질문을 더하는 것은 할 수 있어요.',
                                                                    confirmLabel: '알겠어요',
                                                                    acknowledgeOnly: true
                                                                });
                                                                return;
                                                            }
                                                            handleGenerateQuestions(formData.question_count || 3);
                                                        }}
                                                        disabled={isGeneratingQuestions || hasSubmissions}
                                                        style={{
                                                            background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
                                                            color: 'white',
                                                            fontWeight: '900',
                                                            border: 'none',
                                                            padding: '16px 28px',
                                                            borderRadius: '18px',
                                                            fontSize: 'var(--ui-text-lg)',
                                                            boxShadow: '0 10px 20px -5px rgba(99, 102, 241, 0.4)',
                                                            flex: isMobile ? 1 : 'none'
                                                        }}
                                                    >
                                                        {isGeneratingQuestions ? '🧠 인공지능이 설계 중...' : '✨ AI가 질문 추천하기'}
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* 질문 리스트 영역 */}
                                            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '12px', marginBottom: '24px' }}>
                                                <AnimatePresence>
                                                    {(formData.guide_questions || []).map((q, idx) => (
                                                        <motion.div
                                                            key={idx}
                                                            initial={{ x: -20, opacity: 0 }}
                                                            animate={{ x: 0, opacity: 1 }}
                                                            exit={{ x: 20, opacity: 0 }}
                                                            style={{
                                                                display: 'flex',
                                                                gap: '24px',
                                                                background: 'white',
                                                                border: '1px solid var(--ui-border)',
                                                                padding: '32px',
                                                                borderRadius: '28px',
                                                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                                alignItems: 'center',
                                                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                                                                position: 'relative'
                                                            }}
                                                            onMouseOver={e => {
                                                                e.currentTarget.style.borderColor = '#6366F1';
                                                                e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
                                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                                            }}
                                                            onMouseOut={e => {
                                                                e.currentTarget.style.borderColor = 'var(--ui-border)';
                                                                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)';
                                                                e.currentTarget.style.transform = 'translateY(0)';
                                                            }}
                                                        >
                                                            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                                <div style={{
                                                                    width: '42px',
                                                                    height: '42px',
                                                                    background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
                                                                    color: 'white',
                                                                    borderRadius: '14px',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontWeight: '900',
                                                                    flexShrink: 0,
                                                                    fontSize: '1.2rem',
                                                                    boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)',
                                                                    zIndex: 2
                                                                }}>
                                                                    {idx + 1}
                                                                </div>
                                                                {idx < (formData.guide_questions?.length - 1) && (
                                                                    <div style={{
                                                                        position: 'absolute',
                                                                        top: '42px',
                                                                        bottom: '-36px',
                                                                        width: '4px',
                                                                        background: 'linear-gradient(to bottom, var(--ui-border) 50%, transparent 50%)',
                                                                        backgroundSize: '4px 12px',
                                                                        zIndex: 1
                                                                    }} />
                                                                )}
                                                            </div>
                                                            <textarea
                                                                value={q}
                                                                readOnly={hasSubmissions && idx < lockedQuestionCount}
                                                                onChange={e => {
                                                                    if (hasSubmissions && idx < lockedQuestionCount) return;
                                                                    const newQs = [...formData.guide_questions];
                                                                    newQs.splice(idx, 1, e.target.value);
                                                                    setFormData({ ...formData, guide_questions: newQs });
                                                                }}
                                                                style={{
                                                                    flex: 1,
                                                                    background: 'var(--ui-page)',
                                                                    padding: '20px 24px',
                                                                    borderRadius: '20px',
                                                                    resize: 'none',
                                                                    fontSize: '1.2rem',
                                                                    fontWeight: '600',
                                                                    color: 'var(--ui-ink)',
                                                                    outline: 'none',
                                                                    fontFamily: 'inherit',
                                                                    lineHeight: '1.7',
                                                                    border: '1px solid transparent',
                                                                    transition: 'all 0.2s'
                                                                }}
                                                                onFocus={e => {
                                                                    e.currentTarget.style.background = 'white';
                                                                    e.currentTarget.style.borderColor = '#6366F1';
                                                                    e.currentTarget.style.boxShadow = '0 0 0 4px rgba(99, 102, 241, 0.1)';
                                                                }}
                                                                onBlur={e => {
                                                                    e.currentTarget.style.background = 'var(--ui-page)';
                                                                    e.currentTarget.style.borderColor = 'transparent';
                                                                    e.currentTarget.style.boxShadow = 'none';
                                                                }}
                                                                rows={2}
                                                                placeholder="질문 내용을 입력해주세요..."
                                                            />
                                                            {hasSubmissions && idx < lockedQuestionCount ? (
                                                                <span
                                                                    title="학생이 이 질문에 쓴 답이 질문 번호로 저장돼 있어 고치거나 지울 수 없습니다."
                                                                    style={{
                                                                        background: 'var(--ui-surface-muted)',
                                                                        color: 'var(--ui-ink-muted)',
                                                                        padding: '10px',
                                                                        borderRadius: '12px',
                                                                        fontWeight: 'bold',
                                                                        fontSize: 'var(--ui-text-sm)',
                                                                        whiteSpace: 'nowrap'
                                                                    }}
                                                                >
                                                                    🔒 제출 시작됨
                                                                </span>
                                                            ) : (
                                                                <button
                                                                    onClick={() => {
                                                                        const newQs = formData.guide_questions.filter((_, i) => i !== idx);
                                                                        setFormData({ ...formData, guide_questions: newQs });
                                                                    }}
                                                                    style={{
                                                                        border: 'none',
                                                                        background: '#FFF1F2',
                                                                        color: '#F43F5E',
                                                                        cursor: 'pointer',
                                                                        padding: '10px',
                                                                        borderRadius: '12px',
                                                                        fontWeight: 'bold',
                                                                        fontSize: 'var(--ui-text-sm)',
                                                                        transition: 'all 0.2s'
                                                                    }}
                                                                    onMouseOver={e => e.currentTarget.style.background = '#FFE4E6'}
                                                                    onMouseOut={e => e.currentTarget.style.background = '#FFF1F2'}
                                                                >
                                                                    삭제
                                                                </button>
                                                            )}
                                                        </motion.div>
                                                    ))}
                                                </AnimatePresence>

                                                <button
                                                    onClick={() => setFormData({ ...formData, guide_questions: [...(formData.guide_questions || []), ''] })}
                                                    style={{
                                                        width: '100%',
                                                        padding: '24px',
                                                        border: '3px dashed var(--ui-border)',
                                                        background: 'transparent',
                                                        borderRadius: '24px',
                                                        color: 'var(--ui-ink-subtle)',
                                                        cursor: 'pointer',
                                                        fontWeight: '900',
                                                        transition: 'all 0.2s',
                                                        fontSize: '1.1rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '12px'
                                                    }}
                                                    onMouseOver={e => { e.currentTarget.style.borderColor = '#6366F1'; e.currentTarget.style.color = '#6366F1'; e.currentTarget.style.background = 'var(--ui-page)'; }}
                                                    onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--ui-border)'; e.currentTarget.style.color = 'var(--ui-ink-subtle)'; e.currentTarget.style.background = 'transparent'; }}
                                                >
                                                    <span>➕</span> 직접 질문 추가하기
                                                </button>
                                            </div>

                                            {/* 하단 버튼 */}
                                            < div style={{ display: 'flex', gap: '16px' }}>
                                                <Button
                                                    onClick={() => setIsQuestionModalOpen(false)}
                                                    style={{
                                                        flex: 1,
                                                        height: '64px',
                                                        borderRadius: '20px',
                                                        background: 'var(--ui-ink-strong)',
                                                        color: 'white',
                                                        fontWeight: '900',
                                                        fontSize: '1.2rem',
                                                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                                                    }}
                                                >
                                                    설계 완료
                                                </Button>
                                            </div>
                                        </motion.div>
                                    </div>,
                                    document.body
                                )}

                                {isLabQuestionsModalOpen && (
                                    <MissionLabQuestionsModal
                                        classId={classId}
                                        onSelectQuestions={handleImportLabQuestions}
                                        onClose={() => setIsLabQuestionsModalOpen(false)}
                                    />
                                )}

                                </MissionFormStep>

                                <MissionFormStep
                                    number={3}
                                    title="쓰는 조건"
                                    description="분량, 함께 읽기, 포인트를 정해요."
                                    actions={(
                                        <Button type="button" variant="outline" size="sm" onClick={handleSaveDefaultSettings}>
                                            💾 설정값을 기본으로 저장
                                        </Button>
                                    )}
                                >
                                    <MissionFormGroup title="📏 분량">
                                        <div className="mission-field-row">
                                            <label className="mission-field-label">
                                                최소 글자 수
                                                <input
                                                    type="number"
                                                    className="mission-field-input"
                                                    step="50"
                                                    min="0"
                                                    value={formData.min_chars}
                                                    onChange={e => setFormData({ ...formData, min_chars: parseInt(e.target.value) || 0 })}
                                                />
                                            </label>
                                            <label className="mission-field-label">
                                                문단 개수
                                                <input
                                                    type="number"
                                                    className="mission-field-input"
                                                    min="0"
                                                    value={formData.min_paragraphs}
                                                    onChange={e => setFormData({ ...formData, min_paragraphs: parseInt(e.target.value) || 0 })}
                                                />
                                            </label>
                                        </div>
                                    </MissionFormGroup>

                                    <MissionFormGroup title="👥 함께 읽기">
                                        <div className="mission-field-row">
                                            <PeerReadingChoice
                                                enabled={formData.peer_reading_enabled ?? true}
                                                lockedReason={peerLockReason}
                                                onChange={(patch) => setFormData({ ...formData, ...patch })}
                                            />
                                            <PeerCommentSwitch
                                                allowComments={formData.allow_comments}
                                                peerReadingEnabled={formData.peer_reading_enabled ?? true}
                                                onChange={(next) => setFormData({ ...formData, allow_comments: next })}
                                            />
                                        </div>
                                    </MissionFormGroup>

                                    <MissionFormGroup title="💰 포인트">
                                        <div className="mission-field-row">
                                            <label className="mission-field-label">
                                                기본 보상(P)
                                                <input
                                                    type="number"
                                                    className="mission-field-input"
                                                    step="100"
                                                    min="0"
                                                    value={formData.base_reward}
                                                    onChange={e => setFormData({ ...formData, base_reward: parseInt(e.target.value) || 0 })}
                                                />
                                            </label>
                                            <label className="mission-field-label">
                                                보너스 — 몇 자 더 쓰면
                                                <input
                                                    type="number"
                                                    className="mission-field-input"
                                                    step="100"
                                                    min="0"
                                                    value={formData.bonus_threshold}
                                                    onChange={e => setFormData({ ...formData, bonus_threshold: parseInt(e.target.value) || 0 })}
                                                />
                                            </label>
                                            <label className="mission-field-label">
                                                보너스 포인트(P)
                                                <input
                                                    type="number"
                                                    className="mission-field-input"
                                                    step="10"
                                                    min="0"
                                                    value={formData.bonus_reward}
                                                    onChange={e => setFormData({ ...formData, bonus_reward: parseInt(e.target.value) || 0 })}
                                                />
                                            </label>
                                        </div>
                                        <FeatureAvailabilitySwitch
                                            checked={Boolean(formData.repeat_bonus_enabled)}
                                            onChange={(next) => setFormData({ ...formData, repeat_bonus_enabled: next })}
                                            ariaLabel="글자 수 구간별 반복 보너스"
                                            enabledLabel="🔁 글자 수 구간별 반복 보너스 사용 중"
                                            disabledLabel="🔁 글자 수 구간별 반복 보너스 사용 안 함"
                                            enabledDescription="정한 글자 수마다 포인트를 또 줘요(최대 횟수까지)."
                                            disabledDescription="켜면 길게 쓸수록 구간마다 포인트를 더 줘요."
                                            fullWidth
                                        />
                                        {formData.repeat_bonus_enabled && (
                                            <div className="mission-field-row">
                                                <label className="mission-field-label">
                                                    반복 글자 수
                                                    <input type="number" className="mission-field-input" min="1" max="20000" step="1" value={formData.repeat_bonus_threshold} onChange={e => setFormData({ ...formData, repeat_bonus_threshold: Math.max(1, parseInt(e.target.value) || 1) })} />
                                                </label>
                                                <label className="mission-field-label">
                                                    구간당 포인트
                                                    <input type="number" className="mission-field-input" min="1" max="10000" step="1" value={formData.repeat_bonus_reward} onChange={e => setFormData({ ...formData, repeat_bonus_reward: Math.max(1, parseInt(e.target.value) || 1) })} />
                                                </label>
                                                <label className="mission-field-label">
                                                    최대 반복 횟수
                                                    <input type="number" className="mission-field-input" min="1" max="20" value={formData.repeat_bonus_max_count} onChange={e => setFormData({ ...formData, repeat_bonus_max_count: Math.min(20, Math.max(1, parseInt(e.target.value) || 1)) })} />
                                                </label>
                                            </div>
                                        )}
                                    </MissionFormGroup>
                                </MissionFormStep>

                                <MissionFormStep number={4} optional title="평가와 관리" description="평가 루브릭, 글을 모아 볼 태그, 학생에게 여는 시각을 정해요.">
                                    <MissionFormGroup title="📊 글쓰기 평가 루브릭">
                                        <RubricSettings
                                            bare
                                            rubric={formData.evaluation_rubric}
                                            onChange={(evaluationRubric) => setFormData({
                                                ...formData,
                                                evaluation_rubric: evaluationRubric
                                            })}
                                            isMobile={isMobile}
                                            onSaveDefaultRubric={handleSaveDefaultRubric}
                                        />
                                    </MissionFormGroup>

                                    <MissionFormGroup title="🏷️ 미션 태그">
                                        <p className="mission-step__hint">태그를 붙이면 학생 글을 낱말별로 모아 볼 수 있어요. 학생에게는 보이지 않아요.</p>
                                        {formData.tags?.length > 0 && (
                                            <div className="mission-chip-list">
                                                {formData.tags.map((tag, index) => (
                                                    <span className="mission-chip" key={`${tag}-${index}`}>
                                                        #{tag}
                                                        <button
                                                            type="button"
                                                            aria-label={`${tag} 태그 빼기`}
                                                            onClick={() => setFormData({ ...formData, tags: formData.tags.filter((_, i) => i !== index) })}
                                                        >
                                                            ×
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', gap: 'var(--ui-space-2)' }}>
                                            <input
                                                type="text"
                                                className="mission-field-input"
                                                aria-label="태그 입력"
                                                placeholder="태그 입력 (엔터 또는 쉼표)"
                                                value={tagInput}
                                                onChange={e => setTagInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ',') {
                                                        e.preventDefault();
                                                        handleAddTag(tagInput);
                                                        setTagInput('');
                                                    }
                                                }}
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                title="이 태그를 붙이고 자주 쓰는 태그에도 남겨요"
                                                style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}
                                                onClick={() => {
                                                    saveFrequentTag(tagInput.trim().replace(',', ''));
                                                    handleAddTag(tagInput);
                                                    setTagInput('');
                                                }}
                                            >
                                                ⭐ 저장
                                            </Button>
                                        </div>
                                        {frequentTags?.length > 0 && (
                                            <div className="mission-chip-list" aria-label="자주 쓰는 태그 — 누르면 붙어요">
                                                {frequentTags.map((tag) => (
                                                    <span
                                                        className="mission-chip is-suggestion"
                                                        key={tag}
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => handleAddTag(tag)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag(tag); }}
                                                    >
                                                        + #{tag}
                                                        <button
                                                            type="button"
                                                            aria-label={`${tag} 자주 쓰는 태그에서 지우기`}
                                                            onClick={(e) => { e.stopPropagation(); removeFrequentTag(tag); }}
                                                        >
                                                            ×
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </MissionFormGroup>

                                    {/*
                                      * 예약 공개. 켜면 정한 시각까지 학생에게 보이지 않는다.
                                      * 숨기는 방법이 보관과 같은 스위치라, 학생 쪽 조회·쓰기는 이미 막혀 있다.
                                      */}
                                    <MissionFormGroup title="🕒 여는 시각">
                                        <FeatureAvailabilitySwitch
                                            checked={Boolean(formData.schedule_at)}
                                            onChange={(next) => setFormData({
                                                ...formData,
                                                schedule_at: next ? getMissionScheduleInputMin() : ''
                                            })}
                                            ariaLabel="정한 시각에 저절로 열기"
                                            enabledLabel="정한 시각에 저절로 열어요"
                                            disabledLabel="저장하면 바로 열어요"
                                            enabledDescription="그때까지 학생에게 보이지 않아요."
                                            disabledDescription="켜면 날짜와 시각을 정해 저절로 열 수 있어요."
                                            fullWidth
                                        />
                                        {formData.schedule_at ? (
                                            <div>
                                                <input
                                                    type="datetime-local"
                                                    className="mission-field-input"
                                                    aria-label="여는 날짜와 시각"
                                                    value={formData.schedule_at}
                                                    min={getMissionScheduleInputMin()}
                                                    onChange={(event) => setFormData({ ...formData, schedule_at: event.target.value })}
                                                />
                                                {getMissionScheduleError(formData.schedule_at) ? (
                                                    <p style={{ margin: '8px 0 0', color: 'var(--ui-danger)', fontSize: 'var(--ui-text-sm)', fontWeight: 'bold' }}>
                                                        {getMissionScheduleError(formData.schedule_at)}
                                                    </p>
                                                ) : (
                                                    <p className="mission-step__hint">
                                                        시각은 한국 시간이고, 확인이 {MISSION_SCHEDULE_TICK_SECONDS}초마다 돌아 최대 1분쯤 늦게 열릴 수 있어요.
                                                    </p>
                                                )}
                                            </div>
                                        ) : null}
                                    </MissionFormGroup>
                                </MissionFormStep>

                                <MissionFormActions summary={missionSummary}>
                                    <Button type="button" variant="outline" onClick={() => setIsPreviewOpen(true)}>
                                        👀 학생에게 어떻게 보일까요?
                                    </Button>
                                    {isEditing && (
                                        <Button type="button" variant="ghost" onClick={handleCancelEdit}>
                                            취소하기
                                        </Button>
                                    )}
                                    <Button type="submit">
                                        {isEditing ? '수정 완료 ✏️' : (formData.schedule_at ? '예약하기 🕒' : '글쓰기 미션 공개하기 🚀')}
                                    </Button>
                                </MissionFormActions>
                            </form >
                            )}
                        </Card >
                    </motion.div >
                )}
            </AnimatePresence >

            {/* AI 핵심 질문 생성 로딩 오버레이 (최상단 레이어 보장) */}
            < AnimatePresence >
                {isGeneratingQuestions && typeof document !== 'undefined' && createPortal(
                    <motion.div
                        key="ai-loading-root"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed',
                            top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: 'rgba(255, 255, 255, 0.85)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            zIndex: 2000000000,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center'
                        }}
                    >
                        <motion.div
                            animate={{
                                scale: [1, 1.3, 1],
                                rotate: [0, 20, -20, 0]
                            }}
                            transition={{
                                duration: 1.2,
                                repeat: Infinity,
                                ease: "easeInOut"
                            }}
                            style={{ fontSize: '7rem', marginBottom: '24px', filter: 'drop-shadow(0 0 20px rgba(52, 152, 219, 0.4))' }}
                        >
                            🪄
                        </motion.div>
                        <h2 style={{ fontSize: 'var(--ui-text-3xl)', fontWeight: '950', color: 'var(--ui-ink-strong)', margin: 0, letterSpacing: '-1px' }}>
                            핵심질문을 설계하고 있어요
                        </h2>
                    </motion.div>,
                    document.body
                )}
            </AnimatePresence >

            {isPreviewOpen && (
                <React.Suspense fallback={null}>
                    <MissionStudentPreview
                        isOpen
                        onClose={closePreview}
                        mission={formData}
                    />
                </React.Suspense>
            )}
        </>
    );
};

export default MissionForm;
