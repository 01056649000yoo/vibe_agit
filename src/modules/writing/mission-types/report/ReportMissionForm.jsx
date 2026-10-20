import React, { useCallback, useState } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import Card from '../../../../components/common/Card';
import Button from '../../../../components/common/Button';
import RubricSettings, { createDefaultEvaluationRubric } from '../../evaluation/RubricSettings';
import {
    DEFAULT_REPORT_SECTION_TITLES,
    getReportKind,
    reportKindAllowsPhoto,
    normalizeReportConfig,
    REPORT_KINDS,
    REPORT_MAX_IMAGES,
    REPORT_MAX_SECTIONS,
} from './reportContent';
import { REPORT_IMAGE_MAX_EDGE, REPORT_IMAGE_MAX_STORED_BYTES } from './reportImageApi';
import PeerReadingChoice, { PeerCommentSwitch, peerReadingErrorMessage, peerReadingLockReason } from '../../mission-form/PeerReadingChoice';
import './reportWriting.css';
import MissionFormStep, { MissionFormActions, MissionFormGroup } from '../../mission-form/MissionFormStep';

const MissionStudentPreview = React.lazy(() => import('../../../../components/teacher/MissionStudentPreview'));

const getInitialForm = (mission) => {
    // 새 과제는 관찰 보고서로 시작한다. 예전에 만든 과제(종류 없음)를 고칠 때는 예전 방식 그대로 둔다.
    const initialKind = mission?.id ? normalizeReportConfig(mission?.template_config).kind : 'observation';
    const normalizedConfig = normalizeReportConfig({ ...mission?.template_config, kind: initialKind });
    return {
        title: mission?.title || '',
        guide: mission?.guide || '',
        kind: initialKind,
        sources_enabled: normalizedConfig.sourcesEnabled,
        default_sections: normalizedConfig.defaultSections,
        section_photos: normalizedConfig.sectionPhotos,
        min_sections: mission?.template_config?.min_sections ?? mission?.min_paragraphs ?? 2,
        max_images: normalizedConfig.maxImages,
        min_chars: mission?.min_chars ?? 100,
        base_reward: mission?.base_reward ?? 100,
        allow_comments: mission?.allow_comments ?? true,
        peer_reading_enabled: mission?.peer_reading_enabled ?? true,
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

const SectionTemplateEditor = ({ sections, photos, withPhotoChoice, maxImages, onChange }) => {
    // 칸 제목과 사진 칸 여부는 짝이라, 바꿀 때 두 목록을 함께 넘긴다.
    const photoOf = (index) => photos.at(index) !== false;
    const flags = sections.map((_, index) => photoOf(index));
    const photoCount = flags.filter(Boolean).length;
    const updateTitle = (index, value) => {
        const next = [...sections];
        next.splice(index, 1, value.slice(0, 80));
        onChange(next, flags);
    };
    const setPhoto = (index, value) => onChange(sections, flags.map((flag, itemIndex) => (itemIndex === index ? value : flag)));
    const move = (index, direction) => {
        const target = index + direction;
        if (target < 0 || target >= sections.length) return;
        const next = [...sections];
        const [movingSection] = next.splice(index, 1);
        next.splice(target, 0, movingSection);
        const nextFlags = [...flags];
        const [movingFlag] = nextFlags.splice(index, 1);
        nextFlags.splice(target, 0, movingFlag);
        onChange(next, nextFlags);
    };

    return (
        <section className="report-template">
            <div>
                <strong className="report-template__title">학생에게 처음 열어줄 내용 칸</strong>
                <span className="mission-step__hint">
                    칸마다 소제목을 쓰고{withPhotoChoice ? ', 글만 쓰는 칸인지 사진도 넣는 칸인지 고르세요.' : ' 순서를 정하세요.'} 학생은 칸을 더하거나 순서를 바꿀 수 있어요.
                </span>
                {withPhotoChoice && (
                    <span className="report-template__summary" role="status">
                        ✏️ 글만 {sections.length - photoCount}칸 · 📷 사진 있는 칸 {photoCount}칸
                        {photoCount > maxImages ? ` — 사진은 최대 ${maxImages}장이라 사진 칸이 더 많아요` : ''}
                    </span>
                )}
            </div>
            <ol className="report-template__list">
                {sections.map((section, index) => (
                    <li key={`report-default-${index}`} className={`report-template__row${withPhotoChoice && photoOf(index) ? ' report-template__row--photo' : ''}`}>
                        <span className="report-template__number" aria-hidden="true">{index + 1}</span>
                        <input
                            className="report-template__input"
                            value={section}
                            onChange={(event) => updateTitle(index, event.target.value)}
                            placeholder="내용 칸 소제목"
                            aria-label={`${index + 1}번 칸 소제목`}
                        />
                        {withPhotoChoice && (
                            <div className="report-template__kind" role="group" aria-label={`${index + 1}번 칸 종류`}>
                                <button type="button" aria-pressed={!photoOf(index)} onClick={() => setPhoto(index, false)}>✏️ 글만</button>
                                <button type="button" aria-pressed={photoOf(index)} onClick={() => setPhoto(index, true)}>📷 글+사진</button>
                            </div>
                        )}
                        <div className="report-template__tools">
                            <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`${index + 1}번 칸 위로 이동`}>↑</button>
                            <button type="button" onClick={() => move(index, 1)} disabled={index === sections.length - 1} aria-label={`${index + 1}번 칸 아래로 이동`}>↓</button>
                            <button
                                type="button"
                                className="report-template__remove"
                                onClick={() => onChange(sections.filter((_, itemIndex) => itemIndex !== index), flags.filter((_, itemIndex) => itemIndex !== index))}
                                disabled={sections.length <= 1}
                                aria-label={`${index + 1}번 칸 삭제`}
                            >삭제</button>
                        </div>
                    </li>
                ))}
            </ol>
            <div className="report-template__add">
                <button type="button" onClick={() => onChange([...sections, `내용 ${sections.length + 1}`], [...flags, false])} disabled={sections.length >= REPORT_MAX_SECTIONS}>＋ 글만 쓰는 칸 추가</button>
                {withPhotoChoice && (
                    <button type="button" onClick={() => onChange([...sections, `내용 ${sections.length + 1}`], [...flags, true])} disabled={sections.length >= REPORT_MAX_SECTIONS}>＋ 사진도 넣는 칸 추가</button>
                )}
            </div>
        </section>
    );
};

const ReportMissionForm = ({ activeClass, mission = null, isMobile, onBack, onSaved }) => {
    const [form, setForm] = useState(() => getInitialForm(mission));
    const [saving, setSaving] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const closePreview = useCallback(() => setIsPreviewOpen(false), []);
    const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const changeKind = (nextKind) => setForm((current) => {
        const titlesOf = (kind) => (getReportKind(kind)?.defaultSections ?? DEFAULT_REPORT_SECTION_TITLES);
        const untouched = current.default_sections.join('\n') === titlesOf(current.kind).join('\n');
        const nextTitles = untouched ? [...titlesOf(nextKind)] : current.default_sections;
        return {
            ...current,
            kind: nextKind,
            sources_enabled: nextKind ? current.sources_enabled : false,
            default_sections: nextTitles,
            // 칸 제목을 그대로 둔 채 종류만 바꾸면 사진 칸도 그 종류의 기본값으로 바꾼다.
            section_photos: untouched ? nextTitles.map((_, index) => reportKindAllowsPhoto(nextKind, index)) : current.section_photos,
        };
    });
    // 예전 방식(자유 보고서)으로 만든 과제를 고치는 중인지. 이때만 그 카드를 보여 준다.
    const legacyEditing = Boolean(mission?.id) && !normalizeReportConfig(mission?.template_config).kind;
    const kindDef = getReportKind(form.kind);

    // 빈 칸 제목은 버리되 사진 칸 여부는 제목과 짝으로 남긴다.
    const keptSections = form.default_sections
        .map((title, index) => ({ title: title.trim(), photo: form.section_photos.at(index) !== false }))
        .filter((item) => item.title)
        .slice(0, REPORT_MAX_SECTIONS);
    const normalizedDefaultSections = keptSections.map((item) => item.title);
    const sectionPhotoFlags = keptSections.map((item) => item.photo);

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
        const sectionPhotos = [...sectionPhotoFlags];
        while (defaultSections.length < minSections) {
            defaultSections.push(`내용 ${defaultSections.length + 1}`);
            sectionPhotos.push(true);
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
                    ...(form.kind ? { kind: form.kind } : {}),
                    ...(form.kind && form.sources_enabled ? { sources_enabled: true } : {}),
                    default_sections: defaultSections,
                    ...(form.kind ? { section_photos: sectionPhotos } : {}),
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
                peer_reading_enabled: form.peer_reading_enabled,
                guide_questions: [],
                tags: ['보고하는글쓰기', '보고서', ...(kindDef ? [kindDef.label.replace(' ', '')] : [])],
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
            alert(peerReadingErrorMessage(error) || '보고하는 글쓰기 과제 저장에 실패했습니다.');
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
            ...(form.kind ? { kind: form.kind } : {}),
            ...(form.kind && form.sources_enabled ? { sources_enabled: true } : {}),
            default_sections: normalizedDefaultSections.length > 0
                ? normalizedDefaultSections
                : [...DEFAULT_REPORT_SECTION_TITLES],
            ...(form.kind && normalizedDefaultSections.length > 0 ? { section_photos: sectionPhotoFlags } : {}),
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
        peer_reading_enabled: form.peer_reading_enabled,
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

            <Card style={{ maxWidth: 'none', width: '100%', padding: isMobile ? '20px' : '28px', borderRadius: '22px', border: '1px solid var(--ui-border)', boxSizing: 'border-box' }}>
                <form onSubmit={handleSubmit} className="mission-form-steps">
                    <MissionFormStep number={1} title="무엇을 쓰나요?" description="보고서 양식과 주제, 학생에게 보여 줄 안내를 정해요.">
                        <MissionFormGroup title="📋 어떤 보고서인가요?">
                        <p className="mission-step__hint" style={{ margin: '0 0 8px' }}>양식에 맞는 머리말과 칸이 학생 화면에 만들어지고, 문집·글꽃 책방에도 이 양식으로 담겨요.</p>
                        <div role="radiogroup" aria-label="보고서 양식" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(' + (legacyEditing ? 3 : 2) + ', minmax(0, 1fr))', gap: '10px' }}>
                            {/* 자유 보고서는 예전에 만든 과제를 고칠 때만 보인다. 새 과제는 관찰·조사 중에서 고른다. */}
                            {[...Object.values(REPORT_KINDS), ...(legacyEditing ? [{ id: null, icon: '📋', label: '자유 보고서', summary: '머리말 없이 사진과 글 칸만 있는 예전 방식이에요.' }] : [])].map((option) => {
                                const selected = (form.kind || null) === option.id;
                                return (
                                    <button
                                        key={option.id || 'free'}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        onClick={() => changeKind(option.id)}
                                        style={{ textAlign: 'left', padding: '14px', borderRadius: '14px', cursor: 'pointer', fontFamily: 'inherit', border: selected ? '2px solid var(--ui-primary)' : '1px solid var(--ui-border)', background: selected ? 'var(--ui-primary-soft, #F0FDFA)' : 'var(--ui-surface)', display: 'grid', gap: '4px' }}
                                    >
                                        <strong style={{ fontSize: '1.02rem', color: 'var(--ui-ink)' }}>{option.icon} {option.label}</strong>
                                        <span style={{ fontSize: '0.82rem', color: 'var(--ui-ink-muted, #64748B)', lineHeight: 1.5 }}>{option.summary}</span>
                                        {option.metaFields && <span style={{ fontSize: '0.74rem', color: 'var(--ui-ink-muted, #94A3B8)' }}>머리말: {option.metaFields.map((field) => field.label).join(' · ')}</span>}
                                    </button>
                                );
                            })}
                        </div>
                        </MissionFormGroup>
                        <label className="mission-field-label">
                            보고할 주제
                            <input className="mission-field-input" value={form.title} onChange={(event) => update('title', event.target.value)} placeholder={form.kind === 'research' ? '예: 우리 고장의 전통 음식을 조사해 보고합시다' : form.kind === 'observation' ? '예: 강낭콩이 자라는 모습을 관찰해 보고합시다' : '예: 우리 학교 주변 생태를 관찰해 보고합시다'} />
                        </label>
                        <label className="mission-field-label">
                            학생 안내
                            <textarea className="mission-field-input" value={form.guide} onChange={(event) => update('guide', event.target.value)}  placeholder={form.kind === 'research' ? '무엇을 어떻게 조사하고 어떤 내용을 정리할지 안내해주세요.' : '무엇을 관찰하고 어떤 사진과 내용을 넣을지 안내해주세요.'} style={{ minHeight: '110px', resize: 'vertical', fontFamily: 'inherit' }} />
                        </label>
                    </MissionFormStep>

                    <MissionFormStep number={2} optional title="글의 틀"description="학생이 글·사진 칸을 더하고 순서를 바꾸는 보고서 틀이에요. 처음 열어 줄 칸과 사진 수를 정해요.">
                        <SectionTemplateEditor sections={form.default_sections} photos={form.section_photos} withPhotoChoice={Boolean(form.kind)} maxImages={form.max_images} onChange={(titles, photos) => setForm((current) => ({ ...current, default_sections: titles, section_photos: photos }))} />
 {form.kind && (
                            <MissionFormGroup title="📚 출처(참고 자료)">
                                <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={form.sources_enabled} onChange={(event) => update('sources_enabled', event.target.checked)} style={{ marginTop: '4px', width: '18px', height: '18px' }} />
                                    <span>
                                        <strong style={{ display: 'block', color: 'var(--ui-ink)' }}>학생이 출처를 쓰게 하기</strong>
                                        <span className="mission-step__hint">켜면 칸마다 출처(책 제목·누리집 주소 등)를 적는 칸이 생기고, 하나 이상 써야 제출돼요. 보고서 끝에는 참고 자료 목록이 모여요. {form.kind === 'research' ? '조사 보고서는 켜는 것을 권해요.' : '관찰 보고서는 꺼 두어도 괜찮아요.'}</span>
                                    </span>
                                </label>
                            </MissionFormGroup>
                        )}
                        <div className="mission-field-row">
                            <NumberSetting label="최소 완성 칸"value={form.min_sections} min={1} max={REPORT_MAX_SECTIONS} onChange={(value) => update('min_sections', value)} description="내용을 써야 하는 최소 칸 수입니다." />
                            <NumberSetting label="사진 수 제한" value={form.max_images} min={1} max={REPORT_MAX_IMAGES} onChange={(value) => update('max_images', value)} description="사진은 최대 3장까지 허용합니다." />
                        </div>
                    </MissionFormStep>

                    <MissionFormStep number={3} title="쓰는 조건"description="분량, 함께 읽기, 포인트를 정해요.">
                        <MissionFormGroup title="📏 분량">
                            <NumberSetting label="최소 글자 수" value={form.min_chars} min={0} max={10000} step={10} onChange={(value) => update('min_chars', value)} description="모든 내용 칸의 글을 합쳐 계산합니다." />
                        </MissionFormGroup>
                        <MissionFormGroup title="👥 함께 읽기">
                            <div className="mission-field-row">
                                <PeerReadingChoice enabled={form.peer_reading_enabled} lockedReason={peerReadingLockReason({ isEditing: Boolean(mission?.id), openedAt: mission?.peer_reading_opened_at })} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} />
                                <PeerCommentSwitch allowComments={form.allow_comments} peerReadingEnabled={form.peer_reading_enabled} onChange={(next) => update('allow_comments', next)} />
                            </div>
                        </MissionFormGroup>
                        <MissionFormGroup title="💰 포인트">
                            <NumberSetting label="완료 포인트" value={form.base_reward} min={0} max={10000} step={10} onChange={(value) => update('base_reward', value)} description="교사 승인 후 지급합니다." />
                        </MissionFormGroup>
                    </MissionFormStep>

                    <MissionFormStep number={4} optional title="평가와 관리"description="평가 루브릭을 정해요.">
                        <MissionFormGroup title="📊 글쓰기 평가 루브릭">
                            <RubricSettings
                                bare
                                rubric={form.evaluation_rubric}
                                onChange={(evaluationRubric) => update('evaluation_rubric', evaluationRubric)}
                                isMobile={isMobile}
                                recommendedCodes={['4국03-02', '6국03-01']}
                            />
                        </MissionFormGroup>
                    </MissionFormStep>

                    <MissionFormActions summary={[
                        kindDef ? kindDef.label : '보고하는 글',
                        `${form.min_sections || 1}칸 이상`,
                        `${form.min_chars || 0}자 이상`,
                        `${form.base_reward || 0}P`,
                        form.peer_reading_enabled === false ? '🔒 선생님만 읽음' : (form.allow_comments ? '👀 반 친구가 읽고 댓글' : '👀 반 친구가 읽음')
                    ]}>
                        <Button type="button" variant="outline" onClick={() => setIsPreviewOpen(true)}>👀 학생 화면 미리보기</Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? '저장 중...' : mission?.id ? '보고 과제 수정하기' : '보고 과제 공개하기'}
                        </Button>
                    </MissionFormActions>
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
