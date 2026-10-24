import { useEffect, useState } from 'react';

/**
 * 책상에 앉은 수호룡 그림(GPT로 만든 40장, 2026-10-24 계획): `/assets/dragons/desk/{종류}/level-{단계}.webp`.
 * 그림이 아직 없는 종류는 서 있는 기본 그림 + 코드로 그린 책상으로 대신한다. 파일만 넣으면 코드 변경 없이 바뀐다:
 * 종류마다 한 장(`level-5`)을 한 번만 확인해, 있으면 그 종류의 앉은 그림을 쓴다.
 */
export const deskArtSrc = (speciesId, level) => `/assets/dragons/desk/${speciesId}/level-${level}.webp`;
export const CLASSROOM_BACKGROUND = '/assets/class-room/classroom-day.webp';

const probeCache = new Map();
const probe = (src) => {
    if (!probeCache.has(src)) {
        probeCache.set(src, new Promise((resolve) => {
            const image = new Image();
            image.onload = () => resolve(true);
            image.onerror = () => resolve(false);
            image.src = src;
        }));
    }
    return probeCache.get(src);
};

/** 종류별로 앉은 그림이 있는지(`{ star: true, ... }`). 처음엔 모두 false 라서 대체 그림으로 먼저 그려진다. */
export const useDeskArt = (speciesIds) => {
    const [available, setAvailable] = useState({});
    const key = [...new Set(speciesIds)].sort().join(',');
    useEffect(() => {
        let alive = true;
        const species = key ? key.split(',') : [];
        species.forEach((id) => {
            void probe(deskArtSrc(id, 5)).then((ok) => { if (alive) setAvailable((current) => (Reflect.get(current, id) === ok ? current : { ...current, [id]: ok })); });
        });
        return () => { alive = false; };
    }, [key]);
    const [classroomReady, setClassroomReady] = useState(false);
    useEffect(() => {
        let alive = true;
        void probe(CLASSROOM_BACKGROUND).then((ok) => { if (alive) setClassroomReady(ok); });
        return () => { alive = false; };
    }, []);
    return { available, classroomReady };
};
