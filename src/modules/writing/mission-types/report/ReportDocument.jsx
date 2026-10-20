import React, { useEffect, useMemo, useState } from 'react';
import { getReportImageUrls } from './reportImageApi';
import { collectReportSources, describeReportMeta, getReportKind, isReportStructuredContent, normalizeReportSections, readReportMeta } from './reportContent';
import './reportWriting.css';

const ReportDocument = ({ structuredContent, content = '', compact = false }) => {
    const sections = useMemo(
        () => normalizeReportSections(structuredContent, content),
        [content, structuredContent]
    );
    // 양식 종류(관찰·조사)가 있는 보고서는 머리말·소제목·날짜·사진 설명·참고 자료도 보여 준다. 예전 보고서는 그대로.
    const { kindDef, metaRows, sources } = useMemo(() => {
        const { kind, meta } = readReportMeta(structuredContent);
        return {
            kindDef: getReportKind(kind),
            metaRows: describeReportMeta(kind, meta),
            sources: kind ? collectReportSources(sections) : [],
        };
    }, [sections, structuredContent]);
    const imagePathKey = sections
        .map((section) => section.image?.path)
        .filter(Boolean)
        .join('\n');
    const [imageUrls, setImageUrls] = useState(() => new Map());
    const [imageLoadFailed, setImageLoadFailed] = useState(false);

    useEffect(() => {
        let active = true;
        const paths = imagePathKey ? imagePathKey.split('\n') : [];
        getReportImageUrls(paths)
            .then((urls) => {
                if (active) {
                    setImageLoadFailed(false);
                    setImageUrls(urls);
                }
            })
            .catch((error) => {
                console.error('[ReportDocument] 사진 주소 발급 실패:', error.message);
                if (active) setImageLoadFailed(true);
            });
        return () => { active = false; };
    }, [imagePathKey]);

    if (!isReportStructuredContent(structuredContent)) return null;

    const photoCount = sections.filter((section) => section.image?.path).length;
    // 칸마다 그 칸까지의 사진 번호(사진 없는 칸은 건너뛴다).
    const photoNumbers = sections.reduce((list, section) => [...list, (list.at(-1) ?? 0) + (section.image?.path ? 1 : 0)], []);

    return (
        <div className={`report-document${compact ? ' report-document--compact' : ''}`}>
            {/* 보고서 용지의 머리: 어떤 글인지와 분량. 제목·쓴 사람은 부른 화면이 이미 위에 보여 준다. */}
            {!compact && (
                <header className="report-document__masthead">
                    <strong>{kindDef ? `${kindDef.icon} ${kindDef.label}` : '📋 관찰·조사 보고서'}</strong>
                    <span>{kindDef ? '내용' : '관찰'} {sections.length}칸{photoCount > 0 ? ` · 사진 ${photoCount}장` : ''}</span>
                </header>
            )}
            {kindDef && metaRows.length > 0 && (
                <dl className="report-document__meta">
                    {metaRows.map((row) => (
                        <div key={row.key}>
                            <dt>{row.label}</dt>
                            <dd>{row.value}</dd>
                        </div>
                    ))}
                </dl>
            )}
            {sections.map((section, index) => {
                const imageUrl = section.image?.path ? imageUrls.get(section.image.path) : null;
                const observation = section.body?.trim() || (kindDef ? '' : section.image?.caption?.trim() || '');
                return (
                    <section className="report-document__section" key={section.id || index}>
                        <div className="report-document__number" aria-hidden="true">{kindDef ? index + 1 : <>관찰 {index + 1}</>}</div>
                        <div className={`report-document__body${section.image?.path ? ' report-document__body--with-photo' : ''}`}>
                            {section.image?.path && (
                                <figure>
                                    <div className="report-document__photo-frame">
                                        {imageUrl ? (
                                            <img
                                                src={imageUrl}
                                                alt={section.image.caption || `${index + 1}번 보고서 사진`}
                                                loading="lazy"
                                                decoding="async"
                                            />
                                        ) : (
                                            <div className="report-document__image-placeholder">
                                                {imageLoadFailed ? '사진을 불러오지 못했어요.' : '사진을 불러오는 중...'}
                                            </div>
                                        )}
                                    </div>
                                    <span className="report-document__photo-no">사진 {photoNumbers.at(index)}</span>
                                    {kindDef && section.image.caption?.trim() && (
                                        <span className="report-document__photo-caption">{section.image.caption.trim()}</span>
                                    )}
                                </figure>
                            )}
                            <div className="report-document__copy">
                                <span className="report-document__label">
                                    {kindDef ? (section.heading?.trim() || kindDef.contentLabel) : '관찰 결과'}
                                    {kindDef && section.date?.trim() && <span className="report-document__date">{section.date.trim()}</span>}
                                </span>
                                {observation
                                    ? <p>{observation}</p>
                                    : <p className="report-document__empty">아직 쓰지 않았어요.</p>}
                            </div>
                        </div>
                    </section>
                );
            })}
            {sources.length > 0 && (
                <section className="report-document__sources" aria-label="참고 자료">
                    <strong>📚 참고 자료</strong>
                    <ol>{sources.map((text) => <li key={text}>{text}</li>)}</ol>
                </section>
            )}
        </div>
    );
};

export default ReportDocument;
