/**
 * 우리반 아지트: 선생님이 확인한 보고서 사진을 책·전시용 복사본으로 고정한다(2026-10-20, 설계 docs/CLASS_AGIT_PHOTOS_PLAN.md 2b).
 *
 * 왜 Edge 함수인가: 복사본이 **원본과 똑같음**을 보장해야 한다. 브라우저가 올리게 하면 선생님이 다른 그림을 올릴 수 있다.
 * 이 함수는 파일을 서비스 권한으로 옮기기만 하고, **무엇을 옮길지는 DB 가 정한다**:
 *   1. 담당 교사 토큰으로 `claim_class_agit_photo_copy_v1` 을 부른다 — 학급 담당자 확인, 선생님이 사진을 보고 확인한(대기 중인) 사진만 돌려준다.
 *   2. 돌려받은 원본 경로 → 복사본 경로로 `report-images` → `class-agit-photos` 복사.
 *   3. 결과를 `finish_class_agit_photo_copy_v1`(서비스 전용)로 기록한다. 실패하면 failed 로 남아 다시 시도할 수 있다.
 * 요청 본문은 학급 ID 와 사진 ID 만 받고 경로는 받지 않는다(경로를 믿지 않는다).
 *
 * 배포는 `scripts/sync-edge-functions.sh` 가 폴더째 올린다 — 폴더 밖 파일을 import 하면 운영에서 죽는다.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '').split(',').map((v) => v.trim().replace(/\/$/, '')).filter(Boolean)
const SOURCE_BUCKET = 'report-images'
const COPY_BUCKET = 'class-agit-photos'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const MAX_PHOTOS_PER_REQUEST = 6
// 학급 ID 하나와 사진 ID 몇 개뿐인 요청이라 작게 막는다(크기를 보고 나서 읽는다).
const MAX_BODY_BYTES = 2048

const allowOrigin = (origin: string | null) => {
    if (!ALLOWED_ORIGINS.length) return '*'
    const normalized = (origin ?? '').replace(/\/$/, '')
    return normalized && (ALLOWED_ORIGINS.includes(normalized) || normalized.startsWith('http://localhost:')) ? normalized : 'null'
}

class HttpError extends Error {
    status: number
    constructor(status: number, message: string) {
        super(message)
        this.status = status
    }
}

type ClaimedPhoto = { id: string, source_path: string, copy_path: string, bytes: number }

Deno.serve(async (req) => {
    const headers = {
        'Access-Control-Allow-Origin': allowOrigin(req.headers.get('Origin')),
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        Vary: 'Origin'
    }
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
        status, headers: { ...headers, 'Content-Type': 'application/json' }
    })
    if (req.method === 'OPTIONS') return new Response('ok', { headers })
    if (req.method !== 'POST') return json({ success: false, message: '허용되지 않은 요청입니다.' }, 405)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ success: false, message: '로그인이 필요합니다.' }, 401)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    try {
        const declared = Number(req.headers.get('content-length') ?? 0)
        if (declared > MAX_BODY_BYTES) throw new HttpError(413, '요청이 너무 커요.')
        const raw = await req.text()
        if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, '요청이 너무 커요.')
        let body: Record<string, unknown> = {}
        try { body = JSON.parse(raw) } catch { body = {} }
        const classId = typeof body?.class_id === 'string' ? body.class_id : ''
        const photoIds: unknown = body?.photo_ids
        if (!UUID_PATTERN.test(classId) || !Array.isArray(photoIds) || photoIds.length < 1 || photoIds.length > MAX_PHOTOS_PER_REQUEST
            || photoIds.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))) {
            throw new HttpError(400, '요청 모양이 올바르지 않아요.')
        }

        // 무엇을 옮길지는 DB 가 정한다(담당 교사가 아니면 42501, 확인하지 않은 사진은 목록에 없다).
        const claim = await userClient.rpc('claim_class_agit_photo_copy_v1', { p_class_id: classId, p_photo_ids: photoIds })
        if (claim.error) {
            if (claim.error.code === '42501') throw new HttpError(403, '이 학급의 사진을 복사할 수 없어요.')
            if (claim.error.code === '22023') throw new HttpError(400, claim.error.message)
            throw new Error(`claim_failed:${claim.error.code}`)
        }
        const photos = (claim.data?.photos ?? []) as ClaimedPhoto[]

        const results: { id: string, ok: boolean }[] = []
        for (const photo of photos) {
            let ok = false
            try {
                // 선생님이 확인한 뒤 복사 전에 학생이 같은 경로의 파일을 바꿔 올렸으면 크기가 기록(올릴 때의 크기)과 달라진다 — 복사하지 않는다.
                const info = await admin.storage.from(SOURCE_BUCKET).info(photo.source_path)
                const size = Number((info.data as { size?: number } | null)?.size ?? 0)
                if (size > 0 && size !== photo.bytes) {
                    console.error('[class-agit-photo-copy] source changed after confirmation:', photo.id)
                    await admin.rpc('finish_class_agit_photo_copy_v1', { p_photo_id: photo.id, p_ok: false })
                    results.push({ id: photo.id, ok: false })
                    continue
                }
                const { error } = await admin.storage.from(SOURCE_BUCKET).copy(photo.source_path, photo.copy_path, { destinationBucket: COPY_BUCKET })
                // 복사본 경로는 사진마다 무작위라 이미 있으면 같은 원본에서 만든 것이다(이전 시도에서 파일만 옮기고 기록을 못 한 경우).
                ok = !error || /already exists|Duplicate/i.test(error.message)
                if (!ok) console.error('[class-agit-photo-copy] copy failed:', error?.message)
            } catch (error) {
                console.error('[class-agit-photo-copy] copy threw:', error instanceof Error ? error.message : error)
            }
            const { error: finishError } = await admin.rpc('finish_class_agit_photo_copy_v1', { p_photo_id: photo.id, p_ok: ok })
            if (finishError) {
                // 파일은 옮겼는데 기록을 못 했다 — 대기로 남아 다시 시도되면 같은 경로로 덮어쓰지 않고 실패로 끝나므로 로그만 남긴다.
                console.error('[class-agit-photo-copy] finish failed:', finishError.code)
                ok = false
            }
            results.push({ id: photo.id, ok })
        }
        return json({ success: true, results })
    } catch (error) {
        if (error instanceof HttpError) return json({ success: false, message: error.message }, error.status)
        console.error('[class-agit-photo-copy]', error instanceof Error ? error.message : error)
        return json({ success: false, message: '서버에서 문제가 생겼어요. 잠시 뒤 다시 해 주세요.' }, 500)
    }
})
