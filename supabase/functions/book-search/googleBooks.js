export function normalizeGoogleBooksIsbn(value) {
    const normalized = String(value ?? '').replace(/[^0-9X]/gi, '').toUpperCase()
    return normalized.length === 10 || normalized.length === 13 ? normalized : ''
}

export function findExactGoogleBooksPageCount(payload, requestedIsbn) {
    const target = normalizeGoogleBooksIsbn(requestedIsbn)
    if (!target) return null

    const items = Array.isArray(payload?.items) ? payload.items : []
    for (const item of items) {
        const info = item?.volumeInfo ?? {}
        const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : []
        const exactMatch = identifiers.some((entry) => (
            normalizeGoogleBooksIsbn(entry?.identifier) === target
        ))
        const pageCount = Number(info.pageCount)
        if (exactMatch && Number.isInteger(pageCount) && pageCount >= 1 && pageCount <= 10000) {
            return pageCount
        }
    }
    return null
}

export async function fetchGoogleBooksPageCount({ isbn, apiKey, fetchImpl = fetch, signal } = {}) {
    const normalizedIsbn = normalizeGoogleBooksIsbn(isbn)
    if (!normalizedIsbn || !apiKey) return null

    const url = new URL('https://www.googleapis.com/books/v1/volumes')
    url.searchParams.set('q', `isbn:${normalizedIsbn}`)
    url.searchParams.set('printType', 'books')
    url.searchParams.set('maxResults', '5')
    url.searchParams.set('fields', 'items(volumeInfo(industryIdentifiers,pageCount))')
    url.searchParams.set('key', apiKey)

    const response = await fetchImpl(url, { method: 'GET', signal })
    if (!response.ok) return null
    return findExactGoogleBooksPageCount(await response.json(), normalizedIsbn)
}
