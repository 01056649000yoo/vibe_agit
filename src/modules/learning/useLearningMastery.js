import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

/**
 * 학습 성취 조회. 보는 사람에 따라 **서버 RPC 자체가 다르다**(A안).
 *   · 'me'       — 본인. 진행도까지 온다.
 *   · 'classmate'— 같은 반 친구. 완성된 것만 오고 진행도는 응답에 없다.
 *   · 'teacher'  — 담당 학급 학생. 진행도까지 온다.
 * 공개 범위를 화면에서 가리지 않고 서버가 가르는 이유는, 화면에서 거르면 개발자 도구로 보이기 때문이다.
 *
 * 성능 계약: 홈에는 붙이지 않는다. 나의 아지트·친구 아지트를 **열 때만** 한 번 부른다.
 */
// 보는 사람을 키로 객체를 인덱싱하면 보안 린트가 잡는다. 값이 셋뿐이라 분기로 고정한다.
const rpcFor = (viewer) => {
    if (viewer === 'me') return 'get_my_learning_mastery_v1';
    if (viewer === 'classmate') return 'get_classmate_learning_mastery_v1';
    if (viewer === 'teacher') return 'get_student_learning_mastery_v1';
    return null;
};

const useLearningMastery = ({ viewer = 'me', studentId = null, active = true }) => {
    const [contents, setContents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const load = useCallback(async () => {
        const rpc = rpcFor(viewer);
        if (!rpc) return;
        if (viewer !== 'me' && !studentId) return;

        setLoading(true);
        setErrorMessage('');
        const { data, error } = await supabase.rpc(
            rpc,
            viewer === 'me' ? {} : { p_student_id: studentId }
        );
        setLoading(false);

        if (error) {
            console.error('학습 성취 조회 실패:', error.message);
            setErrorMessage('성취를 불러오지 못했어요.');
            setContents([]);
            return;
        }
        setContents(Array.isArray(data?.contents) ? data.contents : []);
    }, [viewer, studentId]);

    // 효과 본문에서 곧장 setState 하면 연쇄 렌더가 된다(hooks 린트). 저장소의
    // useMyTitleStatus 와 같은 방식으로 한 틱 뒤에 부른다.
    useEffect(() => {
        if (!active) return undefined;
        const timerId = window.setTimeout(() => { void load(); }, 0);
        return () => window.clearTimeout(timerId);
    }, [active, load]);

    return { contents, loading, errorMessage, reload: load };
};

export default useLearningMastery;
