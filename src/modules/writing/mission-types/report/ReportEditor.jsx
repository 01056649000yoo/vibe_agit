import React, { useEffect, useMemo, useState } from 'react';
import SpellingUnderlineInput from '../../tools/spelling-lookup/SpellingUnderlineInput';
import SpellingUnderlineTextarea from '../../tools/spelling-lookup/SpellingUnderlineTextarea';
import {
    buildReportStructuredContent,
    createReportSection,
    normalizeReportConfig,
    normalizeReportSections,
    reportSectionsToContent,
} from './reportContent';
import {
    getReportImageUrls,
    optimizeReportImage,
    removeReportImage,
    uploadReportImage,
} from './reportImageApi';
import './reportWriting.css';

const TITLE_INPUT_STYLE = {
    width: '100%', boxSizing: 'border-box', padding: '16px 0', fontWeight: '900',
    border: 'none', borderBottom: '2px solid #99F6E4', outline: 'none',
    color: '#134E4A', background: 'transparent',
};

const SECTION_TITLE_STYLE = {
    width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: '12px',
    border: '1px solid #99F6E4', outline: 'none', background: '#F0FDFA',
    color: '#134E4A', fontWeight: '900', fontFamily: 'inherit',
};

const SECTION_BODY_STYLE = {
    width: '100%', minHeight: '150px', boxSizing: 'border-box', padding: '14px',
    border: '1px solid #E2E8F0', borderRadius: '14px', resize: 'vertical',
    outline: 'none', background: '#FFFFFF', color: '#334155', lineHeight: 1.8,
    fontFamily: 'inherit',
};

