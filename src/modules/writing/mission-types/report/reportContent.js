export const REPORT_TEMPLATE_ID = 'report';
export const REPORT_MAX_SECTIONS = 12;
export const REPORT_MAX_IMAGES = 3;

export const DEFAULT_REPORT_SECTION_TITLES = Object.freeze([
    '조사하거나 관찰한 까닭',
    '조사하거나 관찰한 내용',
    '결과와 새롭게 알게 된 점',
]);

const toBoundedInteger = (value, fallback, min, max) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, Math.round(numeric)));
};

const cleanText = (value, maxLength) => String(value || '').slice(0, maxLength);

export const normalizeReportConfig = (config = {}) => {
    const defaultSections = Array.isArray(config.default_sections)
        ? config.default_sections
            .map((title) => cleanText(title, 80).trim())
            .filter(Boolean)
            .slice(0, REPORT_MAX_SECTIONS)
        : [];
    const sectionTitles = defaultSections.length > 0
        ? defaultSections
        : [...DEFAULT_REPORT_SECTION_TITLES];
    const minSections = toBoundedInteger(config.min_sections, 2, 1, REPORT_MAX_SECTIONS);

    while (sectionTitles.length < minSections) {
        sectionTitles.push(`내용 ${sectionTitles.length + 1}`);
    }

    return {
        defaultSections: sectionTitles,
        minSections,
        maxSections: toBoundedInteger(config.max_sections, REPORT_MAX_SECTIONS, minSections, REPORT_MAX_SECTIONS),
        maxImages: toBoundedInteger(config.max_images, REPORT_MAX_IMAGES, 1, REPORT_MAX_IMAGES),
    };
};

export const createReportSection = (heading = '', stableIndex = null) => ({
    id: stableIndex === null
        ? (globalThis.crypto?.randomUUID?.() || `section-${Date.now()}-${Math.random().toString(16).slice(2)}`)
        : `section-${stableIndex + 1}`,
    heading: cleanText(heading, 80),
    body: '',
    image: null,
});

const normalizeImage = (image) => {
    if (!image || typeof image !== 'object' || !String(image.path || '').trim()) return null;
    return {
        path: cleanText(image.path, 300),
        caption: cleanText(image.caption, 240),
        width: Math.max(0, Number(image.width) || 0),
        height: Math.max(0, Number(image.height) || 0),
        bytes: Math.max(0, Number(image.bytes) || 0),
        mimeType: cleanText(image.mimeType, 40),
    };
};

export const normalizeReportSections = (structuredContent, content = '', config = {}) => {
    const normalizedConfig = normalizeReportConfig(config);
    const savedSections = Array.isArray(structuredContent?.sections)
        ? structuredContent.sections
        : [];
    const sourceSections = savedSections.length > 0
        ? savedSections
        : normalizedConfig.defaultSections.map((heading, index) => createReportSection(heading, index));
    const usedIds = new Set();

    const sections = sourceSections.slice(0, normalizedConfig.maxSections).map((section, index) => {
        const proposedId = cleanText(section?.id, 80).trim() || `section-${index + 1}`;
        const id = usedIds.has(proposedId) ? `${proposedId}-${index + 1}` : proposedId;
        usedIds.add(id);
        return {
            id,
            heading: cleanText(section?.heading, 80),
            body: cleanText(section?.body, 12000),
            image: normalizeImage(section?.image),
        };
    });

    if (savedSections.length === 0 && content?.trim() && sections[0]) {
        sections[0] = { ...sections[0], body: cleanText(content, 12000) };
    }

    while (sections.length < normalizedConfig.minSections) {
        const index = sections.length;
        sections.push(createReportSection(normalizedConfig.defaultSections.at(index) || `내용 ${index + 1}`, index));
    }

    return sections;
};

export const buildReportStructuredContent = (sections) => ({
    template: REPORT_TEMPLATE_ID,
    version: 1,
    sections: sections.map((section) => ({
        id: cleanText(section.id, 80),
        heading: cleanText(section.heading, 80),
        body: cleanText(section.body, 12000),
        image: normalizeImage(section.image),
    })),
});

export const reportSectionsToContent = (sections) => sections
    .map((section) => {
        const parts = [section.heading?.trim(), section.body?.trim()];
        if (section.image?.caption?.trim()) parts.push(`사진 설명: ${section.image.caption.trim()}`);
        return parts.filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n\n');

export const countFilledReportSections = (sections) => (
    sections.filter((section) => section.body?.trim()).length
);

export const validateReportSubmission = ({ structuredContent, content, config = {} }) => {
    const normalizedConfig = normalizeReportConfig(config);
    const sections = normalizeReportSections(structuredContent, content, config);
    const filledCount = countFilledReportSections(sections);
    if (filledCount < normalizedConfig.minSections) {
        return `내용을 쓴 칸이 최소 ${normalizedConfig.minSections}개 필요해요. 현재 ${filledCount}개를 채웠어요. 📋`;
    }
    if (sections.length > normalizedConfig.maxSections) {
        return `보고서 칸은 ${normalizedConfig.maxSections}개까지 만들 수 있어요.`;
    }
    const imageSections = sections.filter((section) => section.image?.path);
    if (imageSections.length > normalizedConfig.maxImages) {
        return `사진은 ${normalizedConfig.maxImages}장까지 넣을 수 있어요.`;
    }
    const missingCaptionIndex = sections.findIndex((section) => (
        section.image?.path && !section.image.caption?.trim()
    ));
    if (missingCaptionIndex >= 0) {
        return `${missingCaptionIndex + 1}번 칸의 사진이 무엇인지 짧게 설명해주세요. 🖼️`;
    }
    return null;
};

export const isReportStructuredContent = (structuredContent) => (
    structuredContent?.template === REPORT_TEMPLATE_ID
    && Array.isArray(structuredContent.sections)
);
