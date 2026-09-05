import { useEffect, useRef, useState } from 'react';

// Each filter remembers its cursor path. Only the current request may update the view.
export default function useBrowsePage(api, method, classId, filters) {
    const filterKey = JSON.stringify(filters);
    const [positions, setPositions] = useState({});
    const position = Reflect.get(positions, filterKey) || { cursors: [null], index: 0 };
    const cursor = position.cursors.at(position.index);
    const [retry, setRetry] = useState(0);
    const [result, setResult] = useState(null);
    const serial = useRef(0);
    const requestKey = JSON.stringify([classId, filterKey, cursor, retry]);
    useEffect(() => {
        const ticket = ++serial.current;
        const parsed = JSON.parse(filterKey);
        Reflect.get(api, method)(classId, { ...parsed, cursor }).then((page) => {
            if (serial.current === ticket) setResult({ key: requestKey, page });
        }).catch((error) => { if (serial.current === ticket) setResult({ key: requestKey, error: error.message }); });
        return () => { serial.current += 1; };
    }, [api, method, classId, filterKey, cursor, requestKey]);
    const current = result?.key === requestKey ? result : null;
    const move = (next) => setPositions((previous) => ({ ...previous, [filterKey]: next }));
    return { page: current?.page, error: current?.error, loading: !current, index: position.index,
        reload: () => setRetry((value) => value + 1),
        previous: () => move({ ...position, index: Math.max(0, position.index - 1) }),
        next: () => { if (current?.page?.has_more) move({ cursors: [...position.cursors.slice(0, position.index + 1), current.page.next_cursor], index: position.index + 1 }); },
    };
}
