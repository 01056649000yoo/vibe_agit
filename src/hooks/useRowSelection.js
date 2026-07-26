import { useCallback, useEffect, useState } from 'react';

/**
 * 표에서 여러 줄을 체크박스로 고르는 상태.
 * 목록이 새로 로드되면(필터·새로고침) 사라진 항목은 선택에서 자동으로 빠진다.
 */
const useRowSelection = (availableIds = []) => {
    const [selectedIds, setSelectedIds] = useState([]);

    const availableKey = availableIds.join(',');
    useEffect(() => {
        setSelectedIds(prev => prev.filter(id => availableIds.includes(id)));
        // availableIds 배열은 매 렌더 새로 만들어지므로 내용 기반 키로 비교한다
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [availableKey]);

    const toggle = useCallback((id) => {
        setSelectedIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
    }, []);

    const toggleAll = useCallback((shouldSelectAll) => {
        setSelectedIds(shouldSelectAll ? [...availableIds] : []);
    }, [availableIds]);

    const clear = useCallback(() => setSelectedIds([]), []);

    return { selectedIds, toggle, toggleAll, clear };
};

export default useRowSelection;