const CAPTION_STYLE = {
    width: '100%', boxSizing: 'border-box', marginTop: '10px', padding: '11px 12px',
    border: '1px solid #CBD5E1', borderRadius: '11px', outline: 'none',
    background: '#FFFFFF', color: '#475569', fontFamily: 'inherit',
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
    const [imageUrls, setImageUrls] = useState(() => new Map());
    const [uploadingSectionId, setUploadingSectionId] = useState(null);
    const [photoStatus, setPhotoStatus] = useState('');
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

    const buildNextDraft = (nextSections) => {
        const nextStructuredContent = buildReportStructuredContent(nextSections);
        const nextContent = reportSectionsToContent(nextSections);
        return { structuredContent: nextStructuredContent, content: nextContent };
    };

    const commitSections = (nextSections) => {
        const nextDraft = buildNextDraft(nextSections);
        setStructuredContent(nextDraft.structuredContent);
        setContent(nextDraft.content);
        return nextDraft;
    };

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
        commitSections([...sections, createReportSection(`내용 ${sections.length + 1}`)]);
    };

    const handleRemoveSection = async (section) => {
        if (sections.length <= normalizedConfig.minSections) return;
        if (!window.confirm(`“${section.heading || '이 내용 칸'}”을 보고서에서 뺄까요?`)) return;
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
                    ? { ...item, image: { ...uploaded, caption: item.image?.caption || '' } }
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
            <SpellingUnderlineInput
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="보고서 제목을 적어주세요"
                disabled={disabled}
                autoCapitalize="sentences"
                lang="ko"
                style={{ ...TITLE_INPUT_STYLE, fontSize: isMobile ? '1.45rem' : '1.9rem' }}
            />

            <div className="report-editor__intro">
                <span>칸마다 소제목과 내용을 쓰고, 필요하면 사진을 넣어요.</span>
                <span>내용 칸 {sections.length}/{normalizedConfig.maxSections} · 사진 {imageCount}/{normalizedConfig.maxImages}</span>
            </div>

            <div className="report-editor__sections">
                {sections.map((section, index) => {
                    const imageUrl = section.image?.path ? imageUrls.get(section.image.path) : null;
                    const isUploading = uploadingSectionId === section.id;
                    return (
                        <section className="report-editor__section" key={section.id}>
                            <header className="report-editor__section-header">
                                <span className="report-editor__section-number">☰ {index + 1}번 내용 칸</span>
                                {!disabled && (
                                    <div className="report-editor__section-actions">
                                        <button
                                            type="button"
                                            className="report-editor__icon-button"
                                            onClick={() => moveSection(index, -1)}
                                            disabled={index === 0 || Boolean(uploadingSectionId)}
                                            aria-label={`${index + 1}번 내용 칸 위로 이동`}
                                        >↑ 위로</button>
                                        <button
                                            type="button"
                                            className="report-editor__icon-button"
                                            onClick={() => moveSection(index, 1)}
                                            disabled={index === sections.length - 1 || Boolean(uploadingSectionId)}
                                            aria-label={`${index + 1}번 내용 칸 아래로 이동`}
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

                            <SpellingUnderlineInput
                                value={section.heading}
                                onChange={(event) => updateSection(section.id, { heading: event.target.value })}
                                placeholder="이 칸의 소제목"
                                disabled={disabled}
                                lang="ko"
                                style={SECTION_TITLE_STYLE}
                            />
                            <div style={{ marginTop: '10px' }}>
                                <SpellingUnderlineTextarea
                                    value={section.body}
                                    onChange={(event) => updateSection(section.id, { body: event.target.value })}
                                    placeholder="관찰하거나 조사한 사실, 과정, 결과를 자세히 적어보세요."
                                    disabled={disabled}
                                    autoCapitalize="sentences"
                                    lang="ko"
                                    style={{ ...SECTION_BODY_STYLE, fontSize: isMobile ? '1rem' : '1.08rem' }}
                                />
                            </div>

                            {section.image?.path ? (
                                <div className="report-editor__photo-box">
                                    {imageUrl ? (
                                        <img
                                            src={imageUrl}
                                            alt={section.image.caption || `${index + 1}번 칸 사진`}
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    ) : (
                                        <div className="report-document__image-placeholder">사진을 불러오는 중...</div>
                                    )}
                                    <div style={{ marginTop: '8px', color: '#64748B', fontSize: '.74rem', fontWeight: 800 }}>
                                        웹 최적화 완료 · {Math.max(1, Math.round((section.image.bytes || 0) / 1024))}KB
                                        {section.image.width && section.image.height ? ` · ${section.image.width}×${section.image.height}px` : ''}
                                    </div>
                                    <SpellingUnderlineInput
                                        value={section.image.caption || ''}
                                        onChange={(event) => updateSection(section.id, {
                                            image: { ...section.image, caption: event.target.value },
                                        })}
                                        placeholder="사진에서 무엇을 볼 수 있는지 설명해주세요 (필수)"
                                        disabled={disabled}
                                        lang="ko"
                                        style={CAPTION_STYLE}
                                    />
                                    {!disabled && (
                                        <div className="report-editor__photo-actions">
                                            <label className="report-editor__file-label">
                                                {isUploading ? '처리 중...' : '사진 바꾸기'}
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    disabled={Boolean(uploadingSectionId)}
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
                                </div>
                            ) : !disabled && (
                                <div className="report-editor__photo-actions">
                                    <label className="report-editor__file-label" style={{ opacity: imageCount >= normalizedConfig.maxImages ? .48 : 1 }}>
                                        {isUploading ? '사진 처리 중...' : '＋ 이 칸에 사진 넣기'}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            disabled={Boolean(uploadingSectionId) || imageCount >= normalizedConfig.maxImages}
                                            onChange={(event) => {
                                                const file = event.target.files?.[0];
                                                event.target.value = '';
                                                handlePhotoChange(section, file);
                                            }}
                                        />
                                    </label>
                                </div>
                            )}

                            {isUploading && <div className="report-editor__status" role="status">{photoStatus}</div>}
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
                            : '＋ 새 내용 칸 추가'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default ReportEditor;
