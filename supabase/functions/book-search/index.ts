import { createClient } from 'jsr:@supabase/supabase-js@2'
import { fetchGoogleBooksPageCount, normalizeGoogleBooksIsbn } from './googleBooks.js'
import { fetchSeojiPageCount } from './nlSeoji.js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const KAKAO_REST_API_KEY = Deno.env.get('KAKAO_REST_API_KEY') ?? ''
const GOOGLE_BOOKS_API_KEY = Deno.env.get('GOOGLE_BOOKS_API_KEY') ?? ''
const NL_SEOJI_API_KEY = Deno.env.get('NL_SEOJI_API_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)

const lastRequestByUser = new Map<string, number>()
const lastGoogleRequestByUser = new Map<string, number>()
const MIN_REQUEST_INTERVAL_MS = 700
const MIN_GOOGLE_REQUEST_INTERVAL_MS = 400
const PAGE_CACHE_MS = 24 * 60 * 60 * 1000
const pageCache = new Map<string, { pageCount: number | null, source: string | null, expiresAt: number }>()
const PAGE_LOOKUP_TIMEOUT_MS = 5500

function isAllowedOrigin(origin: string | null) {
    if (!origin) return true
    const cleanOrigin = origin.replace(/\/$/, '')
    return ALLOWED_ORIGINS.length === 0
        || ALLOWED_ORIGINS.includes(cleanOrigin)
        || cleanOrigin.startsWith('http://localhost:')
        || cleanOrigin.startsWith('http://127.0.0.1:')
}

function corsHeaders(origin: string | null) {
    return {
        'Access-Control-Allow-Origin': origin && isAllowedOrigin(origin) ? origin : (ALLOWED_ORIGINS.length ? 'null' : '*'),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-customer-auth',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    }
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' }
    })
}

function cleanText(value: unknown, maxLength = 300) {
    return String(value ?? '')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength)
}

function parseIsbn(rawValue: unknown) {
    const values = String(rawValue ?? '')
        .split(/\s+/)
        .map((value) => value.replace(/[^0-9X]/gi, '').toUpperCase())
        .filter(Boolean)
    return {
        isbn10: values.find((value) => value.length === 10) ?? '',
        isbn13: values.find((value) => value.length === 13) ?? ''
    }
}

function isPageCountConfigured() {
    return Boolean(GOOGLE_BOOKS_API_KEY || NL_SEOJI_API_KEY)
}

/**
 * 쪽수는 구글 북스를 먼저 묻고, 없으면 국립중앙도서관 서지정보에 묻는다.
 * 국내 아동도서는 구글에 쪽수가 비어 있는 일이 잦아 그 자리를 도서관 납본 서지가 메운다.
 */
async function lookupPageCount(isbnValue: unknown) {
    const isbn = normalizeGoogleBooksIsbn(isbnValue)
    if (!isbn || !isPageCountConfigured()) return { pageCount: null, source: null }

    const cached = pageCache.get(isbn)
    if (cached && cached.expiresAt > Date.now()) {
        return { pageCount: cached.pageCount, source: cached.source }
    }

    const providers: Array<{ source: string, run: (signal: AbortSignal) => Promise<number | null> }> = []
    if (GOOGLE_BOOKS_API_KEY) {
        providers.push({
            source: 'google',
            run: (signal) => fetchGoogleBooksPageCount({ isbn, apiKey: GOOGLE_BOOKS_API_KEY, signal })
        })
    }
    if (NL_SEOJI_API_KEY) {
        providers.push({
            source: 'nl',
            run: (signal) => fetchSeojiPageCount({ isbn, certKey: NL_SEOJI_API_KEY, signal })
        })
    }

    for (const provider of providers) {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), PAGE_LOOKUP_TIMEOUT_MS)
        try {
            const pageCount = await provider.run(controller.signal)
            if (pageCount) {
                pageCache.set(isbn, { pageCount, source: provider.source, expiresAt: Date.now() + PAGE_CACHE_MS })
                return { pageCount, source: provider.source }
            }
        } catch (error) {
            if (!(error instanceof DOMException && error.name === 'AbortError')) {
                console.error(`Page count lookup failed: ${provider.source}`)
            }
        } finally {
            clearTimeout(timeoutId)
        }
    }

    pageCache.set(isbn, { pageCount: null, source: null, expiresAt: Date.now() + PAGE_CACHE_MS })
    return { pageCount: null, source: null }
}

