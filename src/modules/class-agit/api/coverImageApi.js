import { supabase } from '../../../lib/supabaseClient.js';
import { COVER_BUCKET, coverObjectPath } from '../anthology/coverImage.js';

/*
 * 표지 그림 올리기·보여 주기(2026-10-06). 버킷은 비공개라 볼 때마다 짧은 서명 주소를 받는다.
 * 같은 그림을 여러 칸(서가 여러 권 등)이 보면 한 번만 받도록 잠깐 기억한다.
 */
const SIGNED_SECONDS = 60 * 60;
const cache = new Map();

/** 그림 픽셀 크기 읽기(검사용). */
export function readImageSize(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('그림을 읽지 못했어요.')); };
        img.src = url;
    });
}

export async function uploadCoverImage(classId, bookId, file) {
    const path = coverObjectPath(classId, bookId, file.type);
    const { error } = await supabase.storage.from(COVER_BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' });
    if (error) throw new Error('표지 그림을 올리지 못했어요. 잠시 뒤 다시 해 주세요.');
    return path;
}

export async function coverImageUrl(path) {
    if (!path) return '';
    const hit = cache.get(path);
    if (hit && hit.expires > Date.now() + 60_000) return hit.url;
    const { data, error } = await supabase.storage.from(COVER_BUCKET).createSignedUrl(path, SIGNED_SECONDS);
    if (error || !data?.signedUrl) return '';
    cache.set(path, { url: data.signedUrl, expires: Date.now() + SIGNED_SECONDS * 1000 });
    return data.signedUrl;
}

/** 인쇄처럼 그림을 문서 안에 넣어야 할 때: 데이터 주소로(저장소에서 바로 내려받는다). */
export async function coverImageDataUrl(path) {
    if (!path) return '';
    const { data: blob, error } = await supabase.storage.from(COVER_BUCKET).download(path);
    if (error || !blob) return '';
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
    });
}

/**
 * 문집을 지운 직후 그 문집의 표지 그림을 모두 지운다(2026-10-06 선생님 결정: 문집이 있는 동안만 보관).
 * 실패해도 문집 삭제는 그대로 — 매주 정리(scripts/class-agit-cover-sweep.mjs)가 남은 것을 지운다.
 */
export async function removeBookCovers(classId, bookId) {
    const folder = `${classId}/${bookId}`;
    const { data, error } = await supabase.storage.from(COVER_BUCKET).list(folder, { limit: 1000 });
    if (error || !data?.length) return 0;
    const paths = data.filter((item) => item.name).map((item) => `${folder}/${item.name}`);
    if (!paths.length) return 0;
    const { error: removeError } = await supabase.storage.from(COVER_BUCKET).remove(paths);
    return removeError ? 0 : paths.length;
}
