import { useCallback, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
    DEFAULT_FEEDBACK_PHRASES,
    moveFeedbackPhrase,
    normalizeFeedbackPhrases,
    validateFeedbackPhrase
} from '../constants/feedbackPhrases';

/**
 * 자주 쓰는 피드백 문장 보관함.
 *
 * `profiles.feedback_phrases` 한 열을 읽고 쓴다. 저장 방식은 자주 쓰는 태그
 * (`saveFrequentTag`)와 같다 — 화면을 먼저 바꾸고 DB 에 반영하되, **실패하면 되돌린다.**
 * 태그와 달리 이 문장은 학생에게 그대로 나가므로 조용히 어긋나 있으면 안 된다.
 *
 * 여는 곳이 두 군데(낱개 피드백·일괄 요청)라 훅은 MissionManager 에서 한 번만 부르고
 * 아래로 내려 준다. 창을 열 때마다 다시 읽지 않는다.
 *
 * **처음 펼칠 때 읽는다.** 과제 화면을 열 때마다 미리 읽으면 이 갈래를 쓰지 않는 교사에게도
 * 조회가 한 번씩 붙는다. 그래서 `ensurePhrasesLoaded()` 를 부른 뒤에야 읽고, 그 뒤로는 다시 읽지 않는다.
 */
const useFeedbackPhrases = () => {
    const [phrases, setPhrases] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const loadStateRef = useRef({ started: false, done: false });

    const load = useCallback(async () => {
        loadStateRef.current.started = true;
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { setPhrases([]); return; }

            const { data, error: loadError } = await supabase
                .from('profiles')
                .select('feedback_phrases')
                .eq('id', user.id)
                .maybeSingle();
            if (loadError) throw loadError;

            setPhrases(normalizeFeedbackPhrases(data?.feedback_phrases));
            setError(null);
            loadStateRef.current.done = true;
        } catch (err) {
            console.error('자주 쓰는 문장 불러오기 실패:', err.message);
            setError('문장을 불러오지 못했습니다.');
            // 실패는 다시 읽을 수 있게 남겨 둔다.
            loadStateRef.current.started = false;
        } finally {
            setLoading(false);
        }
    }, []);

    /** 목록을 처음 펼칠 때 부른다. 이미 읽었거나 읽는 중이면 아무 일도 하지 않는다. */
    const ensurePhrasesLoaded = useCallback(() => {
        if (loadStateRef.current.started) return;
        void load();
    }, [load]);

    /** 목록을 통째로 저장한다. 실패하면 화면을 원래대로 되돌리고 알린다. */
    const persist = useCallback(async (nextPhrases, previousPhrases) => {
        const next = normalizeFeedbackPhrases(nextPhrases);
        setPhrases(next);
        setError(null);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('로그인이 필요합니다.');

            const { error: saveError } = await supabase
                .from('profiles')
                .update({ feedback_phrases: next })
                .eq('id', user.id);
            if (saveError) throw saveError;
            return true;
        } catch (err) {
            console.error('자주 쓰는 문장 저장 실패:', err.message);
            setPhrases(previousPhrases);
            setError('저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
            return false;
        }
    }, []);

    const addPhrase = useCallback(async (text) => {
        const message = validateFeedbackPhrase(text, phrases);
        if (message) { setError(message); return false; }
        return persist([...phrases, String(text).trim()], phrases);
    }, [phrases, persist]);

    const updatePhrase = useCallback(async (index, text) => {
        if (index < 0 || index >= phrases.length) return false;
        const others = phrases.filter((_, position) => position !== index);
        const message = validateFeedbackPhrase(text, others);
        if (message) { setError(message); return false; }

        const next = phrases.map((phrase, position) => (position === index ? String(text).trim() : phrase));
        return persist(next, phrases);
    }, [phrases, persist]);

    /** 자주 쓰는 것을 위로 올린다. 자리는 교사가 정하고 저장된다. */
    const movePhrase = useCallback(async (index, direction) => {
        const next = moveFeedbackPhrase(phrases, index, direction);
        if (next.length === phrases.length && next.every((item, position) => item === phrases.at(position))) {
            return false;
        }
        return persist(next, phrases);
    }, [phrases, persist]);

    const removePhrase = useCallback(async (index) => {
        if (index < 0 || index >= phrases.length) return false;
        return persist(phrases.filter((_, position) => position !== index), phrases);
    }, [phrases, persist]);

    /** 빈 목록에 기본 문장을 한 번에 담는다. 담고 나면 교사 것이라 자유롭게 고친다. */
    const seedDefaultPhrases = useCallback(async () => {
        if (phrases.length > 0) return false;
        return persist([...DEFAULT_FEEDBACK_PHRASES], phrases);
    }, [phrases, persist]);

    return {
        phrases, loading, error, ensurePhrasesLoaded,
        addPhrase, updatePhrase, movePhrase, removePhrase, seedDefaultPhrases,
        clearPhraseError: () => setError(null),
        reloadPhrases: load
    };
};

export default useFeedbackPhrases;
