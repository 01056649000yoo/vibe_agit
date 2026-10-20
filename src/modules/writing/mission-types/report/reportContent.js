import { countContentChars } from '../../../../lib/textMetrics.js';

export const REPORT_TEMPLATE_ID = 'report';
export const REPORT_MAX_SECTIONS = 12;
export const REPORT_MAX_IMAGES = 3;

export const DEFAULT_REPORT_SECTION_TITLES = Object.freeze([
    '조사하거나 관찰한 까닭',
    '조사하거나 관찰한 내용',
    '결과와 새롭게 알게 된 점',
]);

// ── 양식 종류(2026-10-21, 선생님 결정: 가장 무난한 일반 양식) ─────────────────────────────
// 과제에 종류(`template_config.kind`)가 없으면 예전 방식 그대로(머리말·날짜·출처 없음).
export const REPORT_KIND_OBSERVATION = 'observation';
export const REPORT_KIND_RESEARCH = 'research';
export const REPORT_META_MAX = 100;
export const REPORT_DATE_MAX = 30;
export const REPORT_SOURCE_MAX = 200;
export const REPORT_CAPTION_MAX = 40;

export const REPORT_KINDS = Object.freeze({
    [REPORT_KIND_OBSERVATION]: Object.freeze({
        id: REPORT_KIND_OBSERVATION,
        label: '관찰 보고서',
        icon: '🔍',
        summary: '직접 보고 관찰한 것을 사진과 글로 기록해요.',
        contentLabel: '관찰한 내용',
        bodyPlaceholder: '눈으로 본 모양·색깔·크기, 냄새, 소리, 만져 본 느낌, 달라진 점을 자세히 적어 보세요.',
        dateLabel: '관찰한 날',
        datePlaceholder: '예: 10월 3일',
        defaultSections: Object.freeze(['관찰한 까닭', '관찰한 모습', '알게 된 점과 느낀 점']),
        // 처음 놓인 칸 순서대로 사진 칸이 있는지(까닭·느낀 점 칸은 글만). 더한 칸은 사진 칸이 있다.
        photoSlots: Object.freeze([false, true, false]),
        photoHint: '관찰한 모습을 사진으로 남겨요.',
        metaFields: Object.freeze([
            Object.freeze({ key: 'target', label: '관찰 대상', placeholder: '예: 강낭콩', required: true }),
            Object.freeze({ key: 'period', label: '관찰 기간·날짜', placeholder: '예: 10월 1일 ~ 10월 20일' }),
            Object.freeze({ key: 'place', label: '관찰 장소', placeholder: '예: 교실 창가' }),
            Object.freeze({ key: 'weather', label: '날씨', placeholder: '예: 맑음' }),
            Object.freeze({ key: 'method', label: '관찰 방법·도구', placeholder: '예: 눈, 돋보기, 자' }),
        ]),
    }),
    [REPORT_KIND_RESEARCH]: Object.freeze({
        id: REPORT_KIND_RESEARCH,
        label: '조사 보고서',
        icon: '📚',
        summary: '책·인터넷 등에서 찾은 내용을 정리해요.',
        contentLabel: '조사한 내용',
        bodyPlaceholder: '알아낸 내용을 내 말로 정리해서 적어 보세요. 책이나 누리집 글을 그대로 옮겨 쓰지 않아요.',
        dateLabel: '',
        datePlaceholder: '',
        defaultSections: Object.freeze(['조사한 까닭', '조사한 내용', '알게 된 점', '느낀 점과 더 알고 싶은 점']),
        photoSlots: Object.freeze([false, true, false, false]),
        photoHint: '조사한 내용에 도움이 되는 사진·그림이 있으면 넣어요(없어도 돼요).',
        metaFields: Object.freeze([
            Object.freeze({ key: 'topic', label: '조사 주제', placeholder: '예: 우리 고장의 전통 음식', required: true }),
            Object.freeze({ key: 'period', label: '조사 기간', placeholder: '예: 10월 5일 ~ 10월 12일' }),
            Object.freeze({ key: 'method', label: '조사 방법', placeholder: '예: 책, 인터넷, 인터뷰, 설문', chips: Object.freeze(['책', '인터넷', '인터뷰', '설문']) }),
        ]),
    }),
});