Deno.serve(async (req) => {
    const origin = req.headers.get('Origin')
    const headers = corsHeaders(origin)

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers })
    }
    if (req.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405, headers)
    }
    if (!isAllowedOrigin(origin)) {
        return jsonResponse({ error: 'Forbidden origin' }, 403, headers)
    }

    const customerAuth = req.headers.get('X-Customer-Auth')
    const authHeader = customerAuth
        ? (customerAuth.startsWith('Bearer ') ? customerAuth : `Bearer ${customerAuth}`)
        : req.headers.get('Authorization')

    if (!authHeader) {
        return jsonResponse({ error: '학생 인증이 필요합니다.' }, 401, headers)
    }

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: userError } = await client.auth.getUser()
    if (userError || !user) {
        return jsonResponse({ error: '학생 인증이 만료되었습니다.' }, 401, headers)
    }

    const { data: student, error: studentError } = await client
        .from('students')
        .select('id')
        .eq('auth_id', user.id)
        .maybeSingle()
    if (studentError || !student) {
        return jsonResponse({ error: '학생 계정에서만 책을 검색할 수 있습니다.' }, 403, headers)
    }

    let body: { query?: string, isbn10?: string, isbn13?: string, bookId?: string }
    try {
        body = await req.json()
    } catch {
        return jsonResponse({ error: '검색 요청이 올바르지 않습니다.' }, 400, headers)
    }

    if (body.bookId) {
        if (!SUPABASE_SERVICE_ROLE_KEY) {
            return jsonResponse({ error: '페이지 저장 기능이 준비되지 않았습니다.' }, 503, headers)
        }

        const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        const { data: libraryItem, error: libraryError } = await adminClient
            .from('student_library_items')
            .select('book_id')
            .eq('student_id', student.id)
            .eq('book_id', body.bookId)
            .limit(1)
            .maybeSingle()
        if (libraryError || !libraryItem) {
            return jsonResponse({ error: '내 책장에서 페이지를 확인할 책을 찾지 못했습니다.' }, 403, headers)
        }

        const { data: storedBook, error: bookError } = await adminClient
            .from('book_catalog')
            .select('id,isbn10,isbn13,page_count,page_count_source')
            .eq('id', libraryItem.book_id)
            .maybeSingle()
        if (bookError || !storedBook) {
            return jsonResponse({ error: '책 정보를 찾지 못했습니다.' }, 404, headers)
        }
        if (storedBook.page_count_source === 'teacher' && storedBook.page_count) {
            return jsonResponse({ pageCount: storedBook.page_count, pageCountSource: 'teacher' }, 200, headers)
        }

        const requestedIsbn = normalizeGoogleBooksIsbn(storedBook.isbn13 || storedBook.isbn10)
        const { pageCount, source } = await lookupPageCount(requestedIsbn)
        if (!pageCount || !source) {
            return jsonResponse({ pageCount: null, pageCountSource: null }, 200, headers)
        }

        const { data: updatedBook, error: updateError } = await adminClient
            .from('book_catalog')
            .update({
                page_count: pageCount,
                page_count_source: source,
                page_count_updated_at: new Date().toISOString()
            })
            .eq('id', storedBook.id)
            .or('page_count_source.is.null,page_count_source.eq.google,page_count_source.eq.nl')
            .select('page_count,page_count_source')
            .maybeSingle()
        if (updateError) {
            console.error('Google Books page count save failed')
            return jsonResponse({ error: '페이지 정보를 저장하지 못했습니다.' }, 500, headers)
        }
        return jsonResponse({
            pageCount: updatedBook?.page_count ?? storedBook.page_count ?? pageCount,
            pageCountSource: updatedBook?.page_count_source ?? storedBook.page_count_source ?? source
        }, 200, headers)
    }

    const requestedIsbn = normalizeGoogleBooksIsbn(body.isbn13 || body.isbn10)
    if (requestedIsbn) {
        const now = Date.now()
        const lastGoogleRequestAt = lastGoogleRequestByUser.get(user.id) ?? 0
        if (now - lastGoogleRequestAt < MIN_GOOGLE_REQUEST_INTERVAL_MS) {
            return jsonResponse({ error: '책을 천천히 선택해 주세요.' }, 429, headers)
        }
        lastGoogleRequestByUser.set(user.id, now)
        const { pageCount, source } = await lookupPageCount(requestedIsbn)
        return jsonResponse({
            pageCount,
            pageCountSource: pageCount ? source : null,
            configured: isPageCountConfigured()
        }, 200, headers)
    }

    if (!KAKAO_REST_API_KEY) {
        return jsonResponse({
            error: '책 검색 API가 아직 준비되지 않았습니다.',
            code: 'BOOK_SEARCH_NOT_CONFIGURED',
            manualEntryAvailable: true
        }, 503, headers)
    }

    const now = Date.now()
    const lastRequestAt = lastRequestByUser.get(user.id) ?? 0
    if (now - lastRequestAt < MIN_REQUEST_INTERVAL_MS) {
        return jsonResponse({ error: '검색어를 천천히 입력해 주세요.' }, 429, headers)
    }
    lastRequestByUser.set(user.id, now)

    const query = cleanText(body.query, 80)
    if (query.length < 2) {
        return jsonResponse({ error: '책 제목을 두 글자 이상 입력해 주세요.' }, 400, headers)
    }

    const searchUrl = new URL('https://dapi.kakao.com/v3/search/book')
    searchUrl.searchParams.set('query', query)
    searchUrl.searchParams.set('sort', 'accuracy')
    searchUrl.searchParams.set('size', '12')

    try {
        const response = await fetch(searchUrl, {
            headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` }
        })
        if (!response.ok) {
            console.error(`Kakao book search failed: ${response.status}`)
            return jsonResponse({
                error: '책 검색 서비스에 잠시 연결할 수 없습니다.',
                manualEntryAvailable: true
            }, 502, headers)
        }

        const payload = await response.json()
        const books = (Array.isArray(payload?.documents) ? payload.documents : []).map((book: Record<string, unknown>) => {
            const isbn = parseIsbn(book.isbn)
            return {
                source: 'kakao',
                title: cleanText(book.title),
                authors: Array.isArray(book.authors) ? book.authors.map((author) => cleanText(author, 120)).filter(Boolean) : [],
                translators: Array.isArray(book.translators) ? book.translators.map((translator) => cleanText(translator, 120)).filter(Boolean) : [],
                publisher: cleanText(book.publisher, 160),
                publishedDate: cleanText(book.datetime, 40).slice(0, 10),
                thumbnailUrl: String(book.thumbnail ?? '').startsWith('https://') ? String(book.thumbnail).slice(0, 1000) : '',
                sourceUrl: String(book.url ?? '').startsWith('https://') ? String(book.url).slice(0, 1000) : '',
                isbn10: isbn.isbn10,
                isbn13: isbn.isbn13
            }
        }).filter((book: { title: string }) => book.title)

        return jsonResponse({ books, total: Number(payload?.meta?.total_count ?? books.length) }, 200, headers)
    } catch (error) {
        console.error('Book search request error:', error instanceof Error ? error.message : 'unknown')
        return jsonResponse({
            error: '책 검색 중 오류가 발생했습니다.',
            manualEntryAvailable: true
        }, 502, headers)
    }
})
