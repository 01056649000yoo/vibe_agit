import { supabase } from '../../../lib/supabaseClient';

/**
 * 퀴즈 아레나 데이터 길. 문제 세트 저장·공유는 DB 함수(`20261406_quiz_arena_sets`)로만 하고,
 * 기본(공식) 세트는 정적 파일 `public/quiz-arena/official-sets-v1.json` 을 처음 열 때 한 번만 받는다.
 * 화면은 이 객체를 `api` 로 받아 쓰므로 개발실에서는 같은 모양의 흉내 객체를 넣을 수 있다.
 */
const rpc = async (name, params = {}) => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data;
};

let officialPromise = null;
const loadOfficialSets = () => {
    officialPromise ??= fetch('/quiz-arena/official-sets-v1.json')
        .then((response) => {
            if (!response.ok) throw new Error('기본 세트를 불러오지 못했어요');
            return response.json();
        })
        .then((file) => file.sets)
        .catch((error) => { officialPromise = null; throw error; });
    return officialPromise;
};

export const quizArenaApi = Object.freeze({
    loadOfficialSets,
    listMySets: () => rpc('list_my_quiz_arena_sets_v1'),
    getSet: (id) => rpc('get_quiz_arena_set_v1', { p_set_id: id }),
    saveSet: ({ id = null, meta, questions }) => rpc('save_quiz_arena_set_v1', { p_set_id: id, p_meta: meta, p_questions: questions }),
    deleteSet: (id) => rpc('delete_quiz_arena_set_v1', { p_set_id: id }),
    setVisibility: (id, visibility) => rpc('set_quiz_arena_set_visibility_v1', { p_set_id: id, p_visibility: visibility })
});

/** 세트(기본 세트 파일의 한 항목)를 `내 세트` 로 저장하는 인자 모양. */
export const importArgsOf = (set) => ({
    meta: { title: set.title, grade: set.grade == null ? '' : String(set.grade), subject: set.subject, unit: set.unit, description: set.description, source: 'default' },
    questions: set.questions
});
