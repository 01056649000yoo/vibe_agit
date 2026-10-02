/**
 * 수호룡의 인형뽑기 서버 (2026-10-02, 학생에게 열기 위한 2단계).
 *
 * 학생 화면이 부르는 일 세 가지 — 정답과 상품은 이 함수와 DB 만 안다:
 *   quiz-start   문제 10개를 만들어(spellingQuizBuilder.js — 화면 미리보기와 같은 원본) DB 에 정답째 두고 정답 없는 문제만 보낸다.
 *   quiz-answer  한 문제씩 채점해 결과·풀이를 돌려준다. 마지막 문제에서 목표를 넘으면 DB 가 코인 1개를 준다.
 *   play-finish  한 판이 끝나 잡은 인형을 받으면 prizeTable.js 로 상품을 뽑고 DB 가 같은 트랜잭션에서 지급·알림.
 * 코인 넣기·오늘 상태는 화면이 RPC 로 바로 부른다(`start_my_spelling_claw_play_v1`·`get_my_spelling_claw_context_v1`).
 *
 * 이 폴더의 prizeTable.js·spellingQuizBuilder.js·plushCatalog.js 가 **원본**이다(앱은 다시 내보내기만 한다).
 * 배포는 `scripts/sync-edge-functions.sh` 가 폴더째 올린다 — 폴더 밖 파일을 import 하면 운영에서 죽는다.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
    CLAW_MAX_PRIZES_PER_PLAY,
    clawDecorFromCatalogRows,
    eligibleClawDecor,
    normalizeClawClassSettings,
    normalizeClawPrizeSettings,
    rollClawPrize
} from './prizeTable.js'
import {
    SPELLING_QUIZ_LEVELS,
    buildSpellingQuizPool,
    createSpellingQuiz,
    gradeSpellingAnswer,
    publicQuizQuestion,
    spellingSourcesFromCatalog,
    spellingSourcesFromLearningEntries
} from './spellingQuizBuilder.js'
import { CLAW_PLUSHES } from './plushCatalog.js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '').split(',').map((v) => v.trim().replace(/\/$/, '')).filter(Boolean)
// 학생 태블릿이 받는 것과 같은 맞춤법 사전을 서비스 주소에서 읽는다(사본을 두면 배포 시점이 어긋난다). 주간 검수 함수와 같은 규칙.
const CATALOG_ORIGIN = (Deno.env.get('SPELLING_CATALOG_ORIGIN') ?? ALLOWED_ORIGINS[0] ?? '').replace(/\/$/, '')
const QUIZ_COUNT = 10
const BASE_CACHE_MS = 10 * 60 * 1000

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

// 기본 사전 재료는 작업자마다 10분 동안 기억한다(문제를 낼 때마다 500개 사전을 다시 받지 않게).
let baseSourcesCache: { at: number, sources: unknown[] } | null = null
const loadBaseSources = async () => {
    if (baseSourcesCache && Date.now() - baseSourcesCache.at < BASE_CACHE_MS) return baseSourcesCache.sources
    if (!CATALOG_ORIGIN) throw new Error('catalog_origin_missing')
    const [lookup, detection] = await Promise.all([
        fetch(`${CATALOG_ORIGIN}/spelling/elementary-lookup-v1.json`, { signal: AbortSignal.timeout(10_000) }),
        fetch(`${CATALOG_ORIGIN}/spelling/elementary-detection-v1.json`, { signal: AbortSignal.timeout(10_000) })
    ])
    if (!lookup.ok || !detection.ok) throw new Error('catalog_fetch_failed')
    const sources = spellingSourcesFromCatalog(await lookup.json(), await detection.json())
    baseSourcesCache = { at: Date.now(), sources }
    return sources
}

const rpcOrThrow = async (client: ReturnType<typeof createClient>, name: string, args: Record<string, unknown> = {}) => {
    const { data, error } = await client.rpc(name, args)
    if (error) {
        const status = error.code === '42501' ? 403 : ['P0001', 'P0002', '22023', '40001'].includes(error.code ?? '') ? 409 : 500
        throw new HttpError(status, status === 500 ? '서버에서 문제가 생겼어요. 잠시 뒤 다시 해 주세요.' : error.message)
    }
    return data
}

/** 학생 토큰으로 오늘 상태를 읽는다 — 학생 확인·학급 켜짐·단계·보유 아이템·설정이 한 번에 온다. */
const loadContext = async (userClient: ReturnType<typeof createClient>) => {
    const context = await rpcOrThrow(userClient, 'get_my_spelling_claw_context_v1')
    if (!context?.enabled) throw new HttpError(403, '선생님이 인형뽑기를 아직 열지 않았어요.')
    return context
}

