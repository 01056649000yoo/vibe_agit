import { useContext, useEffect, useMemo, useState } from 'react';
import { isPhotoBlock, photoCaptionOf, photoIdOfBlock, photoIdsOfBlocks } from '../photoBlocks.js';
import { PhotoResolverContext } from '../photoContext.js';

/**
 * 작품 본문을 문단별로 그린다(2026-10-20). 글 문단은 `<p>`, 사진 자리표는 그 자리에 사진 한 장.
 * 사진은 서버가 읽어도 된다고 한 것만 보인다 — 읽을 수 없거나(아직 불러오는 중·외부 공유 방문자) 실패하면 자리를 비운다(글만 읽힌다).
 */
export default function WorkBlocks({ blocks }) {
    const list = useMemo(() => (Array.isArray(blocks) ? blocks : []), [blocks]);
    const ids = useMemo(() => photoIdsOfBlocks(list), [list]);
    const resolvePhotos = useContext(PhotoResolverContext);
    const [photos, setPhotos] = useState(() => new Map());
    useEffect(() => {
        if (!ids.length || !resolvePhotos) return undefined;
        let alive = true;
        resolvePhotos(ids).then((map) => { if (alive) setPhotos(map); }).catch(() => {});
        return () => { alive = false; };
    }, [ids, resolvePhotos]);
    return list.map((block, index) => {
        // 조각 순서는 작품마다 고정이라 순번 키로 충분하다.
        if (!isPhotoBlock(block)) {
            // 사진 바로 뒤의 `▲ 설명` 줄은 사진 아래 설명으로 붙였으므로 따로 그리지 않는다.
            return isPhotoBlock(list[index - 1]) && photoCaptionOf(block) && photos.has(photoIdOfBlock(list[index - 1])) ? null : <p key={index}>{block}</p>;
        }
        const info = photos.get(photoIdOfBlock(block));
        const caption = photoCaptionOf(list[index + 1]);
        return info
            ? (
                <figure className="class-agit-reader__photo" key={index}>
                    <img src={info.url} width={info.width} height={info.height} alt={caption || '보고서 사진'} loading="lazy" decoding="async" />
                    {caption && <figcaption>{caption}</figcaption>}
                </figure>
            )
            : null;
    });
}
