import React, { useEffect, useMemo, useState } from 'react';
import { StudentTextArea, StudentTextField } from '../../student-input';
import {
    buildReportStructuredContent,
    createReportSection,
    getReportKind,
    normalizeReportConfig,
    normalizeReportMeta,
    normalizeReportSections,
    reportKindOf,
    reportSectionsToContent,
    REPORT_CAPTION_MAX,
    REPORT_DATE_MAX,
    REPORT_META_MAX,
    REPORT_SOURCE_MAX,
} from './reportContent';
import {
    getReportImageUrls,
    optimizeReportImage,
    removeReportImage,
    uploadReportImage,
} from './reportImageApi';
import { REPORT_PHOTO_RULES, REPORT_PHOTO_RULES_CHECK_LABEL } from './reportPhotoRules.js';
import './reportWriting.css';

const TITLE_INPUT_STYLE = {
    width: '100%', boxSizing: 'border-box', padding: '16px 0', fontWeight: '900',
    border: 'none', borderBottom: '2px solid #99F6E4', outline: 'none',
    color: '#134E4A', background: 'transparent',
};

const SECTION_BODY_STYLE = {
    width: '100%', minHeight: '190px', boxSizing: 'border-box', padding: '16px',
    border: '2px solid #99F6E4', borderRadius: '14px', resize: 'vertical',
    outline: 'none', background: '#FFFFFF', color: '#334155', lineHeight: 1.8,
    fontFamily: 'inherit',
};

