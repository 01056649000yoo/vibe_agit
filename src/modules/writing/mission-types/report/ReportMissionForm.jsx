import React, { useCallback, useState } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import Card from '../../../../components/common/Card';
import Button from '../../../../components/common/Button';
import RubricSettings, { createDefaultEvaluationRubric } from '../../evaluation/RubricSettings';
import {
    DEFAULT_REPORT_SECTION_TITLES,
    normalizeReportConfig,
    REPORT_MAX_IMAGES,
    REPORT_MAX_SECTIONS,
} from './reportContent';
import { REPORT_IMAGE_MAX_EDGE, REPORT_IMAGE_MAX_STORED_BYTES } from './reportImageApi';

const MissionStudentPreview = React.lazy(() => import('../../../../components/teacher/MissionStudentPreview'));

const getInitialForm = (mission) => {
    const normalizedConfig = normalizeReportConfig(mission?.template_config);
    return {
        title: mission?.title || '',
        guide: mission?.guide || '',
        default_sections: normalizedConfig.defaultSections,
        min_sections: mission?.template_config?.min_sections ?? mission?.min_paragraphs ?? 2,
        max_images: normalizedConfig.maxImages,
        min_chars: mission?.min_chars ?? 100,
        base_reward: mission?.base_reward ?? 100,
        allow_comments: mission?.allow_comments ?? true,
        evaluation_rubric: createDefaultEvaluationRubric(mission?.evaluation_rubric),
    };
};

const clampNumber = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min));

const NumberSetting = ({ label, value, min, max, step = 1, onChange, description }) => (
    <label style={{ display: 'block' }}>
        <span style={{ display: 'block', marginBottom: '7px', color: '#475569', fontSize: '0.85rem', fontWeight: '800' }}>{label}</span>
        <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => onChange(clampNumber(event.target.value, min, max))}
            style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid #CBD5E1', fontSize: '1rem' }}
        />
        <span style={{ display: 'block', marginTop: '5px', color: '#94A3B8', fontSize: '0.72rem' }}>{description}</span>
    </label>
);

const SectionTemplateEditor = ({ sections, onChange, isMobile }) => {
    const updateTitle = (index, value) => {
        const next = [...sections];
        next.splice(index, 1, value.slice(0, 80));
        onChange(next);
    };
    const move = (index, direction) => {
        const target = index + direction;
        if (target < 0 || target >= sections.length) return;
        const next = [...sections];
        const [movingSection] = next.splice(index, 1);
        next.splice(target, 0, movingSection);
        onChange(next);
    };

    return (
        <section style={{ padding: isMobile ? '16px' : '20px', borderRadius: '18px', border: '1px solid #99F6E4', background: '#F0FDFA' }}>
            <div style={{ marginBottom: '12px' }}>
                <strong style={{ display: 'block', color: '#115E59' }}>학생에게 처음 열어줄 내용 칸</strong>
                <span style={{ color: '#64748B', fontSize: '0.78rem' }}>학생은 소제목을 고치고 칸을 더하거나 순서를 바꿀 수 있습니다.</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                {sections.map((section, index) => (
                    <div key={`report-default-${index}`} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '42px minmax(0,1fr) auto', gap: '7px', alignItems: 'center', padding: '9px', borderRadius: '13px', background: 'white', border: '1px solid #CCFBF1' }}>
                        <strong style={{ color: '#0F766E', textAlign: 'center' }}>{index + 1}</strong>
                        <input
                            value={section}
                            onChange={(event) => updateTitle(index, event.target.value)}
                            placeholder="내용 칸 소제목"
                            style={{ minWidth: 0, padding: '10px 11px', border: '1px solid #CBD5E1', borderRadius: '10px', fontFamily: 'inherit' }}
                        />
                        <div style={{ display: 'flex', gap: '5px' }}>
                            <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`${index + 1}번 기본 칸 위로 이동`} style={{ minWidth: '38px', minHeight: '38px', border: '1px solid #CBD5E1', borderRadius: '9px', background: '#F8FAFC', cursor: 'pointer' }}>↑</button>
                            <button type="button" onClick={() => move(index, 1)} disabled={index === sections.length - 1} aria-label={`${index + 1}번 기본 칸 아래로 이동`} style={{ minWidth: '38px', minHeight: '38px', border: '1px solid #CBD5E1', borderRadius: '9px', background: '#F8FAFC', cursor: 'pointer' }}>↓</button>
                            <button type="button" onClick={() => onChange(sections.filter((_, itemIndex) => itemIndex !== index))} disabled={sections.length <= 1} style={{ minHeight: '38px', padding: '0 10px', border: '1px solid #FECACA', borderRadius: '9px', background: '#FFF7F7', color: '#B91C1C', cursor: 'pointer', fontWeight: '800' }}>삭제</button>
                        </div>
                    </div>
                ))}
            </div>
            <button
                type="button"
                onClick={() => onChange([...sections, `내용 ${sections.length + 1}`])}
                disabled={sections.length >= REPORT_MAX_SECTIONS}
                style={{ width: '100%', marginTop: '10px', padding: '11px', border: '2px dashed #5EEAD4', borderRadius: '12px', background: 'white', color: '#0F766E', cursor: 'pointer', fontWeight: '900' }}
            >＋ 기본 내용 칸 추가</button>
        </section>
    );
};

