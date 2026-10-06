import { useEffect, useState } from 'react';
import { coverSource } from './coverImage.js';
import { coverImageUrl } from '../api/coverImageApi.js';

/*
 * 그림 표지(2026-10-06): 표지 칸을 올린 그림으로 꽉 채운다. 표지를 그리는 모든 곳이 이 부품을 쓴다
 * (선생님 화면·학생 서가·모두의 아지트 도서관). 칸 안의 제목 글자는 지우지 않고 눈에만 숨겨
 * 화면 읽기 프로그램이 읽게 둔다(`[data-cover-image]` CSS).
 */
export function useCoverImageUrl(book) {
    const source = coverSource(book);
    const path = source.kind === 'image' ? source.path : '';
    const [state, setState] = useState({ path: '', url: '' });
    useEffect(() => {
        if (!path) return undefined;
        let active = true;
        coverImageUrl(path).then((url) => { if (active) setState({ path, url }); });
        return () => { active = false; };
    }, [path]);
    return state.path === path ? state.url : '';
}

/** 표지 칸 안에 넣는다. 그림 표지가 아니면 아무것도 그리지 않는다. */
export default function CoverImageFill({ book }) {
    const url = useCoverImageUrl(book);
    if (coverSource(book).kind !== 'image') return null;
    return <span className="class-agit-cover-image" aria-hidden="true">{url ? <img src={url} alt="" loading="lazy" decoding="async" /> : null}</span>;
}

/** 표지 칸에 붙일 속성: 그림 표지면 `data-cover-image` 로 글자를 숨긴다. */
export const coverImageProps = (book) => (coverSource(book).kind === 'image' ? { 'data-cover-image': '' } : {});
