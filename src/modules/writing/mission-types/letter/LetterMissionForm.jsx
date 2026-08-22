import React, { useState } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import Card from '../../../../components/common/Card';
import Button from '../../../../components/common/Button';
import RubricSettings, { createDefaultEvaluationRubric } from '../../evaluation/RubricSettings';
import { DEFAULT_LETTER_PAPER, LETTER_PAPERS, getLetterPaper } from './letterPapers';

const getInitialForm = (mission) => ({
    title: mission?.title || '',
    guide: mission?.guide || '',
    min_body_chars: mission?.template_config?.min_body_chars ?? mission?.min_chars ?? 200,
    letter_paper: mission?.template_config?.letter_paper ?? DEFAULT_LETTER_PAPER,
    base_reward: mission?.base_reward ?? 100,
    allow_comments: mission?.allow_comments ?? true,
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

            <Card style={{ maxWidth: 'none', width: '100%', padding: isMobile ? '20px' : '28px', borderRadius: '22px', border: '1px solid #FCE7F3', boxSizing: 'border-box' }}>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <label>
                        <span style={{ display: 'block', marginBottom: '7px', color: '#334155', fontWeight: '800' }}>편지 쓰기 주제 *</span>
                        <input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="예: 어버이날, 부모님께 마음을 담아 편지를 써 봅시다" style={{ width: '100%', boxSizing: 'border-box', padding: '14px', borderRadius: '12px', border: '1px solid #CBD5E1', fontSize: '1rem' }} />
                    </label>
                    <label>
                        <span style={{ display: 'block', marginBottom: '7px', color: '#334155', fontWeight: '800' }}>학생 안내 *</span>
                        <textarea value={form.guide} onChange={(event) => update('guide', event.target.value)} placeholder="누구에게, 어떤 마음을 전하는 편지인지 안내해주세요." style={{ width: '100%', minHeight: '110px', boxSizing: 'border-box', padding: '14px', borderRadius: '12px', border: '1px solid #CBD5E1', fontSize: '0.95rem', resize: 'vertical', fontFamily: 'inherit' }} />
                    </label>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '12px' }}>
                        <label>
                            <span style={{ display: 'block', marginBottom: '7px', color: '#475569', fontSize: '0.85rem', fontWeight: '800' }}>하고 싶은 말 최소 글자 수</span>
                            <input type="number" min="0" step="50" value={form.min_body_chars} onChange={(event) => update('min_body_chars', Math.max(0, Number(event.target.value) || 0))} style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid #CBD5E1', fontSize: '1rem' }} />
                            <span style={{ display: 'block', marginTop: '5px', color: '#94A3B8', fontSize: '0.72rem' }}>받는 사람·첫인사·끝인사는 글자 수를 세지 않습니다.</span>
                        </label>
                        <label>
                            <span style={{ display: 'block', marginBottom: '7px', color: '#475569', fontSize: '0.85rem', fontWeight: '800' }}>제출 보상 포인트</span>
                            <input type="number" min="0" step="10" value={form.base_reward} onChange={(event) => update('base_reward', Math.max(0, Number(event.target.value) || 0))} style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid #CBD5E1', fontSize: '1rem' }} />
                        </label>
                    </div>

                    <div style={{ padding: '16px', borderRadius: '16px', background: '#FFF7FB', border: '1px solid #FBCFE8', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                            <strong style={{ color: '#9D174D', fontSize: '0.92rem' }}>✉️ 편지지 고르기</strong>
                            <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: '0.78rem' }}>
                                학생 글을 PDF로 내보낼 때 기본으로 쓰는 편지지입니다. 내보내는 화면에서 그때그때 바꿀 수도 있습니다.
                            </p>
                        </div>
                        <select value={form.letter_paper} onChange={(event) => update('letter_paper', event.target.value)} style={{ padding: '12px', borderRadius: '12px', border: '1px solid #CBD5E1', fontSize: '1rem', background: 'white' }}>
                            {LETTER_PAPERS.map((option) => (
                                <option key={option.value} value={option.value}>{option.emoji} {option.label}</option>
                            ))}
                        </select>
                        <p style={{ margin: 0, color: '#64748B', fontSize: '0.8rem' }}>{paper.description}</p>
                        <Button type="button" onClick={handlePrintBlankPaper} loading={printing} loadingText="편지지 여는 중..." style={{ background: 'white', color: '#9D174D', border: '1px solid #FBCFE8', borderRadius: '12px', fontWeight: 'bold' }}>
                            🖨️ 빈 편지지 인쇄하기
                        </Button>
                        <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>손으로 옮겨 쓰게 할 때 씁니다. 글 없이 편지지만 나옵니다.</span>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#334155', fontWeight: '700' }}>
                        <input type="checkbox" checked={form.allow_comments} onChange={(event) => update('allow_comments', event.target.checked)} />
                        친구들이 이 편지에 댓글을 달 수 있게 하기
                    </label>

                    <RubricSettings value={form.evaluation_rubric} onChange={(value) => update('evaluation_rubric', value)} isMobile={isMobile} />

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <Button type="button" variant="ghost" onClick={onBack}>취소</Button>
                        <Button type="submit" loading={saving} loadingText="저장 중...">
                            {mission?.id ? '편지 쓰기 미션 수정' : '편지 쓰기 미션 공개하기'}
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
};

export default LetterMissionForm;
