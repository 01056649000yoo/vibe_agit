import React, { useEffect, useMemo, useState } from 'react';
import { getReportImageUrls } from './reportImageApi';
import { isReportStructuredContent, normalizeReportSections } from './reportContent';
import './reportWriting.css';

const ReportDocument = ({ structuredContent, content = '', compact = false }) => {
    const sections = useMemo(
        () => normalizeReportSections(structuredContent, content),
        [content, structuredContent]
    );
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

    return (
        <div className={`report-document${compact ? ' report-document--compact' : ''}`}>
            {sections.map((section, index) => {
                const imageUrl = section.image?.path ? imageUrls.get(section.image.path) : null;
                return (
                    <section className="report-document__section" key={section.id || index}>
                        <div className="report-document__number" aria-hidden="true">{index + 1}</div>
                        <div className="report-document__body">
                            {section.heading?.trim() && <h3>{section.heading}</h3>}
                            {section.body?.trim() && <p>{section.body}</p>}
                            {section.image?.path && (
                                <figure>
                                    {imageUrl ? (
                                        <img
                                            src={imageUrl}
                                            alt={section.image.caption || `${index + 1}번 보고서 사진`}
                                            loading="lazy"
                                            decoding="async"
                                            width={section.image.width || undefined}
                                            height={section.image.height || undefined}
                                        />
                                    ) : (
                                        <div className="report-document__image-placeholder">
                                            {imageLoadFailed ? '사진을 불러오지 못했어요.' : '사진을 불러오는 중...'}
                                        </div>
                                    )}
                                    {section.image.caption?.trim() && <figcaption>{section.image.caption}</figcaption>}
                                </figure>
                            )}
                        </div>
                    </section>
                );
            })}
        </div>
    );
};

export default ReportDocument;