const quizStart = async (userClient: ReturnType<typeof createClient>, admin: ReturnType<typeof createClient>) => {
    const context = await loadContext(userClient)
    const settings = normalizeClawClassSettings(context.settings)
    const { data: learningRows, error } = await admin
        .from('spelling_learning_entries')
        .select('id, scope, class_id, status, wrong_expression, correct_expression, label, explanation, examples')
        .eq('status', 'approved')
        .or(`scope.eq.common,and(scope.eq.class,class_id.eq.${context.class_id})`)
        .limit(2000)
    if (error) throw new Error(`learning_entries_failed:${error.message}`)
    const rows = learningRows ?? []
    const pool = buildSpellingQuizPool([
        ...spellingSourcesFromLearningEntries(rows.filter((row) => row.scope === 'class'), 'class'),
        ...spellingSourcesFromLearningEntries(rows.filter((row) => row.scope === 'common'), 'common'),
        ...(await loadBaseSources())
    ])
    const writeCount = Reflect.get(SPELLING_QUIZ_LEVELS, settings.quizLevel)?.writeCount ?? 4
    const quiz = createSpellingQuiz(pool, { count: QUIZ_COUNT, writeCount })
    if (quiz.length < QUIZ_COUNT) throw new Error('quiz_pool_too_small')
    const attemptId = await rpcOrThrow(admin, 'spelling_claw_issue_quiz_v1', {
        p_student_id: context.student_id, p_questions: quiz, p_pass_count: settings.passCount
    })
    return { attemptId, passCount: settings.passCount, questions: quiz.map(publicQuizQuestion) }
}

const quizAnswer = async (
    userClient: ReturnType<typeof createClient>,
    admin: ReturnType<typeof createClient>,
    body: Record<string, unknown>
) => {
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) throw new HttpError(401, '인증 정보를 확인할 수 없어요.')
    const attemptId = typeof body.attemptId === 'string' ? body.attemptId : ''
    const index = Number(body.index)
    const given = typeof body.answer === 'string' ? body.answer.slice(0, 200) : ''
    if (!/^[0-9a-f-]{36}$/.test(attemptId) || !Number.isInteger(index) || index < 0 || index >= 20) {
        throw new HttpError(400, '답 모양이 올바르지 않아요.')
    }
    const { data: student } = await admin.from('students').select('id, class_id').eq('auth_id', user.id)
        .is('deleted_at', null).maybeSingle()
    if (!student) throw new HttpError(403, '학생 인증이 필요해요.')
    const { data: attempt } = await admin.from('spelling_claw_quiz_attempts').select('id, questions')
        .eq('id', attemptId).eq('student_id', student.id).maybeSingle()
    if (!attempt) throw new HttpError(409, '문제를 찾을 수 없어요. 새 문제를 받아 주세요.')
    const question = Array.isArray(attempt.questions) ? attempt.questions.at(index) : null
    if (!question) throw new HttpError(400, '문제 번호가 올바르지 않아요.')

    const { data: classSettings } = await admin.from('spelling_claw_class_settings').select('settings')
        .eq('class_id', student.class_id).maybeSingle()
    const settings = normalizeClawClassSettings(classSettings?.settings)
    const graded = gradeSpellingAnswer(question, given)
    const result = await rpcOrThrow(admin, 'spelling_claw_answer_v1', {
        p_attempt_id: attemptId, p_student_id: student.id, p_index: index, p_given: given,
        p_correct: graded.correct, p_daily_plays: settings.dailyPlays
    })
    // 다시 보낸 답이면 처음 채점을 따른다(DB 가 기억한 값).
    const correct = Boolean(result.correct)
    return {
        correct,
        nearMiss: !correct && !result.repeat && graded.nearMiss,
        answer: question.answer,
        solution: question.solution,
        explanation: question.explanation,
        answered: result.answered,
        correctCount: result.correct_count,
        finished: result.finished,
        passed: result.passed,
        coinGranted: Boolean(result.coin_granted),
        coinsGranted: Number(result.coins_granted) || 0,
        perfect: Boolean(result.perfect),
        rewardedQuizzes: Number(result.rewarded_quizzes) || 0,
        coinsLeft: result.coins_left,
        coinsEarned: result.coins_earned
    }
}