const ReportEditor = ({
    title, setTitle, content, setContent, structuredContent, setStructuredContent,
    config = {}, disabled, isMobile, postId, ensureDraftPost, onPersistDraft,
}) => {
    const normalizedConfig = useMemo(() => normalizeReportConfig(config), [config]);
    const sections = useMemo(
        () => normalizeReportSections(structuredContent, content, config),
        [config, content, structuredContent]
    );
    // 양식 종류(관찰·조사)가 있는 과제는 머리말·칸 소제목·날짜·출처·사진 설명 칸이 더 생긴다. 없으면 예전 화면 그대로.
    const kind = normalizedConfig.kind || reportKindOf(structuredContent);
    const kindDef = getReportKind(kind);
    const sourcesEnabled = Boolean(kindDef && normalizedConfig.sourcesEnabled);
    const meta = useMemo(() => normalizeReportMeta(structuredContent?.meta, kind, { trim: false }), [structuredContent, kind]);
    const [imageUrls, setImageUrls] = useState(() => new Map());
    const [uploadingSectionId, setUploadingSectionId] = useState(null);
    const [photoStatus, setPhotoStatus] = useState('');
    // 사진을 올리기 전에 약속을 읽고 체크해야 한다(법적 동의가 아니라 주의 안내, 저장하지 않는다).
    const [photoRulesChecked, setPhotoRulesChecked] = useState(false);
    const imageCount = sections.filter((section) => section.image?.path).length;
    const imagePathKey = sections
        .map((section) => section.image?.path)
        .filter(Boolean)
        .join('\n');

    useEffect(() => {
        let active = true;
        const paths = imagePathKey ? imagePathKey.split('\n') : [];
        getReportImageUrls(paths)
            .then((urls) => {
                if (active) setImageUrls(urls);
            })
            .catch((error) => console.error('[ReportEditor] 사진 불러오기 실패:', error.message));
        return () => { active = false; };
    }, [imagePathKey]);

    const buildNextDraft = (nextSections, nextMeta = meta) => {
        const options = { kind, meta: nextMeta };
        const nextStructuredContent = buildReportStructuredContent(nextSections, options);
        const nextContent = reportSectionsToContent(nextSections, options);
        return { structuredContent: nextStructuredContent, content: nextContent };
    };

    const commitSections = (nextSections, nextMeta = meta) => {
        const nextDraft = buildNextDraft(nextSections, nextMeta);
        setStructuredContent(nextDraft.structuredContent);
        setContent(nextDraft.content);
        return nextDraft;
    };

    // 저장 대상 글은 서버가 (학생, 과제)로 찾으므로 post id를 따로 넘기지 않는다.
    // 사진 업로드 전에 부르는 ensureDraftPost 가 만들어 둔 그 글이 그대로 갱신된다.
    const persistSections = async (nextSections) => {
        const nextDraft = commitSections(nextSections);
        if (!onPersistDraft) return true;
        return onPersistDraft(nextDraft);
    };

    const updateSection = (sectionId, patch) => {
        commitSections(sections.map((section) => (
            section.id === sectionId ? { ...section, ...patch } : section
        )));
    };

    const updateMeta = (key, value) => commitSections(sections, { ...meta, [key]: value });

    // 조사 방법처럼 고르기 쉬운 말은 누르면 넣고, 다시 누르면 뺀다.
    const toggleMetaChip = (key, chip) => {
        const parts = String(Object.entries(meta).find(([name]) => name === key)?.[1] || '').split(/\s*[,，、]\s*/).map((item) => item.trim()).filter(Boolean);
        const next = parts.includes(chip) ? parts.filter((item) => item !== chip) : [...parts, chip];
        updateMeta(key, next.join(', '));
    };

    const updateObservation = (section, observation) => {
        // 양식 종류가 있으면 사진 설명은 따로 쓴다. 예전 과제는 본문이 곧 사진 설명이다.
        if (kindDef) {
            updateSection(section.id, { body: observation });
            return;
        }
        updateSection(section.id, {
            body: observation,
            image: section.image
                ? { ...section.image, caption: observation.slice(0, 240) }
                : null,
        });
    };

    const updateCaption = (section, text) => {
        if (!section.image) return;
        updateSection(section.id, { image: { ...section.image, caption: text.slice(0, REPORT_CAPTION_MAX) } });
    };

    const moveSection = (index, direction) => {
        const target = index + direction;
        if (target < 0 || target >= sections.length) return;
        const next = [...sections];
        const [movingSection] = next.splice(index, 1);
        next.splice(target, 0, movingSection);
        commitSections(next);
    };

    const handleAddSection = () => {
        if (sections.length >= normalizedConfig.maxSections) return;
        commitSections([...sections, createReportSection(kindDef ? `${kindDef.contentLabel} ${sections.length + 1}` : `관찰 결과 ${sections.length + 1}`)]);
    };

    const handleRemoveSection = async (section) => {
        if (sections.length <= normalizedConfig.minSections) return;
        if (!window.confirm(kindDef ? '이 칸을 보고서에서 뺄까요?' : '이 사진과 관찰 결과 칸을 보고서에서 뺄까요?')) return;
        const next = sections.filter((item) => item.id !== section.id);
        try {
            const saved = await persistSections(next);
            if (saved && section.image?.path) await removeReportImage(section.image.path);
        } catch (error) {
            console.error('[ReportEditor] 칸 삭제 저장 실패:', error.message);
            alert('칸은 화면에서 뺐지만 서버 저장을 마치지 못했어요. 임시 저장을 다시 눌러주세요.');
        }
    };

    const handlePhotoChange = async (section, file) => {
        if (!file || disabled || uploadingSectionId) return;
        if (!photoRulesChecked) {
            alert('사진을 올리기 전에 위의 사진 약속을 읽고 체크해 주세요.');
            return;
        }
        if (!section.image?.path && imageCount >= normalizedConfig.maxImages) {
            alert(`사진은 ${normalizedConfig.maxImages}장까지 넣을 수 있어요.`);
            return;
        }

        setUploadingSectionId(section.id);
        setPhotoStatus('사진을 웹에서 빠르게 보이도록 가볍게 바꾸는 중...');
        let uploaded = null;
        try {
            const optimizedImage = await optimizeReportImage(file);
            setPhotoStatus('가벼워진 사진을 안전하게 올리는 중...');
            const draftPostId = postId || await ensureDraftPost?.();
            if (!draftPostId) throw new Error('보고서 임시 저장을 먼저 만들지 못했습니다.');
            uploaded = await uploadReportImage({
                postId: draftPostId,
                sectionId: section.id,
                optimizedImage,
            });

            const next = sections.map((item) => (
                item.id === section.id
                    ? {
                        ...item,
                        image: {
                            ...uploaded,
                            caption: kindDef
                                ? String(item.image?.caption || '')
                                : String(item.body || item.image?.caption || '').slice(0, 240),
                        },
                    }
                    : item
            ));
            const saved = await persistSections(next);
            if (!saved) throw new Error('사진이 들어간 보고서 초안을 저장하지 못했습니다.');
            if (section.image?.path) await removeReportImage(section.image.path);
            setPhotoStatus('사진을 가볍게 줄여 저장했어요.');
        } catch (error) {
            console.error('[ReportEditor] 사진 처리 실패:', error.message);
            if (uploaded?.path) {
                removeReportImage(uploaded.path).catch(() => {});
            }
            setPhotoStatus('');
            alert(error.message || '사진을 넣지 못했어요.');
        } finally {
            setUploadingSectionId(null);
        }
    };

    const handleRemovePhoto = async (section) => {
        if (!section.image?.path || !window.confirm('이 칸에서 사진을 뺄까요?')) return;
        const oldPath = section.image.path;
        const next = sections.map((item) => (
            item.id === section.id ? { ...item, image: null } : item
        ));
        try {
            const saved = await persistSections(next);
            if (saved) await removeReportImage(oldPath);
            setImageUrls((current) => {
                const updated = new Map(current);
                updated.delete(oldPath);
                return updated;
            });
        } catch (error) {
            console.error('[ReportEditor] 사진 삭제 실패:', error.message);
            alert('사진 삭제를 서버에 저장하지 못했어요. 잠시 후 다시 시도해주세요.');
        }
    };

    return (
        <div className="report-editor">
            <StudentTextField
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="보고서 제목을 적어주세요"
                disabled={disabled}
                autoCapitalize="sentences"
                lang="ko"
                style={{ ...TITLE_INPUT_STYLE, fontSize: isMobile ? '1.45rem' : '1.9rem' }}
            />

            {kindDef && (
                <fieldset className="report-editor__meta" disabled={disabled}>
                    <legend>{kindDef.icon} {kindDef.label} 머리말</legend>
                    <div className="report-editor__meta-grid">
                        {kindDef.metaFields.map((field) => (
                            <div key={field.key} className="report-editor__meta-field">
                                <label htmlFor={`report-meta-${field.key}`}>
                                    {field.label}{field.required && <b title="꼭 써요"> *</b>}
                                </label>
                                <StudentTextField
                                    id={`report-meta-${field.key}`}
                                    type="text"
                                    value={meta[field.key] ?? ''}
                                    maxLength={REPORT_META_MAX}
                                    onChange={(event) => updateMeta(field.key, event.target.value)}
                                    placeholder={field.placeholder}
                                    disabled={disabled}
                                    lang="ko"
                                    style={{ padding: '10px 12px', border: '1px solid #99F6E4', borderRadius: '10px', fontSize: '1rem' }}
                                />
                                {field.chips && !disabled && (
                                    <div className="report-editor__chips" role="group" aria-label={`${field.label} 고르기`}>
                                        {field.chips.map((chip) => {
                                            const on = String(meta[field.key] || '').split(/\s*[,，、]\s*/).includes(chip);
                                            return (
                                                <button key={chip} type="button" className={on ? 'is-on' : ''} aria-pressed={on} onClick={() => toggleMetaChip(field.key, chip)}>{chip}</button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </fieldset>
            )}

            <div className="report-editor__intro">
                <span>{kindDef
                    ? (kind === 'research'
                        ? '머리말을 쓰고, 칸마다 조사한 내용을 내 말로 정리해요. 사진·그림은 조사한 내용 칸에 필요할 때만 넣어요.'
                        : '머리말을 쓰고, 까닭과 느낀 점은 글로, 관찰한 모습 칸에는 사진과 함께 적어요.')
                    : '왼쪽에 사진을 넣고, 오른쪽 글쓰기 창에 사진을 관찰한 결과를 적어요.'}</span>
                <span>내용 칸 {sections.length}/{normalizedConfig.maxSections} · 사진 {imageCount}/{normalizedConfig.maxImages}</span>
            </div>

            <fieldset className="report-editor__photo-rules" disabled={disabled}>
                <legend>📷 사진을 올리기 전에 약속해요</legend>
                <ul>
                    {REPORT_PHOTO_RULES.map((rule) => <li key={rule}>{rule}</li>)}
                </ul>
                <label className="report-editor__photo-rules-check">
                    <input type="checkbox" checked={photoRulesChecked} onChange={(event) => setPhotoRulesChecked(event.target.checked)} />
                    <span>{REPORT_PHOTO_RULES_CHECK_LABEL}</span>
                </label>
            </fieldset>

            <div className="report-editor__sections">
                {sections.map((section, index) => {
                    const imageUrl = section.image?.path ? imageUrls.get(section.image.path) : null;
                    const isUploading = uploadingSectionId === section.id;
                    // 글만 쓰는 칸(까닭·느낀 점)에는 사진 칸을 두지 않는다. 이미 사진이 있으면 그대로 보인다.
                    const showPhoto = !kindDef || Boolean(section.image?.path) || section.photo !== false;
                    const observation = kindDef ? (section.body || '') : (section.body || section.image?.caption || '');
                    return (
                        <section className="report-editor__section" key={section.id}>
                            <header className="report-editor__section-header">
                                <span className="report-editor__section-number">☰ {index + 1}번 {kindDef ? (section.heading || kindDef.contentLabel) : '사진 + 관찰 결과'}</span>
                                {!disabled && (
                                    <div className="report-editor__section-actions">
                                        <button
                                            type="button"
                                            className="report-editor__icon-button"
                                            onClick={() => moveSection(index, -1)}
                                            disabled={index === 0 || Boolean(uploadingSectionId)}
                                            aria-label={`${index + 1}번 사진과 관찰 결과 칸 위로 이동`}
                                        >↑ 위로</button>
                                        <button
                                            type="button"
                                            className="report-editor__icon-button"
                                            onClick={() => moveSection(index, 1)}
                                            disabled={index === sections.length - 1 || Boolean(uploadingSectionId)}
                                            aria-label={`${index + 1}번 사진과 관찰 결과 칸 아래로 이동`}
                                        >↓ 아래로</button>
                                        <button
                                            type="button"
                                            className="report-editor__icon-button report-editor__icon-button--danger"
                                            onClick={() => handleRemoveSection(section)}
                                            disabled={sections.length <= normalizedConfig.minSections || Boolean(uploadingSectionId)}
                                        >칸 삭제</button>
                                    </div>
                                )}
                            </header>

                            <div className={`report-editor__section-layout${showPhoto ? '' : ' report-editor__section-layout--text'}`}>
                                {showPhoto && (
                                <div className="report-editor__photo-panel">
                                    <div className="report-editor__photo-frame">
                                        {section.image?.path ? (
                                            imageUrl ? (
                                                <img
                                                    src={imageUrl}
                                                    alt={section.image.caption || `${index + 1}번 칸 사진`}
                                                    loading="lazy"
                                                    decoding="async"
                                                />
                                            ) : (
                                                <div className="report-document__image-placeholder">사진을 불러오는 중...</div>
                                            )
                                        ) : !disabled ? (
                                            <label
                                                className="report-editor__file-label report-editor__file-label--frame"
                                                style={{ opacity: imageCount >= normalizedConfig.maxImages ? .48 : 1 }}
                                            >
                                                <span aria-hidden="true">📷</span>
                                                <span>{isUploading ? '사진 처리 중...' : '사진 넣기'}</span>
                                                <small>자동으로 칸에 맞춰요</small>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    disabled={Boolean(uploadingSectionId) || imageCount >= normalizedConfig.maxImages || !photoRulesChecked}
                                                    onChange={(event) => {
                                                        const file = event.target.files?.[0];
                                                        event.target.value = '';
                                                        handlePhotoChange(section, file);
                                                    }}
                                                />
                                            </label>
                                        ) : (
                                            <div className="report-editor__empty-photo">사진 없음</div>
                                        )}
                                    </div>

                                    {kindDef && section.image?.path && (
                                        <div className="report-editor__caption">
                                            <label htmlFor={`report-caption-${section.id}`}>사진 설명 <b title="꼭 써요">*</b></label>
                                            <StudentTextField
                                                id={`report-caption-${section.id}`}
                                                type="text"
                                                value={section.image.caption || ''}
                                                maxLength={REPORT_CAPTION_MAX}
                                                onChange={(event) => updateCaption(section, event.target.value)}
                                                placeholder="예: 잎이 두 장 나온 모습"
                                                disabled={disabled}
                                                lang="ko"
                                                style={{ padding: '8px 10px', border: '1px solid #99F6E4', borderRadius: '9px', fontSize: '.9rem' }}
                                            />
                                        </div>
                                    )}
                                    {section.image?.path && (
                                        <>
                                            <div className="report-editor__photo-meta">
                                                최적화 완료 · {Math.max(1, Math.round((section.image.bytes || 0) / 1024))}KB
                                            </div>
                                            {!disabled && (
                                                <div className="report-editor__photo-actions">
                                                    <label className="report-editor__file-label">
                                                        {isUploading ? '처리 중...' : '사진 바꾸기'}
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            disabled={Boolean(uploadingSectionId) || !photoRulesChecked}
                                                            onChange={(event) => {
                                                                const file = event.target.files?.[0];
                                                                event.target.value = '';
                                                                handlePhotoChange(section, file);
                                                            }}
                                                        />
                                                    </label>
                                                    <button
                                                        type="button"
                                                        className="report-editor__icon-button report-editor__icon-button--danger"
                                                        onClick={() => handleRemovePhoto(section)}
                                                        disabled={Boolean(uploadingSectionId)}
                                                    >사진 빼기</button>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {isUploading && <div className="report-editor__status" role="status">{photoStatus}</div>}
                                </div>
                                )}

                                <div className="report-editor__writing-panel">
                                    {kindDef && !disabled && (!showPhoto ? (
                                        <button
                                            type="button"
                                            className="report-editor__photo-toggle"
                                            onClick={() => updateSection(section.id, { photo: true })}
                                        >📷 이 칸에도 사진을 넣고 싶어요</button>
                                    ) : !section.image?.path && (
                                        <button
                                            type="button"
                                            className="report-editor__photo-toggle"
                                            onClick={() => updateSection(section.id, { photo: false })}
                                        >✏️ 이 칸은 글만 쓸래요</button>
                                    ))}
                                    {kindDef && (
                                        <div className="report-editor__section-meta">
                                            <input
                                                className="report-editor__heading-input"
                                                type="text"
                                                value={section.heading || ''}
                                                maxLength={80}
                                                onChange={(event) => updateSection(section.id, { heading: event.target.value })}
                                                placeholder="이 칸의 소제목"
                                                aria-label={`${index + 1}번 칸 소제목`}
                                                disabled={disabled}
                                            />
                                            {kindDef.dateLabel && (
                                                <label className="report-editor__date-field">
                                                    <span>{kindDef.dateLabel}</span>
                                                    <input
                                                        type="text"
                                                        value={section.date || ''}
                                                        maxLength={REPORT_DATE_MAX}
                                                        onChange={(event) => updateSection(section.id, { date: event.target.value })}
                                                        placeholder={kindDef.datePlaceholder}
                                                        disabled={disabled}
                                                    />
                                                </label>
                                            )}
                                        </div>
                                    )}
                                    {/* 양식 종류가 있으면 소제목 입력칸이 곧 이 글의 이름이라, 안내 글은 화면 읽기 프로그램에만 보인다(두 번 보이면 헷갈린다). */}
                                    <label
                                        className={`report-editor__writing-label${kindDef ? ' report-editor__sr-only' : ''}`}
                                        htmlFor={`report-observation-${section.id}`}
                                    >{kindDef ? (section.heading || kindDef.contentLabel) : '사진에 대한 관찰 결과'}</label>
                                    <StudentTextArea
                                        id={`report-observation-${section.id}`}
                                        value={observation}
                                        onChange={(event) => updateObservation(section, event.target.value)}
                                        placeholder={kindDef ? kindDef.bodyPlaceholder : '사진을 보고 관찰한 모습, 변화, 알게 된 점을 적어보세요.'}
                                        disabled={disabled}
                                        autoCapitalize="sentences"
                                        lang="ko"
                                        style={{ ...SECTION_BODY_STYLE, fontSize: isMobile ? '1rem' : '1.08rem' }}
                                    />
                                    {sourcesEnabled && (
                                        <div className="report-editor__source">
                                            <label htmlFor={`report-source-${section.id}`}>📚 출처</label>
                                            <StudentTextField
                                                id={`report-source-${section.id}`}
                                                type="text"
                                                value={section.source || ''}
                                                maxLength={REPORT_SOURCE_MAX}
                                                onChange={(event) => updateSection(section.id, { source: event.target.value })}
                                                placeholder="예: 『우리 음식 이야기』 33쪽 / 누리집 이름과 주소, 본 날짜"
                                                disabled={disabled}
                                                lang="ko"
                                                style={{ padding: '9px 11px', border: '1px solid #99F6E4', borderRadius: '10px', fontSize: '.92rem' }}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    );
                })}
            </div>

            {!disabled && (
                <div className="report-editor__add-actions">
                    <button
                        type="button"
                        className="report-editor__add-button"
                        onClick={handleAddSection}
                        disabled={sections.length >= normalizedConfig.maxSections || Boolean(uploadingSectionId)}
                    >
                        {sections.length >= normalizedConfig.maxSections
                            ? `내용 칸은 ${normalizedConfig.maxSections}개까지 만들 수 있어요`
                            : (kindDef ? `＋ ${kindDef.contentLabel} 칸 추가` : '＋ 사진과 관찰 결과 칸 추가')}
                    </button>
                </div>
            )}
        </div>
    );
};

export default ReportEditor;
