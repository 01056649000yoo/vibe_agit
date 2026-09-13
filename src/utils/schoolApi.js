import { supabase } from '../lib/supabaseClient';

/*
 * 검색을 보내기 전에 기다리는 시간.
 *
 * 서버(`supabase/functions/neis-meal/index.ts` 의 SEARCH_MIN_INTERVAL_MS)는 **500ms** 안에
 * 두 번 오면 429 로 막는다. 화면이 그보다 짧게 보내면 학교 이름을 치다 잠깐 멈출 때마다
 * 막혀서 "Edge Function returned a non-2xx status code" 가 떴다(2026-09-13 제보).
 * 서버 간격보다 넉넉히 길어야 하고, 두 값이 어긋나지 않는지 `tests/schoolSearch.test.mjs`
 * 가 두 파일을 함께 본다.
 */
export const SCHOOL_SEARCH_DEBOUNCE_MS = 700;

/*
 * supabase-js 는 2xx 가 아니면 "Edge Function returned a non-2xx status code" 라는 같은 말만
 * 준다. 서버가 정작 이유를 적어 보냈는데 화면에는 안 보인다. 응답 본문에서 꺼내 쓴다.
 */
const readFunctionError = async (error) => {
    try {
        const payload = await error?.context?.json?.();
        return typeof payload?.error === 'string' ? payload.error : '';
    } catch {
        return '';
    }
};

const isTooManyRequests = (error) => error?.context?.status === 429;

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

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

    const ask = () => supabase.functions.invoke('neis-meal', {
        body: { action: 'search-schools', query }
    });

    let { data, error } = await ask();
    // 너무 빨리 보낸 것뿐이면 한 번은 조용히 다시 묻는다. 선생님께 보일 오류가 아니다.
    if (error && isTooManyRequests(error)) {
        await wait(SCHOOL_SEARCH_DEBOUNCE_MS);
        ({ data, error } = await ask());
    }
    if (error) throw new Error(await readFunctionError(error) || error.message || '학교 검색에 연결할 수 없습니다.');
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
