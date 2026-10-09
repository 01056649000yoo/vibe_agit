import React, { useCallback, useState } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import Card from '../../../../components/common/Card';
import Button from '../../../../components/common/Button';
import RubricSettings, { createDefaultEvaluationRubric } from '../../evaluation/RubricSettings';
import PeerReadingChoice, { PeerCommentSwitch, peerReadingErrorMessage, peerReadingLockReason } from '../../mission-form/PeerReadingChoice';
import MissionFormStep, { MissionFormActions, MissionFormGroup } from '../../mission-form/MissionFormStep';

const MissionStudentPreview = React.lazy(() => import('../../../../components/teacher/MissionStudentPreview'));

const getInitialForm = (mission) => ({
    title: mission?.title || '',
    guide: mission?.guide || '',
    min_stanzas: mission?.template_config?.min_stanzas ?? mission?.min_paragraphs ?? 3,
    min_lines_per_stanza: mission?.template_config?.min_lines_per_stanza ?? 1,
    base_reward: mission?.base_reward ?? 100,
    allow_comments: mission?.allow_comments ?? true,
    peer_reading_enabled: mission?.peer_reading_enabled ?? true,
    evaluation_rubric: createDefaultEvaluationRubric(mission?.evaluation_rubric),
});

const normalizeStepValue = (value, min, step) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return min;
    return Math.max(min, min + Math.round((numericValue - min) / step) * step);
};

const NumberSetting = ({ label, value, min, step = 1, onChange, description }) => (
    <label style={{ display: 'block' }}>
        <span style={{ display: 'block', marginBottom: '7px', color: '#475569', fontSize: '0.85rem', fontWeight: '800' }}>{label}</span>
        <div style={{ display: 'flex', gap: '6px' }}>
            {step > 1 && (
                <button
                    type="button"
                    onClick={() => onChange(Math.max(min, normalizeStepValue(value, min, step) - step))}
                    disabled={Number(value) <= min}
                    aria-label={`${label} ${step} 줄이기`}
                    style={{ width: '42px', borderRadius: '10px', border: '1px solid #CBD5E1', background: '#F8FAFC', color: '#475569', fontWeight: '900', cursor: Number(value) <= min ? 'not-allowed' : 'pointer' }}
                >−</button>
            )}
            <input
                type="number"
                min={min}
                step={step}
                value={value}
                onChange={(event) => onChange(Math.max(min, Number(event.target.value) || min))}
                onBlur={() => onChange(normalizeStepValue(value, min, step))}
                style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid #CBD5E1', fontSize: '1rem', textAlign: step > 1 ? 'center' : 'left' }}
            />
            {step > 1 && (
                <button
                    type="button"
                    onClick={() => onChange(normalizeStepValue(value, min, step) + step)}
                    aria-label={`${label} ${step} 늘리기`}
                    style={{ width: '42px', borderRadius: '10px', border: '1px solid #CBD5E1', background: '#F0FDF4', color: '#15803D', fontWeight: '900', cursor: 'pointer' }}
                >＋</button>
            )}
        </div>
        <span style={{ display: 'block', marginTop: '5px', color: '#94A3B8', fontSize: '0.72rem' }}>{description}</span>
    </label>
);