const KIND_BY_ID = new Map(Object.entries(REPORT_KINDS));
export const getReportKind = (kind) => KIND_BY_ID.get(kind) || null;

/** 이 순서의 칸에 사진 칸을 둘지: 선생님이 정한 값(flags)이 있으면 그것, 없으면 그 종류의 기본값.
 *  종류가 없으면(예전 방식) 모든 칸에 둔다. */
export const reportKindAllowsPhoto = (kind, index, flags = []) => {
    const def = getReportKind(kind);
    if (!def) return true;
    const set = Array.isArray(flags) ? flags.at(index) : undefined;
    return typeof set === 'boolean' ? set : (def.photoSlots.at(index) ?? true);
};

/** 글에 저장된 종류(머리말 안)나 과제 설정의 종류. 없으면 null(예전 방식). */
export const reportKindOf = (structuredContent, config = {}) => (
    getReportKind(config?.kind)?.id || getReportKind(structuredContent?.meta?.kind)?.id || null
);

/** 머리말: 그 종류에 정해진 칸 이름만 남기고 길이를 자른다.
 *  입력하는 중에 저장할 때는 공백을 지우면 띄어쓰기를 칠 수 없어서 `trim: false` 로 둔다. */
export const normalizeReportMeta = (meta, kind, { trim = true } = {}) => {
    const def = getReportKind(kind);
    if (!def) return {};
    const source = meta && typeof meta === 'object' ? meta : {};
    return Object.fromEntries(def.metaFields
        .map(({ key }) => {
            const raw = String(Reflect.get(source, key) ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, REPORT_META_MAX);
            return [key, trim ? raw.replace(/\s+/g, ' ').trim() : raw, raw.trim()];
        })
        .filter(([, , check]) => check)
        .map(([key, text]) => [key, text]));
};

export const readReportMeta = (structuredContent, config = {}) => {
    const kind = reportKindOf(structuredContent, config);
    return { kind, meta: normalizeReportMeta(structuredContent?.meta, kind) };
};

/** 보여 줄 머리말: [{ key, label, value }] — 값이 있는 칸만, 정해진 순서대로. */
export const describeReportMeta = (kind, meta) => {
    const def = getReportKind(kind);
    if (!def) return [];
    const source = meta && typeof meta === 'object' ? meta : {};
    return def.metaFields
        .map(({ key, label }) => ({ key, label, value: String(Reflect.get(source, key) ?? '').trim() }))
        .filter((row) => row.value);
};

/** 칸마다 적은 출처를 한 목록으로(같은 출처는 한 번만). */
export const collectReportSources = (sections) => {
    const seen = new Set();
    const list = [];
    (sections || []).forEach((section) => {
        const text = String(section?.source || '').replace(/\s+/g, ' ').trim();
        if (text && !seen.has(text)) { seen.add(text); list.push(text); }
    });
    return list;
};

const toBoundedInteger = (value, fallback, min, max) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, Math.round(numeric)));
};

const cleanText = (value, maxLength) => String(value || '').slice(0, maxLength);

export const normalizeReportConfig = (config = {}) => {
    const rawFlags = Array.isArray(config.section_photos) ? config.section_photos : [];
    const kept = Array.isArray(config.default_sections)
        ? config.default_sections
            .map((title, index) => ({ title: cleanText(title, 80).trim(), flag: rawFlags.at(index) }))
            .filter((item) => item.title)
            .slice(0, REPORT_MAX_SECTIONS)
        : [];
    const defaultSections = kept.map((item) => item.title);
    const kind = getReportKind(config.kind)?.id || null;
    const kindDefaults = getReportKind(kind) ? [...getReportKind(kind).defaultSections] : [...DEFAULT_REPORT_SECTION_TITLES];
    const sectionTitles = defaultSections.length > 0
        ? defaultSections
        : kindDefaults;
    const minSections = toBoundedInteger(config.min_sections, 2, 1, REPORT_MAX_SECTIONS);

    while (sectionTitles.length < minSections) {
        sectionTitles.push(`내용 ${sectionTitles.length + 1}`);
    }

    // 종류가 있으면 칸마다 사진 칸이 있는지(선생님이 정함, 정하지 않았으면 그 종류의 기본값). 종류가 없으면 모두 true.
    const customFlags = defaultSections.length > 0 ? kept.map((item) => item.flag) : [];
    const sectionPhotos = sectionTitles.map((_, index) => reportKindAllowsPhoto(kind, index, customFlags));

    return {
        kind,
        sectionPhotos,
        // 출처 쓰기는 선생님이 과제마다 켠다(기본 꺼짐).
        sourcesEnabled: config.sources_enabled === true,
        defaultSections: sectionTitles,
        minSections,
        maxSections: toBoundedInteger(config.max_sections, REPORT_MAX_SECTIONS, minSections, REPORT_MAX_SECTIONS),
        maxImages: toBoundedInteger(config.max_images, REPORT_MAX_IMAGES, 1, REPORT_MAX_IMAGES),
    };
};

