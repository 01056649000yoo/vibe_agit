import { useEffect, useState } from 'react';

/**
 * 책상에 앉은 수호룡 그림(GPT로 만든 40장, 2026-10-24 계획): `/assets/dragons/desk/{종류}/level-{단계}.webp`.
 * 그림을 못 불러오면(파일 없음·네트워크) 서 있는 기본 그림 + 코드로 그린 책상으로 대신한다.
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

/** 교실 배경 사진이 있는지. 책상 그림은 확인 없이 바로 그리고 못 불러오면 그 자리에서 대체 그림을 쓴다. */
export const useDeskArt = () => {
    const [classroomReady, setClassroomReady] = useState(false);
    useEffect(() => {
        let alive = true;
        void probe(CLASSROOM_BACKGROUND).then((ok) => { if (alive) setClassroomReady(ok); });
        return () => { alive = false; };
    }, []);
    return { classroomReady };
};
