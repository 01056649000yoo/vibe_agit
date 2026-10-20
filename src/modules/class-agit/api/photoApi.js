import { supabase } from '../../../lib/supabaseClient.js';

/*
 * 보고서 사진(2026-10-20, 설계 docs/CLASS_AGIT_PHOTOS_PLAN.md 2b·2c).
 *   읽기: 사진ID → (서버가 권한을 보고 알려 주는) 복사본 경로 → 짧게 유효한 서명 주소. 버킷은 비공개다.
 *   확인·복사: 선생님이 사진을 보고 확인했다고 기록(RPC) → Edge 함수가 원본에서 복사본을 만든다.
 */
export const PHOTO_BUCKET = 'class-agit-photos';
/** 선생님이 보는 확인 문구의 판. 문구(`reportPhotoRules.js` 의 TEACHER_PHOTO_CHECK_STATEMENT)를 바꾸면 서버 판과 함께 올린다. */
export const PHOTO_STATEMENT_VERSION = 1;
const SIGNED_SECONDS = 60 * 60;
const PATH_CHUNK = 50;
const COPY_CHUNK = 6;
const cache = new Map();

const fresh = (entry) => entry && entry.expires > Date.now() + 60_000;

/** 사진ID 목록 → Map(사진ID → { url, path, width, height }). 읽을 수 없는 사진은 빠진다(조용히). */
export async function resolvePhotoUrls(photoIds) {
    const result = new Map();
    const need = [];
    for (const id of new Set(photoIds)) {
        const hit = cache.get(id);
        if (fresh(hit)) result.set(id, hit.info); else need.push(id);
    }
    for (let index = 0; index < need.length; index += PATH_CHUNK) {
        const chunk = need.slice(index, index + PATH_CHUNK);
        const { data, error } = await supabase.rpc('get_class_agit_photo_paths_v1', { p_photo_ids: chunk });
        if (error || !Array.isArray(data?.photos) || !data.photos.length) continue;
        const paths = data.photos.map((photo) => photo.path);
        const { data: signed, error: signError } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, SIGNED_SECONDS);
        if (signError || !Array.isArray(signed)) continue;
        for (const photo of data.photos) {
            const row = signed.find((item) => item.path === photo.path);
            if (!row?.signedUrl) continue;
            const info = { url: row.signedUrl, path: photo.path, width: photo.width, height: photo.height };
            cache.set(photo.id, { info, expires: Date.now() + SIGNED_SECONDS * 1000 });
            result.set(photo.id, info);
        }
    }
    return result;
}

/** 인쇄처럼 사진을 문서 안에 넣어야 할 때: 데이터 주소로(서명 주소는 인쇄 창에서 끊길 수 있다). 읽을 수 없으면 ''. */
export async function photoDataUrl(photoId) {
    const info = (await resolvePhotoUrls([photoId])).get(photoId);
    if (!info) return '';
    try {
        const { data: blob, error } = await supabase.storage.from(PHOTO_BUCKET).download(info.path);
        if (error || !blob) return '';
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    } catch { return ''; }
}

/** 선생님이 사진을 보고 확인했다고 기록하고 복사 대기 사진을 돌려받는다. 칸 번호는 정본이 알려 준 `photo_sections` 값이다. */
export async function confirmPhotoUse(classId, postId, sectionIds) {
    const { data, error } = await supabase.rpc('confirm_class_agit_photo_use_v1', {
        p_class_id: classId, p_post_id: postId, p_section_ids: sectionIds, p_statement_version: PHOTO_STATEMENT_VERSION
    });
    if (error) throw new Error(error.message || '사진 확인을 기록하지 못했어요.');
    return Array.isArray(data?.photos) ? data.photos : [];
}

/** 대기 중인 사진을 복사본으로 만든다(Edge 함수). 사진 6장씩 나눠 부르고, 성공한 사진ID 들을 돌려준다. */
export async function copyConfirmedPhotos(classId, photoIds) {
    const ok = [];
    for (let index = 0; index < photoIds.length; index += COPY_CHUNK) {
        const chunk = photoIds.slice(index, index + COPY_CHUNK);
        const { data, error } = await supabase.functions.invoke('class-agit-photo-copy', { body: { class_id: classId, photo_ids: chunk } });
        if (error || !data?.success || !Array.isArray(data.results)) continue;
        for (const row of data.results) if (row?.ok) ok.push(row.id);
    }
    return ok;
}

/**
 * 선생님이 확인할 보고서 사진(원본)을 불러온다. 담당 교사는 자기 학급 글의 원본 사진을 읽을 수 있다(저장소 정책).
 * 확인할 칸은 정본이 알려 준 `photo_sections` 만 보여 준다. 반환: Map(글ID → [{ sectionId, url, caption, width, height }]).
 */
export async function loadPhotosForReview(sources) {
    const wanted = new Map(sources.map((source) => [source.id, new Set(source.photo_sections || [])]));
    const { data, error } = await supabase.from('student_posts').select('id, structured_content').in('id', [...wanted.keys()]);
    if (error) throw new Error('확인할 사진을 불러오지 못했어요. 잠시 뒤 다시 해 주세요.');
    const { getReportImageUrls } = await import('../../writing/mission-types/report/reportImageApi.js');
    const found = new Map();
    const paths = [];
    for (const row of data || []) {
        const sections = Array.isArray(row.structured_content?.sections) ? row.structured_content.sections : [];
        const list = [];
        sections.forEach((section, index) => {
            const sectionId = String(section?.id || '').trim() || `section-${index + 1}`;
            const path = section?.image?.path;
            if (!path || !wanted.get(row.id)?.has(sectionId)) return;
            list.push({ sectionId, path, caption: section.image.caption || '', width: section.image.width, height: section.image.height });
            paths.push(path);
        });
        found.set(row.id, list);
    }
    const urls = paths.length ? await getReportImageUrls(paths) : new Map();
    const result = new Map();
    for (const [postId, list] of found) {
        result.set(postId, list.map(({ path, ...item }) => ({ ...item, url: urls.get(path) || '' })));
    }
    return result;
}
