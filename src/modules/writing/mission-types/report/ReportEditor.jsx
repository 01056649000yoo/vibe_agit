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

    const persistSections = async (nextSections, targetPostId = null) => {
        const nextDraft = commitSections(nextSections);
        if (!onPersistDraft) return true;
        return onPersistDraft(nextDraft, targetPostId);
    };

    const updateSection = (sectionId, patch) => {
        commitSections(sections.map((section) => (
            section.id === sectionId ? { ...section, ...patch } : section
        )));
    };

    const updateObservation = (section, observation) => {
        updateSection(section.id, {
            body: observation,
            image: section.image
                ? { ...section.image, caption: observation.slice(0, 240) }
                : null,
        });
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
        commitSections([...sections, createReportSection(`관찰 결과 ${sections.length + 1}`)]);
    };

    const handleRemoveSection = async (section) => {
        if (sections.length <= normalizedConfig.minSections) return;
        if (!window.confirm('이 사진과 관찰 결과 칸을 보고서에서 뺄까요?')) return;
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
                    ? {
                        ...item,
                        image: {
                            ...uploaded,
                            caption: String(item.body || item.image?.caption || '').slice(0, 240),
                        },
                    }
                    : item
            ));
            const saved = await persistSections(next, draftPostId);
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
                <span>왼쪽에 사진을 넣고, 오른쪽 글쓰기 창에 사진을 관찰한 결과를 적어요.</span>
                <span>내용 칸 {sections.length}/{normalizedConfig.maxSections} · 사진 {imageCount}/{normalizedConfig.maxImages}</span>
            </div>

            <div className="report-editor__sections">
                {sections.map((section, index) => {
                    const imageUrl = section.image?.path ? imageUrls.get(section.image.path) : null;
                    const isUploading = uploadingSectionId === section.id;
                    const observation = section.body || section.image?.caption || '';
                    return (
                        <section className="report-editor__section" key={section.id}>
                            <header className="report-editor__section-header">
                                <span className="report-editor__section-number">☰ {index + 1}번 사진 + 관찰 결과</span>
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

                            <div className="report-editor__section-layout">
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
                                                    disabled={Boolean(uploadingSectionId) || imageCount >= normalizedConfig.maxImages}
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
                                        </>
                                    )}

                                    {isUploading && <div className="report-editor__status" role="status">{photoStatus}</div>}
                                </div>

                                <div className="report-editor__writing-panel">
                                    <label
                                        className="report-editor__writing-label"
                                        htmlFor={`report-observation-${section.id}`}
                                    >사진에 대한 관찰 결과</label>
                                    <SpellingUnderlineTextarea
                                        id={`report-observation-${section.id}`}
                                        value={observation}
                                        onChange={(event) => updateObservation(section, event.target.value)}
                                        placeholder="사진을 보고 관찰한 모습, 변화, 알게 된 점을 적어보세요."
                                        disabled={disabled}
                                        autoCapitalize="sentences"
                                        lang="ko"
                                        style={{ ...SECTION_BODY_STYLE, fontSize: isMobile ? '1rem' : '1.08rem' }}
                                    />
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
                            : '＋ 사진과 관찰 결과 칸 추가'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default ReportEditor;