export const createReportSection = (heading = '', stableIndex = null, photo = true) => ({
    id: stableIndex === null
        ? (globalThis.crypto?.randomUUID?.() || `section-${Date.now()}-${Math.random().toString(16).slice(2)}`)
        : `section-${stableIndex + 1}`,
    heading: cleanText(heading, 80),
    body: '',
    image: null,
    date: '',
    source: '',
    photo,
});

const normalizeImage = (image, fallbackCaption = '') => {
    if (!image || typeof image !== 'object' || !String(image.path || '').trim()) return null;
    const caption = String(image.caption || '').trim() ? image.caption : fallbackCaption;
    return {
        path: cleanText(image.path, 300),
        caption: cleanText(caption, 240),
        width: Math.max(0, Number(image.width) || 0),
        height: Math.max(0, Number(image.height) || 0),
        bytes: Math.max(0, Number(image.bytes) || 0),
        mimeType: cleanText(image.mimeType, 40),
    };
};

export const normalizeReportSections = (structuredContent, content = '', config = {}) => {
    const normalizedConfig = normalizeReportConfig(config);
    // 양식 종류가 있는 보고서는 사진 설명을 본문과 따로 받는다(없으면 예전처럼 본문을 설명으로 쓴다).
    const bodyAsCaption = !reportKindOf(structuredContent, normalizedConfig);
    const savedSections = Array.isArray(structuredContent?.sections)
        ? structuredContent.sections
        : [];
    const sourceSections = savedSections.length > 0
        ? savedSections
        : normalizedConfig.defaultSections.map((heading, index) => createReportSection(heading, index, normalizedConfig.sectionPhotos.at(index) ?? true));
    const usedIds = new Set();

    const sections = sourceSections.slice(0, normalizedConfig.maxSections).map((section, index) => {
        const proposedId = cleanText(section?.id, 80).trim() || `section-${index + 1}`;
        let id = proposedId;
        for (let n = index + 1; usedIds.has(id); n += 1) {
            // 접미사를 붙여도 80자(서버 상한)를 넘지 않게 앞을 자른다.
            const suffix = `-${n}`;
            id = `${proposedId.slice(0, 80 - suffix.length)}${suffix}`;
        }
        usedIds.add(id);
        return {
            id,
            heading: cleanText(section?.heading, 80),
            body: cleanText(section?.body, 12000),
            image: normalizeImage(section?.image, bodyAsCaption ? section?.body : ''),
            photo: typeof section?.photo === 'boolean' ? section.photo : (normalizedConfig.sectionPhotos.at(index) ?? true),
            date: cleanText(section?.date, REPORT_DATE_MAX),
            source: cleanText(section?.source, REPORT_SOURCE_MAX),
        };
    });

    if (savedSections.length === 0 && content?.trim() && sections[0]) {
        sections[0] = { ...sections[0], body: cleanText(content, 12000) };
    }

    while (sections.length < normalizedConfig.minSections) {
        const index = sections.length;
        const added = createReportSection(normalizedConfig.defaultSections.at(index) || `내용 ${index + 1}`, index, normalizedConfig.sectionPhotos.at(index) ?? true);
        for (let n = index + 1; usedIds.has(added.id); n += 1) added.id = `section-${n}`;
        usedIds.add(added.id);
        sections.push(added);
    }

    return sections;
};

