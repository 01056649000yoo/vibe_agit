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

    const photoCount = sections.filter((section) => section.image?.path).length;
    // 칸마다 그 칸까지의 사진 번호(사진 없는 칸은 건너뛴다).
    const photoNumbers = sections.reduce((list, section) => [...list, (list.at(-1) ?? 0) + (section.image?.path ? 1 : 0)], []);

    return (
        <div className={`report-document${compact ? ' report-document--compact' : ''}`}>
            {/* 보고서 용지의 머리: 어떤 글인지와 분량. 제목·쓴 사람은 부른 화면이 이미 위에 보여 준다. */}
            {!compact && (
                <header className="report-document__masthead">
                    <strong>📋 관찰·조사 보고서</strong>
                    <span>관찰 {sections.length}칸{photoCount > 0 ? ` · 사진 ${photoCount}장` : ''}</span>
                </header>
            )}
            {sections.map((section, index) => {
                const imageUrl = section.image?.path ? imageUrls.get(section.image.path) : null;
                const observation = section.body?.trim() || section.image?.caption?.trim() || '';
                return (
                    <section className="report-document__section" key={section.id || index}>
                        <div className="report-document__number" aria-hidden="true">관찰 {index + 1}</div>
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
                                </figure>
                            )}
                            <div className="report-document__copy">
                                <span className="report-document__label">관찰 결과</span>
                                {observation
                                    ? <p>{observation}</p>
                                    : <p className="report-document__empty">아직 쓰지 않았어요.</p>}
                            </div>
                        </div>
                    </section>
                );
            })}
        </div>
    );
};

export default ReportDocument;