const PoemMissionForm = ({ activeClass, mission = null, isMobile, onBack, onSaved }) => {
    const [form, setForm] = useState(() => getInitialForm(mission));
    const [saving, setSaving] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const closePreview = useCallback(() => setIsPreviewOpen(false), []);

    const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!form.title.trim() || !form.guide.trim()) {
            alert('시 쓰기 주제와 안내 내용을 입력해주세요. 🌿');
            return;
        }

        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const payload = {
                class_id: activeClass.id,
                teacher_id: user?.id,
                title: form.title.trim(),
                guide: form.guide.trim(),
                genre: '시',
                mission_type: 'poem',
                input_template: 'poem',
                template_config: {
                    min_stanzas: form.min_stanzas,
                    min_lines_per_stanza: form.min_lines_per_stanza,
                },
                min_chars: 0,
                min_paragraphs: form.min_stanzas,
                base_reward: normalizeStepValue(form.base_reward, 0, 10),
                bonus_threshold: 0,
                bonus_reward: 0,
                allow_comments: form.allow_comments,
                peer_reading_enabled: form.peer_reading_enabled,
                guide_questions: [],
                tags: ['시쓰기'],
                evaluation_rubric: form.evaluation_rubric,
                is_archived: false,
            };

            const query = mission?.id
                ? supabase.from('writing_missions').update(payload).eq('id', mission.id)
                : supabase.from('writing_missions').insert(payload);
            const { error } = await query;
            if (error) throw error;

            alert(mission?.id ? '시 쓰기 미션이 수정되었습니다. 🌿' : '시 쓰기 미션이 공개되었습니다. 🌿');
            onSaved?.();
        } catch (error) {
            console.error('[PoemMissionForm] 저장 실패:', error.message);
            alert(peerReadingErrorMessage(error) || '시 쓰기 미션 저장에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ width: '100%', padding: isMobile ? '8px 0' : '8px 12px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
                <Button variant="ghost" size="sm" onClick={onBack}>⬅️ 돌아가기</Button>
                <div>
                    <h2 style={{ margin: 0, color: '#166534', fontSize: '1.35rem' }}>🌿 {mission?.id ? '시 쓰기 미션 수정' : '시 쓰기 미션 만들기'}</h2>
                    <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: '0.82rem' }}>학생에게 연별 입력칸을 제공하는 글쓰기 틀입니다.</p>
                </div>
            </div>

            <Card style={{ maxWidth: 'none', width: '100%', padding: isMobile ? '20px' : '28px', borderRadius: '22px', border: '1px solid var(--ui-border)', boxSizing: 'border-box' }}>
                <form onSubmit={handleSubmit} className="mission-form-steps">
                    <MissionFormStep number={1} title="무엇을 쓰나요?" description="시 주제와 학생에게 보여 줄 안내를 적어요.">
                        <label className="mission-field-label">
                            시 쓰기 주제
                            <input className="mission-field-input" value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="예: 여름비를 오감으로 표현해 봅시다" />
                        </label>
                        <label className="mission-field-label">
                            학생 안내
                            <textarea className="mission-field-input" value={form.guide} onChange={(event) => update('guide', event.target.value)} placeholder="시에서 표현할 장면과 느낌을 안내해주세요." style={{ minHeight: '110px', resize: 'vertical', fontFamily: 'inherit' }} />
                        </label>
                    </MissionFormStep>

                    <MissionFormStep number={2} optional title="글의 틀" description="학생 화면에 연별 입력칸이 열려요. 연과 행 수를 정해요.">
                        <div className="mission-field-row">
                            <NumberSetting label="최소 연 수" value={form.min_stanzas} min={1} onChange={(value) => update('min_stanzas', value)} description="학생 화면에 이 수만큼 연 입력칸이 먼저 열립니다." />
                            <NumberSetting label="연별 최소 행" value={form.min_lines_per_stanza} min={1} onChange={(value) => update('min_lines_per_stanza', value)} description="각 연에 필요한 최소 줄 수입니다." />
                        </div>
                    </MissionFormStep>

                    <MissionFormStep number={3} title="쓰는 조건" description="함께 읽기와 포인트를 정해요.">
                        <MissionFormGroup title="👥 함께 읽기">
                            <div className="mission-field-row">
                                <PeerReadingChoice enabled={form.peer_reading_enabled} lockedReason={peerReadingLockReason({ isEditing: Boolean(mission?.id), openedAt: mission?.peer_reading_opened_at })} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} />
                                <PeerCommentSwitch allowComments={form.allow_comments} peerReadingEnabled={form.peer_reading_enabled} onChange={(next) => update('allow_comments', next)} />
                            </div>
                        </MissionFormGroup>
                        <MissionFormGroup title="💰 포인트">
                            <NumberSetting label="완료 포인트" value={form.base_reward} min={0} step={10} onChange={(value) => update('base_reward', value)} description="10P 단위로 조정하며 교사 승인 후 지급합니다." />
                        </MissionFormGroup>
                    </MissionFormStep>

                    <MissionFormStep number={4} optional title="평가와 관리" description="평가 루브릭을 정해요.">
                        <MissionFormGroup title="📊 글쓰기 평가 루브릭">
                            <RubricSettings
                                bare
                                rubric={form.evaluation_rubric}
                                onChange={(evaluationRubric) => update('evaluation_rubric', evaluationRubric)}
                                isMobile={isMobile}
                                recommendedCodes={['4국05-04', '6국05-05']}
                            />
                        </MissionFormGroup>
                    </MissionFormStep>

                    <MissionFormActions summary={[
                        '시',
                        `${form.min_stanzas || 1}연 · 연마다 ${form.min_lines_per_stanza || 1}행 이상`,
                        `${form.base_reward || 0}P`,
                        form.peer_reading_enabled === false ? '🔒 선생님만 읽음' : (form.allow_comments ? '👀 반 친구가 읽고 댓글' : '👀 반 친구가 읽음')
                    ]}>
                        <Button type="button" variant="outline" onClick={() => setIsPreviewOpen(true)}>
                            👀 학생에게 어떻게 보일까요?
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? '저장 중...' : mission?.id ? '시 쓰기 미션 수정하기' : '시 쓰기 미션 공개하기'}
                        </Button>
                    </MissionFormActions>
                </form>
            </Card>

            {isPreviewOpen && (
                <React.Suspense fallback={null}>
                    <MissionStudentPreview
                        isOpen
                        onClose={closePreview}
                        mission={{
                            title: form.title,
                            guide: form.guide,
                            genre: '시',
                            mission_type: 'poem',
                            input_template: 'poem',
                            template_config: {
                                min_stanzas: form.min_stanzas,
                                min_lines_per_stanza: form.min_lines_per_stanza,
                            },
                            min_chars: 0,
                            min_paragraphs: form.min_stanzas,
                            base_reward: form.base_reward,
                            bonus_threshold: 0,
                            bonus_reward: 0,
                            allow_comments: form.allow_comments,
                            peer_reading_enabled: form.peer_reading_enabled,
                            guide_questions: [],
                        }}
                    />
                </React.Suspense>
            )}
        </div>
    );
};

export default PoemMissionForm;
