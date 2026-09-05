import { useEffect, useState } from 'react';
import PublicGallery from './PublicGallery.jsx';

export default function PublicClassAgitEntry() {
    const [token, setToken] = useState(() => window.location.hash.slice(1));
    useEffect(() => {
        document.title = '우리들의 글 전시';
        const tags = [['robots', 'noindex, nofollow, noarchive'], ['referrer', 'no-referrer']].map(([name, content]) => {
            const existing = document.head.querySelector(`meta[name="${name}"]`);
            const element = existing || document.createElement('meta'); const previous = element.content;
            element.name = name; element.content = content; if (!existing) document.head.append(element);
            return { element, previous, existing: Boolean(existing) };
        });
        const changed = () => setToken(window.location.hash.slice(1));
        window.addEventListener('hashchange', changed);
        return () => { tags.forEach(({ element, existing, previous }) => { if (existing) element.content = previous; else element.remove(); }); window.removeEventListener('hashchange', changed); };
    }, []);
    return <PublicGallery key={token} token={token} />;
}
