const formatDate = (value) => {
    if (!value) return '-';
    return new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date(value));
};

const visibilityLabel = (value) => (value === 'class' ? '친구 공개' : '친구 비공개');

const reviewLabel = (value) => {
    if (value === 'commented') return '선생님 한마디 있음';
    if (value === 'checked') return '확인 완료';
    return '미확인';
};

const assignmentProfile = {
    id: 'assignment',
    label: '선생님 과제',
    sheetName: '과제 글',
    toExcelRow: (item) => ({
        번호: item.student_code || '',
        작성자: item.student_name || '이름 없음',
        미션제목: item.group_title || '제목 없음',
        학생글제목: item.post_title || '제목 없음',
        승인일: item.approved_at ? formatDate(item.approved_at) : '미승인',
        내용: item.content || ''
    }),
    documentHeading: (item) => item.group_title || '선생님 과제',
    itemHeading: (item) => item.post_title || '제목 없는 글',
    metadataLines: (item) => [
        `작성자: ${item.student_name || '이름 없음'}`,
        `승인일: ${item.approved_at ? formatDate(item.approved_at) : '미승인'}`
    ]
};

const readingLogProfile = {
    id: 'reading_log',
    label: '독서록',
    sheetName: '독서록',
    toExcelRow: (item) => ({
        번호: item.student_code || '',
        작성자: item.student_name || '이름 없음',
        책제목: item.source_title || '책 정보 없음',
        책저자: Array.isArray(item.source_authors) ? item.source_authors.join(', ') : '',
        독서록제목: item.post_title || '제목 없음',
        작성일: formatDate(item.created_at),
        마지막수정일: formatDate(item.updated_at),
        공개범위: visibilityLabel(item.visibility),
        선생님확인: reviewLabel(item.review_status),
        선생님한마디: item.teacher_comment || '',
        내용: item.content || ''
    }),
    documentHeading: (item) => `${item.student_name || '이름 없음'} 학생의 독서록`,
    itemHeading: (item) => `『${item.source_title || '책 정보 없음'}』 ${item.post_title || '제목 없는 독서록'}`,
    metadataLines: (item) => {
        const authors = Array.isArray(item.source_authors) ? item.source_authors.join(', ') : '';
        return [
            authors ? `책 저자: ${authors}` : null,
            `작성일: ${formatDate(item.created_at)}`,
            `공개 범위: ${visibilityLabel(item.visibility)}`,
            `선생님 확인: ${reviewLabel(item.review_status)}`,
            item.teacher_comment ? `선생님 한마디: ${item.teacher_comment}` : null
        ].filter(Boolean);
    }
};

export const WRITING_EXPORT_PROFILES = Object.freeze({
    assignment: assignmentProfile,
    reading_log: readingLogProfile
});

export const getWritingExportProfile = (contentType) => (
    WRITING_EXPORT_PROFILES[contentType] || {
        ...assignmentProfile,
        id: contentType,
        label: contentType,
        sheetName: '글 모음'
    }
);

export const toWritingExportExcelRows = (items, contentType) => {
    const profile = getWritingExportProfile(contentType);
    return (items || []).map(profile.toExcelRow);
};

export const toWritingExportDocumentEntries = (items, contentType) => {
    const profile = getWritingExportProfile(contentType);
    return (items || []).map((item) => ({
        group: profile.documentHeading(item),
        heading: profile.itemHeading(item),
        metadata: profile.metadataLines(item),
        content: item.content || ''
    }));
};