const ReportMissionForm = ({ activeClass, mission = null, isMobile, onBack, onSaved }) => {
    const [form, setForm] = useState(() => getInitialForm(mission));
    const [saving, setSaving] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const closePreview = useCallback(() => setIsPreviewOpen(false), []);
    const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

    const normalizedDefaultSections = form.default_sections
        .map((title) => title.trim())
        .filter(Boolean)
        .slice(0, REPORT_MAX_SECTIONS);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!form.title.trim() || !form.guide.trim()) {
            alert('보고하는 글쓰기 주제와 학생 안내를 입력해주세요. 📋');
            return;
        }
        if (normalizedDefaultSections.length === 0) {
            alert('학생에게 처음 보여줄 내용 칸을 한 개 이상 만들어주세요.');
            return;
        }

        const minSections = Math.min(form.min_sections, REPORT_MAX_SECTIONS);
        const defaultSections = [...normalizedDefaultSections];
        while (defaultSections.length < minSections) {
            defaultSections.push(`내용 ${defaultSections.length + 1}`);
        }

        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const payload = {
                class_id: activeClass.id,
                teacher_id: user?.id,
                title: form.title.trim(),
                guide: form.guide.trim(),
                genre: '보고하는 글',
                mission_type: 'report',
                input_template: 'report',
                template_config: {
                    default_sections: defaultSections,
                    min_sections: minSections,
                    max_sections: REPORT_MAX_SECTIONS,
                    max_images: clampNumber(form.max_images, 1, REPORT_MAX_IMAGES),
                    image_max_edge: REPORT_IMAGE_MAX_EDGE,
                    image_max_bytes: REPORT_IMAGE_MAX_STORED_BYTES,
                },
                min_chars: clampNumber(form.min_chars, 0, 10000),
                min_paragraphs: minSections,
                base_reward: Math.round(clampNumber(form.base_reward, 0, 10000) / 10) * 10,
                bonus_threshold: 0,
                bonus_reward: 0,
                allow_comments: form.allow_comments,
                guide_questions: [],
                tags: ['보고하는글쓰기', '보고서'],
                evaluation_rubric: form.evaluation_rubric,
                is_archived: false,
            };
            const query = mission?.id
                ? supabase.from('writing_missions').update(payload).eq('id', mission.id)
                : supabase.from('writing_missions').insert(payload);
            const { data, error } = await query.select('id').single();
            if (error) throw error;
            alert(mission?.id ? '보고하는 글쓰기 과제가 수정되었습니다. 📋' : '보고하는 글쓰기 과제가 공개되었습니다. 📋');
            onSaved?.({ ...mission, ...payload, id: data.id });
        } catch (error) {
            console.error('[ReportMissionForm] 저장 실패:', error.message);
            alert('보고하는 글쓰기 과제 저장에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    const previewMission = {
        title: form.title,
        guide: form.guide,
        genre: '보고하는 글',
        mission_type: 'report',
        input_template: 'report',
        template_config: {
            default_sections: normalizedDefaultSections.length > 0
                ? normalizedDefaultSections
                : [...DEFAULT_REPORT_SECTION_TITLES],
            min_sections: form.min_sections,
            max_sections: REPORT_MAX_SECTIONS,
            max_images: form.max_images,
        },
        min_chars: form.min_chars,
        min_paragraphs: form.min_sections,
        base_reward: form.base_reward,
        bonus_threshold: 0,
        bonus_reward: 0,
        allow_comments: form.allow_comments,
        guide_questions: [],
    };

    return (
        <div style={{ width: '100%', padding: isMobile ? '8px 0' : '8px 12px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
                <Button variant="ghost" size="sm" onClick={onBack}>⬅️ 돌아가기</Button>
                <div>
                    <h2 style={{ margin: 0, color: '#115E59', fontSize: '1.35rem' }}>📋 {mission?.id ? '보고하는 글쓰기 과제 수정' : '보고하는 글쓰기 과제 만들기'}</h2>
                    <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: '0.82rem' }}>학생이 글·사진 칸을 직접 더하고 순서를 조절하는 보고서 틀입니다.</p>
                </div>
            </div>

            <Card style={{ maxWidth: 'none', width: '100%', padding: isMobile ? '20px' : '28px', borderRadius: '22px', border: '1px solid #CCFBF1', boxSizing: 'border-box' }}>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <label>
                        <span style={{ display: 'block', marginBottom: '7px', color: '#334155', fontWeight: '800' }}>보고할 주제 *</span>
                        <input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="예: 우리 학교 주변 생태를 관찰해 보고합시다" style={{ width: '100%', boxSizing: 'border-box', padding: '14px', borderRadius: '12px', border: '1px solid #CBD5E1', fontSize: '1rem' }} />
                    </label>
                    <label>
                        <span style={{ display: 'block', marginBottom: '7px', color: '#334155', fontWeight: '800' }}>학생 안내 *</span>
                        <textarea value={form.guide} onChange={(event) => update('guide', event.target.value)} placeholder="무엇을 관찰·조사하고 어떤 사진과 내용을 넣을지 안내해주세요." style={{ width: '100%', minHeight: '110px', boxSizing: 'border-box', padding: '14px', borderRadius: '12px', border: '1px solid #CBD5E1', fontSize: '0.95rem', resize: 'vertical', fontFamily: 'inherit' }} />
                    </label>

                    <SectionTemplateEditor sections={form.default_sections} onChange={(value) => update('default_sections', value)} isMobile={isMobile} />

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: '12px' }}>
                        <NumberSetting label="최소 완성 칸" value={form.min_sections} min={1} max={REPORT_MAX_SECTIONS} onChange={(value) => update('min_sections', value)} description="내용을 써야 하는 최소 칸 수입니다." />
                        <NumberSetting label="사진 수 제한" value={form.max_images} min={1} max={REPORT_MAX_IMAGES} onChange={(value) => update('max_images', value)} description="사진은 최대 3장까지 허용합니다." />
                        <NumberSetting label="최소 글자 수" value={form.min_chars} min={0} max={10000} step={10} onChange={(value) => update('min_chars', value)} description="모든 내용 칸의 글을 합쳐 계산합니다." />
                        <NumberSetting label="완료 포인트" value={form.base_reward} min={0} max={10000} step={10} onChange={(value) => update('base_reward', value)} description="교사 승인 후 지급합니다." />
                    </div>

                    <RubricSettings
                        rubric={form.evaluation_rubric}
                        onChange={(evaluationRubric) => update('evaluation_rubric', evaluationRubric)}
                        isMobile={isMobile}
                        recommendedCodes={['4국03-02', '6국03-01']}
                    />

                    <button type="button" onClick={() => update('allow_comments', !form.allow_comments)} style={{ padding: '13px', borderRadius: '12px', border: form.allow_comments ? '2px solid #2DD4BF' : '1px solid #CBD5E1', background: form.allow_comments ? '#F0FDFA' : '#F8FAFC', color: '#334155', cursor: 'pointer', fontWeight: '800' }}>
                        {form.allow_comments ? '💬 친구 댓글 허용함' : '🔒 친구 댓글 사용 안 함'}
                    </button>

                    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px' }}>
                        <Button type="button" variant="outline" onClick={() => setIsPreviewOpen(true)} style={{ minHeight: '52px', flex: 1 }}>👀 학생 화면 미리보기</Button>
                        <Button type="submit" disabled={saving} style={{ minHeight: '52px', flex: 1, background: '#0F766E', color: 'white', fontWeight: '900' }}>
                            {saving ? '저장 중...' : mission?.id ? '보고 과제 수정하기' : '보고 과제 공개하기'}
                        </Button>
                    </div>
                </form>
            </Card>

            {isPreviewOpen && (
                <React.Suspense fallback={null}>
                    <MissionStudentPreview isOpen onClose={closePreview} mission={previewMission} />
                </React.Suspense>
            )}
        </div>
    );
};

export default ReportMissionForm;
