/**
 * 국립중앙도서관 서지정보(seoji) 조회.
 *
 * 왜 필요한가:
 *   구글 북스는 국내 아동도서 쪽수가 자주 비어 있다. 그때 교사가 손으로 채워 왔는데,
 *   국내 납본 서지에는 쪽수가 들어 있는 경우가 많아 그 자리를 줄인다.
 *
 * 주의:
 *   - 이 API 는 **ISBN 조회만** 신뢰할 수 있다. 같은 키로 소장자료 검색 API 도 열리지만
 *     한글 검색어가 제대로 전달되지 않는다(2026-09-17 확인). 제목 검색에 쓰지 말 것.
 *   - `PAGE` 값 표기가 제각각이다: "170 p.", "100", "343 p. : 삽화 ; 23 cm", "".
 *   - 전자책(FORM=전자책)은 쪽수가 비어 있는 것이 정상이다.
 */
import { normalizeIsbn } from './isbn.js'

const SEOJI_URL = 'https://www.nl.go.kr/seoji/SearchApi.do'
const MAX_PAGE_COUNT = 10000

/** "170 p. : 삽화 ; 23 cm" 처럼 섞여 오는 표기에서 본문 쪽수만 집어낸다. */
export function parseSeojiPageCount(value) {
    const text = String(value ?? '')
    if (!text.trim()) return null

    // "23 cm", "210*297" 같은 판형 표기가 쪽수로 읽히지 않도록 먼저 잘라낸다.
    const body = text.split(/[;:]/)[0].replace(/\d+\s*\*\s*\d+/g, ' ')
    // "32, 8 p." 처럼 여러 수가 나오면 본문 쪽수가 가장 큰 수다.
    let best = null
    for (const match of body.match(/\d{1,5}/g) ?? []) {
        const count = Number(match)
        if (count < 1 || count > MAX_PAGE_COUNT) continue
        if (best === null || count > best) best = count
    }
    return best
}

/** 응답 목록에서 요청한 ISBN 과 정확히 같은 종이책을 고른다. */
export function findSeojiRecord(payload, requestedIsbn) {
    const target = normalizeIsbn(requestedIsbn)
    if (!target) return null

    const docs = Array.isArray(payload?.docs) ? payload.docs : []
    const matches = docs.filter((doc) => (
        normalizeIsbn(doc?.EA_ISBN) === target || normalizeIsbn(doc?.SET_ISBN) === target
    ))
    if (matches.length === 0) return null

    // 같은 ISBN 이 종이책·전자책으로 갈리면 쪽수가 있는 종이책을 고른다.
    return matches.find((doc) => doc?.FORM === '종이책' && parseSeojiPageCount(doc?.PAGE) !== null)
        ?? matches.find((doc) => parseSeojiPageCount(doc?.PAGE) !== null)
        ?? matches[0]
}

export async function fetchSeojiBookInfo({ isbn, certKey, fetchImpl = fetch, signal } = {}) {
    const normalizedIsbn = normalizeIsbn(isbn)
    if (!normalizedIsbn || !certKey) return null

    const url = new URL(SEOJI_URL)
    url.searchParams.set('cert_key', certKey)
    url.searchParams.set('result_style', 'json')
    url.searchParams.set('page_no', '1')
    url.searchParams.set('page_size', '10')
    url.searchParams.set('isbn', normalizedIsbn)

    const response = await fetchImpl(url, { method: 'GET', signal })
    if (!response.ok) return null

    const record = findSeojiRecord(await response.json(), normalizedIsbn)
    if (!record) return null

    return {
        pageCount: parseSeojiPageCount(record.PAGE),
        title: String(record.TITLE ?? '').trim(),
        author: String(record.AUTHOR ?? '').trim(),
        publisher: String(record.PUBLISHER ?? '').trim(),
        publishedDate: String(record.PUBLISH_PREDATE ?? '').trim(),
        form: String(record.FORM ?? '').trim()
    }
}

export async function fetchSeojiPageCount(options) {
    const info = await fetchSeojiBookInfo(options)
    return info?.pageCount ?? null
}
