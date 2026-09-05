import { useEffect, useMemo, useState } from 'react';

// 학급/전시/방/작품을 옮긴 뒤 도착한 이전 응답은 표시하지 않는다. 실패 시 이전 전문을 지운다.
export default function useGalleryRead(key, read, enabled, refresh = 0, keepSummary = false) {
    const [state, setState] = useState({ key: null, data: null, loading: true, error: null });
    const request = useMemo(() => ({ key, read, enabled, refresh }), [key, read, enabled, refresh]);
    useEffect(() => {
        if (!enabled) return undefined;
        let active = true;
        read().then((data) => { if (active) setState({ key, request, data, loading: false, error: null }); })
            .catch((error) => { if (active) setState({ key, request, data: null, loading: false, error: error.message || '전시를 불러오지 못했어요. 다시 열어 주세요.' }); });
        return () => { active = false; };
    }, [key, read, enabled, request]);
    return state.request === request ? state : { key, data: keepSummary && state.key === key ? state.data : null, loading: enabled, error: null };
}