export const buildReportStructuredContent = (sections, { kind = null, meta = null } = {}) => {
    const validKind = getReportKind(kind)?.id || null;
    const metaValues = validKind ? normalizeReportMeta(meta, validKind, { trim: false }) : {};
    return {
        template: REPORT_TEMPLATE_ID,
        version: 1,
        ...(validKind ? { meta: { kind: validKind, ...metaValues } } : {}),
        sections: sections.map((section) => {
            const date = cleanText(section.date, REPORT_DATE_MAX);
            const source = cleanText(section.source, REPORT_SOURCE_MAX);
            return {
                id: cleanText(section.id, 80),
                heading: cleanText(section.heading, 80),
                body: cleanText(section.body, 12000),
                image: normalizeImage(section.image, validKind ? '' : section.body),
                ...(validKind ? { photo: section.photo !== false } : {}),
                ...(date.trim() ? { date } : {}),
                ...(source.trim() ? { source } : {}),
            };
        }),
    };
};

export const reportSectionsToContent = (sections, { kind = null, meta = null } = {}) => {
    const validKind = getReportKind(kind)?.id || null;
    const head = validKind
        ? describeReportMeta(validKind, normalizeReportMeta(meta, validKind)).map(({ label, value }) => `${label}: ${value}`).join('\n')
        : '';
    const body = sections
        .map((section) => {
            const text = section.body?.trim() || '';
            const caption = section.image?.caption?.trim() || '';
            const date = section.date?.trim() || '';
            const parts = [section.heading?.trim(), date && validKind ? `(${date})` : '', text];
            if (caption && !text.startsWith(caption)) parts.push(`사진 설명: ${caption}`);
            return parts.filter(Boolean).join('\n');
        })
        .filter(Boolean)
        .join('\n\n');
    const sources = validKind ? collectReportSources(sections) : [];
    const tail = sources.length ? `참고 자료\n${sources.map((text, i) => `${i + 1}. ${text}`).join('\n')}` : '';
    return [head, body, tail].filter(Boolean).join('\n\n');
};

// 글자 수는 학생이 쓴 칸 내용만 센다. 선생님이 정한 칸 제목은 넣지 않는다.
// (칸 제목이 질문 문장이면 학생이 한 글자도 안 써도 수백 자로 보였다. 2026-09-28 제보)
// 옛 글처럼 내용 없이 사진 설명만 있으면 그 설명을 센다.
export const countReportWrittenChars = (structuredContent) => {
    if (structuredContent?.template !== REPORT_TEMPLATE_ID || !Array.isArray(structuredContent.sections)) {
        return null;
    }
    return structuredContent.sections.reduce((sum, section) => {
        const body = String(section?.body ?? '');
        return sum + countContentChars(body !== '' ? body : String(section?.image?.caption ?? ''));
    }, 0);
};

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
    const kind = normalizedConfig.kind;
    const missingCaptionIndex = sections.findIndex((section) => (
        section.image?.path && !section.image.caption?.trim()
    ));
    if (missingCaptionIndex >= 0) {
        return kind
            ? `${missingCaptionIndex + 1}번 칸의 사진 설명을 적어주세요. 🖼️`
            : `${missingCaptionIndex + 1}번 칸의 사진에 대한 관찰 결과를 적어주세요. 🖼️`;
    }
    if (kind) {
        const meta = normalizeReportMeta(structuredContent?.meta, kind);
        const missing = getReportKind(kind).metaFields.find(({ key, required }) => required && !Reflect.get(meta, key));
        if (missing) return `${missing.label}을(를) 적어주세요. 📋`;
        if (normalizedConfig.sourcesEnabled && collectReportSources(sections).length < 1) {
            return '출처(참고한 책이나 누리집)를 하나 이상 적어주세요. 📚';
        }
    }
    return null;
};

export const isReportStructuredContent = (structuredContent) => (
    structuredContent?.template === REPORT_TEMPLATE_ID
    && Array.isArray(structuredContent.sections)
);