const playFinish = async (
    userClient: ReturnType<typeof createClient>,
    admin: ReturnType<typeof createClient>,
    body: Record<string, unknown>
) => {
    const context = await loadContext(userClient)
    const playId = typeof body.playId === 'string' ? body.playId : ''
    if (!/^[0-9a-f-]{36}$/.test(playId)) throw new HttpError(400, '판 번호가 올바르지 않아요.')
    // 화면이 보낸 인형은 아는 인형만, 한 판에 8개까지 기록하고 상품은 CLAW_MAX_PRIZES_PER_PLAY 개까지.
    const caught = (Array.isArray(body.caught) ? body.caught : [])
        .filter((id): id is string => typeof id === 'string' && CLAW_PLUSHES.some((plush) => plush.id === id))
        .slice(0, 8)
    const settings = normalizeClawClassSettings(context.settings)
    const prizeSettings = normalizeClawPrizeSettings(context.prize_settings ?? undefined)
    const owned = Array.isArray(context.owned) ? [...context.owned] : []
    const prizes = []
    for (const plushId of caught.slice(0, CLAW_MAX_PRIZES_PER_PLAY)) {
        const eligibleDecor = eligibleClawDecor(clawDecorFromCatalogRows(context.catalog), {
            writerLevel: context.writer_level, readerLevel: context.reader_level, owned
        })
        const rolled = rollClawPrize({ settings: prizeSettings, eligibleDecor })
        const plushName = CLAW_PLUSHES.find((plush) => plush.id === plushId)?.name ?? '인형'
        if (rolled.kind === 'decor') {
            owned.push(rolled.item.id)
            prizes.push({ kind: 'decor', item_id: rolled.item.id, plush_id: plushId, plush_name: plushName })
        } else if (rolled.kind === 'gift') {
            prizes.push({ kind: 'gift', gift_id: rolled.gift.id, gift_name: rolled.gift.name, plush_id: plushId, plush_name: plushName })
        } else {
            prizes.push({ kind: 'points', points: rolled.points, plush_id: plushId, plush_name: plushName })
        }
    }
    const result = await rpcOrThrow(admin, 'spelling_claw_finish_play_v1', {
        p_play_id: playId, p_student_id: context.student_id, p_caught: caught, p_prizes: prizes,
        p_writer_level: context.writer_level, p_reader_level: context.reader_level,
        p_daily_plays: settings.dailyPlays, p_min_points: settings.minPoints, p_announce_gifts: settings.announceGifts
    })
    return {
        prizes: result.prizes ?? [],
        consolationPoints: result.consolation_points ?? 0,
        totalPoints: result.total_points ?? null
    }
}

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
        const body = await req.json().catch(() => ({}))
        const action = typeof body?.action === 'string' ? body.action : ''
        if (action === 'quiz-start') return json({ success: true, ...(await quizStart(userClient, admin)) })
        if (action === 'quiz-answer') return json({ success: true, ...(await quizAnswer(userClient, admin, body)) })
        if (action === 'play-finish') return json({ success: true, ...(await playFinish(userClient, admin, body)) })
        return json({ success: false, message: '알 수 없는 요청입니다.' }, 400)
    } catch (error) {
        if (error instanceof HttpError) return json({ success: false, message: error.message }, error.status)
        console.error('[spelling-claw]', error instanceof Error ? error.message : error)
        return json({ success: false, message: '서버에서 문제가 생겼어요. 잠시 뒤 다시 해 주세요.' }, 500)
    }
})
