import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

/**
 * 선생님 교정 회차를 **교정지를 열 때 한 번** 불러온다(목록·글 열기에서는 부르지 않는다 — 회차 수만 글에 실려 온다).
 * 서버(get_post_teacher_edits_v1)가 글쓴 학생·담임·관리자만 들여보낸다. 같은 글을 다시 열면 새로 읽는다
 * (그사이 선생님이 또 고쳤을 수 있다).
 */
export const useTeacherEditRounds = (postId, enabled = true) => {
    const [state, setState] = useState({ postId: null, rounds: [], error: '' });
    useEffect(() => {
        if (!enabled || !postId) return undefined;
        let cancelled = false;
        supabase.rpc('get_post_teacher_edits_v1', { p_post_id: postId }).then(({ data, error }) => {
            if (cancelled) return;
            setState({
                postId,
                rounds: Array.isArray(data?.rounds) ? data.rounds : [],
                error: error ? '선생님 교정지를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.' : ''
            });
        });
        return () => { cancelled = true; };
    }, [postId, enabled]);
    const loading = Boolean(enabled && postId && state.postId !== postId);
    return { loading, rounds: loading ? [] : state.rounds, error: loading ? '' : state.error };
};
