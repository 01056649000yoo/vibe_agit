import React, { useState } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import Card from '../../../../components/common/Card';
import Button from '../../../../components/common/Button';

const getInitialForm = (mission) => ({
    title: mission?.title || '',
    guide: mission?.guide || '',
    min_stanzas: mission?.template_config?.min_stanzas ?? mission?.min_paragraphs ?? 3,
    min_lines_per_stanza: mission?.template_config?.min_lines_per_stanza ?? 1,
    base_reward: mission?.base_reward ?? 100,
    allow_comments: mission?.allow_comments ?? true,
});

const NumberSetting = ({ label, value, min, onChange, description }) => (
    <label style={{ display: 'block' }}>
        <span style={{ display: 'block', marginBottom: '7px', color: '#475569', fontSize: '0.85rem', fontWeight: '800' }}>{label}</span>
        <input
            type="number"
            min={min}
            value={value}
            onChange={(event) => onChange(Math.max(min, Number(event.target.value) || min))}
            style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid #CBD5E1', fontSize: '1rem' }}
        />
        <span style={{ display: 'block', marginTop: '5px', color: '#94A3B8', fontSize: '0.72rem' }}>{description}</span>
    </label>
);

const PoemMissionForm = ({ activeClass, mission = null, isMobile, onBack, onSaved }) => {
    const [form, setForm] = useState(() => getInitialForm(mission));
    const [saving, setSaving] = useState(false);

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
                base_reward: form.base_reward,
                bonus_threshold: 0,
                bonus_reward: 0,
                allow_comments: form.allow_comments,
                guide_questions: [],
                tags: ['시쓰기'],
                evaluation_rubric: { use_rubric: false, levels: [] },
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
            alert('시 쓰기 미션 저장에 실패했습니다.');
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

            <Card style={{ maxWidth: '760px', padding: isMobile ? '20px' : '28px', borderRadius: '22px', border: '1px solid #DCFCE7' }}>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <label>
                        <span style={{ display: 'block', marginBottom: '7px', color: '#334155', fontWeight: '800' }}>시 쓰기 주제 *</span>
                        <input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="예: 여름비를 오감으로 표현해 봅시다" style={{ width: '100%', boxSizing: 'border-box', padding: '14px', borderRadius: '12px', border: '1px solid #CBD5E1', fontSize: '1rem' }} />
                    </label>
                    <label>
                        <span style={{ display: 'block', marginBottom: '7px', color: '#334155', fontWeight: '800' }}>학생 안내 *</span>
                        <textarea value={form.guide} onChange={(event) => update('guide', event.target.value)} placeholder="시에서 표현할 장면과 느낌을 안내해주세요." style={{ width: '100%', minHeight: '110px', boxSizing: 'border-box', padding: '14px', borderRadius: '12px', border: '1px solid #CBD5E1', fontSize: '0.95rem', resize: 'vertical', fontFamily: 'inherit' }} />
                    </label>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '12px' }}>
                        <NumberSetting label="최소 연 수" value={form.min_stanzas} min={1} onChange={(value) => update('min_stanzas', value)} description="학생 화면에 이 수만큼 연 입력칸이 먼저 열립니다." />
                        <NumberSetting label="연별 최소 행" value={form.min_lines_per_stanza} min={1} onChange={(value) => update('min_lines_per_stanza', value)} description="각 연에 필요한 최소 줄 수입니다." />
                        <NumberSetting label="완료 포인트" value={form.base_reward} min={0} onChange={(value) => update('base_reward', value)} description="교사 승인 후 지급되는 기본 포인트입니다." />
                    </div>

                    <button type="button" onClick={() => update('allow_comments', !form.allow_comments)} style={{ padding: '13px', borderRadius: '12px', border: form.allow_comments ? '2px solid #4ADE80' : '1px solid #CBD5E1', background: form.allow_comments ? '#F0FDF4' : '#F8FAFC', color: '#334155', cursor: 'pointer', fontWeight: '800' }}>
                        {form.allow_comments ? '💬 친구 댓글 허용함' : '🔒 친구 댓글 사용 안 함'}
                    </button>

                    <Button type="submit" disabled={saving} style={{ minHeight: '52px', background: '#16A34A', color: 'white', fontWeight: '900' }}>
                        {saving ? '저장 중...' : mission?.id ? '시 쓰기 미션 수정하기' : '시 쓰기 미션 공개하기'}
                    </Button>
                </form>
            </Card>
        </div>
    );
};

export default PoemMissionForm;
