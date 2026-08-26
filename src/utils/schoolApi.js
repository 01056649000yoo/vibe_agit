import { supabase } from '../lib/supabaseClient';

const normalizeSchool = (school) => ({
    officeCode: String(school?.officeCode || ''),
    schoolCode: String(school?.schoolCode || ''),
    schoolName: String(school?.schoolName || ''),
    address: String(school?.address || ''),
    region: String(school?.region || ''),
    schoolKind: String(school?.schoolKind || '')
});

/**
 * 나이스 키를 브라우저에 노출하지 않는 서버 함수로 초등학교를 검색한다.
 */
export const searchSchools = async (schoolName) => {
    const query = String(schoolName || '').trim();
    if (query.length < 2 || !supabase) return [];

    const { data, error } = await supabase.functions.invoke('neis-meal', {
        body: { action: 'search-schools', query }
    });
    if (error) throw new Error(error.message || '학교 검색에 연결할 수 없습니다.');
    if (data?.error) throw new Error(data.error);
    return Array.isArray(data?.schools) ? data.schools.map(normalizeSchool) : [];
};

export const toTeacherSchoolColumns = (school) => ({
    school_name: school?.schoolName || '',
    school_office_code: school?.officeCode || null,
    school_code: school?.schoolCode || null,
    school_address: school?.address || '',
    school_verified_at: school?.schoolCode ? new Date().toISOString() : null
});

export const teacherSchoolToSelection = (teacher) => {
    if (!teacher?.school_code || !teacher?.school_office_code) return null;
    return normalizeSchool({
        officeCode: teacher.school_office_code,
        schoolCode: teacher.school_code,
        schoolName: teacher.school_name,
        address: teacher.school_address,
        region: '',
        schoolKind: '초등학교'
    });
};
