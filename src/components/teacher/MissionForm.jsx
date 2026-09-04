import React from 'react';
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
    applyGenrePreset,
    describePresetResult,
    getGenrePreset
} from '../../modules/writing/mission-types/genreCatalog';

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

    const runGenrePreset = React.useCallback((genreId, { force = false } = {}) => {
        const result = applyGenrePreset(formData, genreId, {
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
                    .select('id, title, guide, genre, mission_type, min_chars, min_paragraphs, guide_questions, base_reward, bonus_threshold, bonus_reward, repeat_bonus_enabled, repeat_bonus_threshold, repeat_bonus_reward, repeat_bonus_max_count, allow_comments, tags, evaluation_rubric')
                    .eq('id', editingMissionId)
                    .maybeSingle();

                if (error) throw error;
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
                            border: '2px solid #3498DB',
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
                                    color: '#64748B'
                                }}>
                                    <div style={{ fontSize: '2rem' }}>불러오는 중</div>
                                    <div style={{ fontSize: 'var(--ui-text-md)', fontWeight: 'bold' }}>
                                        저장된 미션 내용을 다시 읽고 있어요.
                                    </div>
                                </div>
                            ) : (
                            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px' }}>
                                    <input
                                        type="text"
                                        placeholder="글쓰기 주제"
                                        value={formData.title}
                                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                                        style={{
                                            flex: 2,
                                            padding: '14px',
                                            borderRadius: '12px',
                                            border: '1px solid #ddd',
                                            fontSize: 'var(--ui-text-lg)',
                                            minHeight: '48px',
                                            width: '100%',
                                            boxSizing: 'border-box'
                                        }}
                                    />

                                    <select value={formData.genre} onChange={e => handleGenreChange(e.target.value)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #ddd', minHeight: '48px', width: '100%', boxSizing: 'border-box' }}>
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
                                </div>
                                <textarea
                                    placeholder="안내 가이드 (학생들에게 보여줄 기본 설명)"
                                    value={formData.guide}
                                    onChange={e => setFormData({ ...formData, guide: e.target.value })}
                                    style={{ padding: '14px', borderRadius: '12px', border: '1px solid #ddd', minHeight: '80px', fontSize: 'var(--ui-text-lg)', width: '100%', boxSizing: 'border-box' }}
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
                                        <span style={{ color: '#64748B', fontSize: 'var(--ui-text-sm)' }}>
                                            {hasSubmissions
                                                ? '제출이 시작돼 안내 질문은 그대로 두고 나머지만 채웁니다.'
                                                : '선생님이 고친 칸은 그대로 두고 빈 칸만 채웁니다.'}
                                        </span>
                                    </div>
                                )}

                                {presetNotice && (
                                    <div style={{ padding: '10px 14px', borderRadius: '12px', background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#15803D', fontSize: 'var(--ui-text-sm)', fontWeight: 'bold' }}>
                                        {presetNotice}
                                    </div>
                                )}

                                {/* 태그 입력 UI */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: '#F8F9FF', borderRadius: '16px', border: '1px solid #E0E7FF' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <label style={{ fontSize: 'var(--ui-text-sm)', color: '#4F46E5', fontWeight: 'bold' }}>🏷️ 미션 태그</label>
                                        <span style={{ fontSize: 'var(--ui-text-sm)', color: '#6366F1', opacity: 0.8 }}>* 태그를 입력하면 학생들의 글을 키워드별로 분류하여 관리할 수 있습니다.</span>
                                    </div>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {formData.tags?.map((tag, index) => (
                                            <motion.div
                                                initial={{ scale: 0.8, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                key={index}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                                    color: 'white',
                                                    padding: '6px 14px',
                                                    borderRadius: '20px',
                                                    fontSize: 'var(--ui-text-sm)',
                                                    fontWeight: 'bold',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                                }}
                                            >
                                                #{tag}
                                                <span
                                                    onClick={() => {
                                                        const newTags = formData.tags.filter((_, i) => i !== index);
                                                        setFormData({ ...formData, tags: newTags });
                                                    }}
                                                    style={{ cursor: 'pointer', opacity: 0.8, fontSize: '1.1rem', marginLeft: '4px' }}
                                                >
                                                    ×
                                                </span>
                                            </motion.div>
                                        ))}
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input
                                            type="text"
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
                                            style={{
                                                flex: 1,
                                                padding: '12px 16px',
                                                borderRadius: '12px',
                                                border: '1px solid #C7D2FE',
                                                fontSize: 'var(--ui-text-md)',
                                                boxSizing: 'border-box',
                                                background: 'white'
                                            }}
                                        />
                                        <Button
                                            type="button"
                                            onClick={() => {
                                                saveFrequentTag(tagInput.trim().replace(',', ''));
                                                handleAddTag(tagInput);
                                                setTagInput('');
                                            }}
                                            style={{
                                                background: '#C7D2FE',
                                                color: '#4F46E5',
                                                padding: '0 16px',
                                                fontSize: 'var(--ui-text-sm)',
                                                fontWeight: 'bold',
                                                minHeight: 'auto',
                                                height: '46px'
                                            }}
                                        >
                                            ⭐ 저장
                                        </Button>
                                    </div>

                                    {/* 자주 쓰는 태그 목록 */}
                                    {frequentTags?.length > 0 && (
                                        <div style={{ marginTop: '8px' }}>
                                            <div style={{ fontSize: 'var(--ui-text-sm)', color: '#6366F1', marginBottom: '8px', fontWeight: 'bold' }}>⭐ 자주 쓰는 태그 (클릭해서 추가)</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                {frequentTags.map((tag, idx) => (
                                                    <div
                                                        key={idx}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            background: 'white',
                                                            border: '1px solid #E0E7FF',
                                                            padding: '4px 10px',
                                                            borderRadius: '10px',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s'
                                                        }}
                                                        onClick={() => handleAddTag(tag)}
                                                    >
                                                        <span style={{ fontSize: 'var(--ui-text-sm)', color: '#4F46E5', fontWeight: 'bold' }}>#{tag}</span>
                                                        <span
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                removeFrequentTag(tag);
                                                            }}
                                                            style={{ color: '#FDA4AF', fontSize: 'var(--ui-text-md)', marginLeft: '4px', cursor: 'pointer' }}
                                                        >
                                                            ×
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* [개편] 핵심 질문 설계 인터페이스 */}
                                <div style={{
                                    background: '#F8F9FA',
                                    padding: '20px',
                                    borderRadius: '20px',
                                    border: useAIQuestions ? '2px solid #3498DB' : '1px dashed #BDC3C7',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    transition: 'all 0.3s'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div
                                            onClick={toggleAIQuestions}
                                            style={{
                                                width: '50px',
                                                height: '26px',
                                                background: useAIQuestions ? '#3498DB' : '#BDC3C7',
                                                borderRadius: '13px',
                                                position: 'relative',
                                                cursor: 'pointer',
                                                transition: 'background 0.3s'
                                            }}
                                        >
                                            <div style={{
                                                width: '20px',
                                                height: '20px',
                                                background: 'white',
                                                borderRadius: '50%',
                                                position: 'absolute',
                                                top: '3px',
                                                left: useAIQuestions ? '27px' : '3px',
                                                transition: 'left 0.3s'
                                            }} />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 'bold', fontSize: 'var(--ui-text-md)', color: '#2C3E50' }}>
                                                🎯 핵심 질문 설계 {useAIQuestions ? '(사용 중)' : '(선택)'}
                                            </div>
                                            <div style={{ fontSize: 'var(--ui-text-sm)', color: '#7F8C8D' }}>
                                                {useAIQuestions
                                                    ? `${formData.guide_questions?.length || 0}개의 질문이 준비되었습니다.`
                                                    : '학생들이 생각의 구조를 잡을 수 있도록 AI가 질문을 만들어줍니다.'}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => setIsLabQuestionsModalOpen(true)}
                                            style={{
                                                background: '#FDF2F8',
                                                color: '#DB2777',
                                                border: '1px solid #FBCFE8',
                                                borderRadius: '14px',
                                                fontWeight: 'bold',
                                                padding: '8px 14px'
                                            }}
                                        >
                                            🗳️ 연구소 질문 불러오기
                                        </Button>
                                        {useAIQuestions && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={() => setIsQuestionModalOpen(true)}
                                                style={{
                                                    background: 'linear-gradient(135deg, #36D1DC 0%, #5B86E0 100%)',
                                                    borderRadius: '14px',
                                                    color: 'white',
                                                    fontWeight: 'bold',
                                                    padding: '8px 16px',
                                                    border: 'none',
                                                    boxShadow: '0 4px 15px rgba(91, 134, 224, 0.3)'
                                                }}
                                            >
                                                🪄 질문 수정/설계하기
                                            </Button>
                                        )}
                                    </div>
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
                                                    <h2 style={{ margin: 0, fontSize: 'var(--ui-text-3xl)', fontWeight: '950', color: '#1E293B', letterSpacing: '-1px' }}>
                                                        🪄 핵심 질문 <span style={{ color: '#6366F1' }}>설계 마법사</span>
                                                    </h2>
                                                    <p style={{ margin: '14px 0 0 0', color: '#64748B', fontSize: '1.2rem', fontWeight: '500', letterSpacing: '-0.3px' }}>
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
                                                background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
                                                padding: '24px',
                                                borderRadius: '24px',
                                                marginBottom: '32px',
                                                display: 'flex',
                                                flexDirection: isMobile ? 'column' : 'row',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '16px',
                                                border: '1px solid #E2E8F0'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: '180px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                            <span style={{ fontSize: 'var(--ui-text-sm)', fontWeight: 'bold', color: '#6366F1' }}>질문 개수 설정</span>
                                                            <span style={{ fontSize: 'var(--ui-text-lg)', fontWeight: '900', color: '#4F46E5', background: 'white', padding: '2px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
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
                                                                background: '#E2E8F0',
                                                                borderRadius: '10px',
                                                                outline: 'none',
                                                                WebkitAppearance: 'none',
                                                                cursor: 'pointer',
                                                                accentColor: '#6366F1'
                                                            }}
                                                        />
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', padding: '0 2px' }}>
                                                            {[1, 2, 3, 4, 5].map(n => (
                                                                <span key={n} style={{ fontSize: 'var(--ui-text-sm)', color: (formData.question_count || 3) === n ? '#6366F1' : '#94A3B8', fontWeight: 'bold' }}>{n}</span>
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
                                                                border: '1px solid #E2E8F0',
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
                                                                e.currentTarget.style.borderColor = '#E2E8F0';
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
                                                                        background: 'linear-gradient(to bottom, #E2E8F0 50%, transparent 50%)',
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
                                                                    background: '#F8FAFC',
                                                                    padding: '20px 24px',
                                                                    borderRadius: '20px',
                                                                    resize: 'none',
                                                                    fontSize: '1.2rem',
                                                                    fontWeight: '600',
                                                                    color: '#0F172A',
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
                                                                    e.currentTarget.style.background = '#F8FAFC';
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
                                                                        background: '#F1F5F9',
                                                                        color: '#64748B',
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
                                                        border: '3px dashed #E2E8F0',
                                                        background: 'transparent',
                                                        borderRadius: '24px',
                                                        color: '#94A3B8',
                                                        cursor: 'pointer',
                                                        fontWeight: '900',
                                                        transition: 'all 0.2s',
                                                        fontSize: '1.1rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '12px'
                                                    }}
                                                    onMouseOver={e => { e.currentTarget.style.borderColor = '#6366F1'; e.currentTarget.style.color = '#6366F1'; e.currentTarget.style.background = '#F8FAFC'; }}
                                                    onMouseOut={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.background = 'transparent'; }}
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
                                                        background: '#1E293B',
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

                                {/* [통합] 미션 세부 설정 (분량, 댓글, 포인트) */}
                                <div style={{
                                    background: 'white',
                                    borderRadius: '24px',
                                    border: '1px solid #E0E0E0',
                                    padding: '32px',
                                    marginBottom: '24px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                                }}>
                                    {/* 헤더: 제목 + 저장 버튼 */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                        <h3 style={{ margin: 0, fontSize: 'var(--ui-text-lg)', color: '#2C3E50', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            ⚙️ 미션 세부 설정
                                        </h3>
                                        <Button
                                            type="button"
                                            onClick={handleSaveDefaultSettings}
                                            style={{
                                                background: '#F8F9FA',
                                                border: '1px solid #DFE6E9',
                                                color: '#636E72',
                                                padding: '5px 12px',
                                                fontSize: 'var(--ui-text-sm)',
                                                borderRadius: '8px',
                                                minHeight: 'auto',
                                                fontWeight: 'bold',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                transition: 'all 0.2s',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                            }}
                                            onMouseOver={e => { e.currentTarget.style.background = '#E2E6EA'; e.currentTarget.style.color = '#2D3436'; }}
                                            onMouseOut={e => { e.currentTarget.style.background = '#F8F9FA'; e.currentTarget.style.color = '#636E72'; }}
                                        >
                                            <span>💾</span> 설정값을 기본으로 저장
                                        </Button>
                                    </div>

                                    {/* 컨텐츠: 2컬럼 레이아웃 */}
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: isMobile ? 'column' : 'row',
                                        gap: isMobile ? '32px' : '48px',
                                        alignItems: 'flex-start'
                                    }}>
                                        {/* (Left) 분량 및 설정 */}
                                        <div style={{ flex: 1, width: '100%' }}>
                                            <label style={{ fontSize: 'var(--ui-text-md)', color: '#2E86C1', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                                <span style={{ fontSize: '1.1rem' }}>📏</span> 분량 및 설정
                                            </label>

                                            <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                                                <div style={{ flex: 1 }}>
                                                    <span style={{ fontSize: 'var(--ui-text-sm)', color: '#7F8C8D', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>최소 글자수</span>
                                                    <input
                                                        type="number"
                                                        step="50"
                                                        placeholder="0"
                                                        value={formData.min_chars}
                                                        onChange={e => setFormData({ ...formData, min_chars: parseInt(e.target.value) || 0 })}
                                                        style={{
                                                            width: '100%',
                                                            padding: '10px',
                                                            borderRadius: '12px',
                                                            border: '2px solid #AED6F1',
                                                            fontSize: 'var(--ui-text-lg)',
                                                            textAlign: 'center',
                                                            fontWeight: 'bold',
                                                            color: '#2C3E50',
                                                            boxSizing: 'border-box'
                                                        }}
                                                    />
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <span style={{ fontSize: 'var(--ui-text-sm)', color: '#7F8C8D', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>문단 개수</span>
                                                    <input
                                                        type="number"
                                                        placeholder="0"
                                                        value={formData.min_paragraphs}
                                                        onChange={e => setFormData({ ...formData, min_paragraphs: parseInt(e.target.value) || 0 })}
                                                        style={{
                                                            width: '100%',
                                                            padding: '10px',
                                                            borderRadius: '12px',
                                                            border: '2px solid #AED6F1',
                                                            fontSize: 'var(--ui-text-lg)',
                                                            textAlign: 'center',
                                                            fontWeight: 'bold',
                                                            color: '#2C3E50',
                                                            boxSizing: 'border-box'
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            {/* 댓글 허용 토글 */}
                                            <div
                                                onClick={() => setFormData({ ...formData, allow_comments: !formData.allow_comments })}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '10px',
                                                    background: formData.allow_comments ? '#E8F6F3' : '#F8F9FA',
                                                    padding: '12px',
                                                    borderRadius: '16px',
                                                    cursor: 'pointer',
                                                    border: formData.allow_comments ? '2px solid #1ABC9C' : '2px solid #BDC3C7',
                                                    transition: 'all 0.2s',
                                                    marginTop: '8px'
                                                }}
                                            >
                                                <span style={{ fontSize: '1.1rem' }}>
                                                    {formData.allow_comments ? '💬' : '🔒'}
                                                </span>
                                                <span style={{ fontSize: 'var(--ui-text-md)', fontWeight: 'bold', color: formData.allow_comments ? '#16A085' : '#7F8C8D' }}>
                                                    {formData.allow_comments ? '친구 댓글 허용함' : '댓글 기능 끄기'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* 구분선 (Desktop only) */}
                                        {!isMobile && <div style={{ width: '1px', alignSelf: 'stretch', background: '#ECF0F1', margin: '0 8px' }} />}

                                        {/* (Right) 포인트 보상 설정 */}
                                        <div style={{ flex: 1, width: '100%' }}>
                                            <label style={{ fontSize: 'var(--ui-text-md)', color: '#F39C12', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                                <span style={{ fontSize: '1.1rem' }}>💰</span> 포인트 보상 설정
                                            </label>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                {/* 기본 보상 */}
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    background: '#FFFDF0',
                                                    padding: '10px 14px',
                                                    borderRadius: '16px',
                                                    border: '1px solid #F9E79F'
                                                }}>
                                                    <span style={{ fontSize: 'var(--ui-text-md)', color: '#B7950B', fontWeight: 'bold' }}>기본 보상</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <input
                                                            type="number"
                                                            step="100"
                                                            value={formData.base_reward}
                                                            onChange={e => setFormData({ ...formData, base_reward: parseInt(e.target.value) || 0 })}
                                                            style={{
                                                                width: '90px',
                                                                padding: '6px',
                                                                borderRadius: '8px',
                                                                border: '2px solid #FDEBD0',
                                                                fontSize: 'var(--ui-text-lg)',
                                                                fontWeight: 'bold',
                                                                textAlign: 'right',
                                                                color: '#D35400',
                                                                background: 'white'
                                                            }}
                                                        />
                                                        <span style={{ fontSize: 'var(--ui-text-md)', fontWeight: '900', color: '#D35400' }}>P</span>
                                                    </div>
                                                </div>

                                                {/* 보너스 조건 */}
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    background: '#FFFDF0',
                                                    padding: '10px 14px',
                                                    borderRadius: '16px',
                                                    border: '1px solid #F9E79F',
                                                    flexWrap: 'wrap',
                                                    gap: '8px'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontSize: '1.1rem' }}>⚡</span>
                                                        <input
                                                            type="number"
                                                            step="100"
                                                            value={formData.bonus_threshold}
                                                            onChange={e => setFormData({ ...formData, bonus_threshold: parseInt(e.target.value) || 0 })}
                                                            style={{
                                                                width: '60px',
                                                                padding: '6px',
                                                                borderRadius: '8px',
                                                                border: '2px solid #FDEBD0',
                                                                fontSize: 'var(--ui-text-md)',
                                                                fontWeight: 'bold',
                                                                textAlign: 'center',
                                                                background: 'white'
                                                            }}
                                                        />
                                                        <span style={{ fontSize: 'var(--ui-text-sm)', color: '#7F8C8D', fontWeight: 'bold' }}>자 추가 작성 시</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontSize: 'var(--ui-text-md)', fontWeight: 'bold', color: '#B7950B' }}>+</span>
                                                        <input
                                                            type="number"
                                                            step="10"
                                                            value={formData.bonus_reward}
                                                            onChange={e => setFormData({ ...formData, bonus_reward: parseInt(e.target.value) || 0 })}
                                                            style={{
                                                                width: '60px',
                                                                padding: '6px',
                                                                borderRadius: '8px',
                                                                border: '2px solid #FDEBD0',
                                                                fontSize: 'var(--ui-text-md)',
                                                                fontWeight: 'bold',
                                                                textAlign: 'center',
                                                                color: '#D35400',
                                                                background: 'white'
                                                            }}
                                                        />
                                                        <span style={{ fontSize: 'var(--ui-text-md)', fontWeight: 'bold', color: '#D35400' }}>P</span>
                                                    </div>
                                                </div>

                                                <div style={{
                                                    background: '#FFFDF0', padding: '12px 14px', borderRadius: '16px',
                                                    border: '1px solid #F9E79F', display: 'flex', flexDirection: 'column', gap: '10px'
                                                }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--ui-text-sm)', color: '#7F6000', fontWeight: 'bold' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={Boolean(formData.repeat_bonus_enabled)}
                                                            onChange={e => setFormData({ ...formData, repeat_bonus_enabled: e.target.checked })}
                                                        />
                                                        글자 수 구간별 반복 보너스 사용
                                                    </label>
                                                    {formData.repeat_bonus_enabled && (
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                                                            <label style={{ fontSize: 'var(--ui-text-xs)', color: '#7F8C8D' }}>
                                                                반복 글자 수
                                                                <input type="number" min="1" max="20000" step="50" value={formData.repeat_bonus_threshold} onChange={e => setFormData({ ...formData, repeat_bonus_threshold: Math.max(1, parseInt(e.target.value) || 1) })} style={{ width: '100%', marginTop: '4px', padding: '7px', borderRadius: '8px', border: '2px solid #FDEBD0' }} />
                                                            </label>
                                                            <label style={{ fontSize: 'var(--ui-text-xs)', color: '#7F8C8D' }}>
                                                                구간당 포인트
                                                                <input type="number" min="1" max="10000" step="10" value={formData.repeat_bonus_reward} onChange={e => setFormData({ ...formData, repeat_bonus_reward: Math.max(1, parseInt(e.target.value) || 1) })} style={{ width: '100%', marginTop: '4px', padding: '7px', borderRadius: '8px', border: '2px solid #FDEBD0' }} />
                                                            </label>
                                                            <label style={{ fontSize: 'var(--ui-text-xs)', color: '#7F8C8D' }}>
                                                                최대 반복 횟수
                                                                <input type="number" min="1" max="20" value={formData.repeat_bonus_max_count} onChange={e => setFormData({ ...formData, repeat_bonus_max_count: Math.min(20, Math.max(1, parseInt(e.target.value) || 1)) })} style={{ width: '100%', marginTop: '4px', padding: '7px', borderRadius: '8px', border: '2px solid #FDEBD0' }} />
                                                            </label>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <RubricSettings
                                    rubric={formData.evaluation_rubric}
                                    onChange={(evaluationRubric) => setFormData({
                                        ...formData,
                                        evaluation_rubric: evaluationRubric
                                    })}
                                    isMobile={isMobile}
                                    onSaveDefaultRubric={handleSaveDefaultRubric}
                                />
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setIsPreviewOpen(true)}
                                        style={{ flex: isMobile ? '1 1 100%' : 1, height: '54px', borderRadius: '14px', fontWeight: 'bold' }}
                                    >
                                        👀 학생에게 어떻게 보일까요?
                                    </Button>
                                    {isEditing && (
                                        <Button
                                            type="button"
                                            onClick={handleCancelEdit}
                                            style={{ flex: 1, backgroundColor: '#95A5A6', color: 'white', fontWeight: 'bold', height: '54px', borderRadius: '14px' }}
                                        >
                                            취소하기
                                        </Button>
                                    )}
                                    <Button type="submit" style={{ flex: 2, backgroundColor: isEditing ? '#F39C12' : '#3498DB', color: 'white', fontWeight: 'bold', height: '54px', borderRadius: '14px' }}>
                                        {isEditing ? '수정 완료 ✏️' : '글쓰기 미션 공개하기 🚀'}
                                    </Button>
                                </div>
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
                        <h2 style={{ fontSize: 'var(--ui-text-3xl)', fontWeight: '950', color: '#2C3E50', margin: 0, letterSpacing: '-1px' }}>
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
