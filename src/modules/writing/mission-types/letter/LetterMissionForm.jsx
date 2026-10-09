import React, { useState } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import Card from '../../../../components/common/Card';
import Button from '../../../../components/common/Button';
import RubricSettings, { createDefaultEvaluationRubric } from '../../evaluation/RubricSettings';
import { DEFAULT_LETTER_PAPER, LETTER_PAPERS, getLetterPaper } from './letterPapers';
import PeerReadingChoice, { PeerCommentSwitch } from '../../mission-form/PeerReadingChoice';
import MissionFormStep, { MissionFormActions, MissionFormGroup } from '../../mission-form/MissionFormStep';

const getInitialForm = (mission) => ({
    title: mission?.title || '',
    guide: mission?.guide || '',
    min_body_chars: mission?.template_config?.min_body_chars ?? mission?.min_chars ?? 200,
    letter_paper: mission?.template_config?.letter_paper ?? DEFAULT_LETTER_PAPER,
    base_reward: mission?.base_reward ?? 100,
    allow_comments: mission?.allow_comments ?? true,
    peer_reading_enabled: mission?.peer_reading_enabled ?? true,
    evaluation_rubric: createDefaultEvaluationRubric(mission?.evaluation_rubric),
});

const LetterMissionForm = ({ activeClass, mission = null, isMobile, onBack, onSaved }) => {
    const [form, setForm] = useState(() => getInitialForm(mission));
    const [saving, setSaving] = useState(false);
    const [printing, setPrinting] = useState(false);

    const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const paper = getLetterPaper(form.letter_paper);

    // 학생 글이 아니라 빈 양식만 뽑는 길은 지금까지 없었다. 편지지 한 장을 빈 항목으로 태워 보낸다.
    const handlePrintBlankPaper = async () => {
        if (printing) return;
        setPrinting(true);
        try {
            const { exportWritingEntriesToPdf } = await import('../../export/writingPdfExport.js');
            await exportWritingEntriesToPdf({
                items: [{
                    학생글제목: paper.label,
                    작성자: '',
                    미션제목: form.title || paper.label,
                    내용: '',
                    _inputTemplate: 'letter',
                    _structuredContent: { template: 'letter', version: 1, blank: true },
                }],
                title: `${paper.label}`,
                contentType: 'assignment',
                renderMode: paper.value,
            });
        } catch (error) {
            console.error('[LetterMissionForm] 편지지 인쇄 실패:', error.message);
            alert('편지지 인쇄 화면을 열지 못했습니다.');
        } finally {
            setPrinting(false);
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!form.title.trim() || !form.guide.trim()) {
            alert('편지 쓰기 주제와 안내 내용을 입력해주세요. ✉️');
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
                genre: '편지',
                mission_type: 'letter',
                input_template: 'letter',
                template_config: {
                    min_body_chars: form.min_body_chars,
                    letter_paper: form.letter_paper,
                },
                min_chars: 0,
                min_paragraphs: 0,
                base_reward: Math.max(0, Math.round(Number(form.base_reward) / 10) * 10),
                bonus_threshold: 0,
                bonus_reward: 0,
                allow_comments: form.allow_comments,
                peer_reading_enabled: form.peer_reading_enabled,
                guide_questions: [],
                tags: ['편지쓰기'],
                evaluation_rubric: form.evaluation_rubric,
                is_archived: false,
            };

            const query = mission?.id
                ? supabase.from('writing_missions').update(payload).eq('id', mission.id)
                : supabase.from('writing_missions').insert(payload);
            const { error } = await query;
            if (error) throw error;

            alert(mission?.id ? '편지 쓰기 미션이 수정되었습니다. ✉️' : '편지 쓰기 미션이 공개되었습니다. ✉️');
            onSaved?.();
        } catch (error) {
            console.error('[LetterMissionForm] 저장 실패:', error.message);
            alert('편지 쓰기 미션 저장에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ width: '100%', padding: isMobile ? '8px 0' : '8px 12px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
                <Button variant="ghost" size="sm" onClick={onBack}>⬅️ 돌아가기</Button>
                <div>
                    <h2 style={{ margin: 0, color: '#9D174D', fontSize: '1.35rem' }}>✉️ {mission?.id ? '편지 쓰기 미션 수정' : '편지 쓰기 미션 만들기'}</h2>
                    <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: '0.82rem' }}>받는 사람·첫인사·하고 싶은 말·끝인사 칸을 학생에게 제공합니다.</p>
                </div>
            </div>

            <Card style={{ maxWidth: 'none', width: '100%', padding: isMobile ? '20px' : '28px', borderRadius: '22px', border: '1px solid var(--ui-border)', boxSizing: 'border-box' }}>
                <form onSubmit={handleSubmit} className="mission-form-steps">
                    <MissionFormStep number={1} title="무엇을 쓰나요?" description="편지 주제와 학생에게 보여 줄 안내를 적어요.">
                        <label className="mission-field-label">
                            편지 쓰기 주제
                            <input className="mission-field-input" value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="예: 어버이날, 부모님께 마음을 담아 편지를 써 봅시다" />
                        </label>
                        <label className="mission-field-label">
                            학생 안내
                            <textarea className="mission-field-input" value={form.guide} onChange={(event) => update('guide', event.target.value)} placeholder="누구에게, 어떤 마음을 전하는 편지인지 안내해주세요." style={{ minHeight: '110px', resize: 'vertical', fontFamily: 'inherit' }} />
                        </label>
                    </MissionFormStep>

                    <MissionFormStep number={2} optional title="글의 틀" description="받는 사람·첫인사·하고 싶은 말·끝인사 칸이 학생에게 나와요. 내보낼 때 쓸 편지지를 골라요.">
                        <label className="mission-field-label">
                            ✉️ 편지지
                            <select className="mission-field-input" value={form.letter_paper} onChange={(event) => update('letter_paper', event.target.value)}>
                                {LETTER_PAPERS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.emoji} {option.label}</option>
                                ))}
                            </select>
                            <small>{paper.description} 학생 글을 PDF로 내보낼 때 기본으로 쓰고, 내보내는 화면에서 바꿀 수도 있어요.</small>
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--ui-space-2)' }}>
                            <Button type="button" variant="outline" onClick={handlePrintBlankPaper} loading={printing} loadingText="편지지 여는 중...">
                                🖨️ 빈 편지지 인쇄하기
                            </Button>
                            <span className="mission-step__hint">손으로 옮겨 쓰게 할 때 써요. 글 없이 편지지만 나와요.</span>
                        </div>
                    </MissionFormStep>

                    <MissionFormStep number={3} title="쓰는 조건" description="분량, 함께 읽기, 포인트를 정해요.">
                        <MissionFormGroup title="📏 분량">
                            <label className="mission-field-label">
                                하고 싶은 말 최소 글자 수
                                <input className="mission-field-input" type="number" min="0" step="50" value={form.min_body_chars} onChange={(event) => update('min_body_chars', Math.max(0, Number(event.target.value) || 0))} />
                                <small>받는 사람·첫인사·끝인사는 글자 수를 세지 않아요.</small>
                            </label>
                        </MissionFormGroup>
                        <MissionFormGroup title="👥 함께 읽기">
                            <div className="mission-field-row">
                                <PeerReadingChoice enabled={form.peer_reading_enabled} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} />
                                <PeerCommentSwitch allowComments={form.allow_comments} peerReadingEnabled={form.peer_reading_enabled} onChange={(next) => update('allow_comments', next)} />
                            </div>
                        </MissionFormGroup>
                        <MissionFormGroup title="💰 포인트">
                            <label className="mission-field-label">
                                제출 보상 포인트
                                <input className="mission-field-input" type="number" min="0" step="10" value={form.base_reward} onChange={(event) => update('base_reward', Math.max(0, Number(event.target.value) || 0))} />
                            </label>
                        </MissionFormGroup>
                    </MissionFormStep>

                    <MissionFormStep number={4} optional title="평가와 관리" description="평가 루브릭을 정해요.">
                        <MissionFormGroup title="📊 글쓰기 평가 루브릭">
                            <RubricSettings bare rubric={form.evaluation_rubric} onChange={(value) => update('evaluation_rubric', value)} isMobile={isMobile} />
                        </MissionFormGroup>
                    </MissionFormStep>

                    <MissionFormActions summary={[
                        '편지',
                        `하고 싶은 말 ${form.min_body_chars || 0}자 이상`,
                        `${form.base_reward || 0}P`,
                        form.peer_reading_enabled === false ? '🔒 선생님만 읽음' : (form.allow_comments ? '👀 반 친구가 읽고 댓글' : '👀 반 친구가 읽음')
                    ]}>
                        <Button type="button" variant="ghost" onClick={onBack}>취소</Button>
                        <Button type="submit" loading={saving} loadingText="저장 중...">
                            {mission?.id ? '편지 쓰기 미션 수정' : '편지 쓰기 미션 공개하기'}
                        </Button>
                    </MissionFormActions>
                </form>
            </Card>
        </div>
    );
};

export default LetterMissionForm;
