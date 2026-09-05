import { useEffect, useState } from 'react';
// One scheduled deadline plus resume checks. No network polling or permanent connection.
export default function useExhibitionExpiry(data) {
    const [expiredData, setExpiredData] = useState(null);
    useEffect(() => {
        if (!data?.expires_at || !data?.server_now) return undefined;
        const remaining = Date.parse(data.expires_at) - Date.parse(data.server_now);
        const wallStart = Date.now(); const clockStart = performance.now();
        let timer;
        const check = () => {
            clearTimeout(timer);
            const elapsed = Math.max(Date.now() - wallStart, performance.now() - clockStart);
            if (elapsed >= remaining) setExpiredData(data);
            else timer = setTimeout(check, Math.min(remaining - elapsed, 2147483647));
        };
        check();
        window.addEventListener('pageshow', check);
        document.addEventListener('visibilitychange', check);
        return () => { clearTimeout(timer); window.removeEventListener('pageshow', check); document.removeEventListener('visibilitychange', check); };
    }, [data]);
    return Boolean(data && expiredData === data);
}
